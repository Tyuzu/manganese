import {
  DEFAULT_FILTERS,
  type EditorDocument,
  type ExportMime,
  type Geometry,
  type ProjectState,
  type RenderResult,
} from './types';

const WORKER_SOURCE = String.raw`
const sources = new Map();
const baseCache = new Map();
const cancelledJobs = new Set();

const CACHE_LIMIT = 4;
const TILE_ROWS = 128;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function getCrop(message, source) {
  const crop = message.crop || {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height
  };

  const x = clamp(Math.round(crop.x), 0, source.width - 1);
  const y = clamp(Math.round(crop.y), 0, source.height - 1);
  const width = clamp(
    Math.round(crop.width),
    1,
    source.width - x
  );
  const height = clamp(
    Math.round(crop.height),
    1,
    source.height - y
  );

  return { x, y, width, height };
}

function getBaseCanvas(message, source, width, height) {
  const crop = getCrop(message, source);
  const rotation = ((message.rotation || 0) % 360 + 360) % 360;
  const filters = message.filters || {};

  const cacheKey = JSON.stringify([
    message.docId,
    crop,
    rotation,
    !!message.flipX,
    !!message.flipY,
    width,
    height,
    filters.blur || 0
  ]);

  const cached = baseCache.get(cacheKey);

  if (cached) {
    baseCache.delete(cacheKey);
    baseCache.set(cacheKey, cached);
    return cached;
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true
  });

  if (!ctx) {
    throw new Error("Could not create the OffscreenCanvas 2D context.");
  }

  const swapped = rotation === 90 || rotation === 270;
  const rotatedWidth = swapped ? crop.height : crop.width;
  const rotatedHeight = swapped ? crop.width : crop.height;

  const scale = Math.min(
    width / rotatedWidth,
    height / rotatedHeight
  );

  ctx.save();

  ctx.translate(width / 2, height / 2);
  ctx.rotate(rotation * Math.PI / 180);

  ctx.scale(
    scale * (message.flipX ? -1 : 1),
    scale * (message.flipY ? -1 : 1)
  );

  const blur = Math.max(0, Number(filters.blur || 0));

  if (blur > 0) {
    ctx.filter = "blur(" + (blur * scale) + "px)";
  }

  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -crop.width / 2,
    -crop.height / 2,
    crop.width,
    crop.height
  );

  ctx.restore();

  baseCache.set(cacheKey, canvas);

  while (baseCache.size > CACHE_LIMIT) {
    const firstKey = baseCache.keys().next().value;
    baseCache.delete(firstKey);
  }

  return canvas;
}

function applyWebGL2(canvas, ctx, width, height, filters) {
  if (typeof OffscreenCanvas === "undefined") return false;
  if (Math.max(width, height) > 2048) return false;

  let glCanvas;
  let gl;

  try {
    glCanvas = new OffscreenCanvas(width, height);
    gl = glCanvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true
    });
  } catch {
    return false;
  }

  if (!gl) return false;

  const vertexSource =
    "#version 300 es\n" +
    "layout(location=0) in vec2 a_position;\n" +
    "layout(location=1) in vec2 a_uv;\n" +
    "out vec2 v_uv;\n" +
    "void main() {\n" +
    "  gl_Position = vec4(a_position, 0.0, 1.0);\n" +
    "  v_uv = a_uv;\n" +
    "}\n";

  const fragmentSource =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "uniform sampler2D u_texture;\n" +
    "uniform float u_brightness;\n" +
    "uniform float u_contrast;\n" +
    "uniform float u_saturation;\n" +
    "uniform float u_exposure;\n" +
    "uniform float u_temperature;\n" +
    "uniform float u_vignette;\n" +
    "in vec2 v_uv;\n" +
    "out vec4 outColor;\n" +
    "void main() {\n" +
    "  vec4 px = texture(u_texture, v_uv);\n" +
    "  vec3 c = px.rgb;\n" +
    "  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));\n" +
    "  c = mix(vec3(lum), c, u_saturation);\n" +
    "  c = (c - vec3(0.5)) * u_contrast + vec3(0.5);\n" +
    "  c *= u_exposure;\n" +
    "  c += vec3(u_brightness);\n" +
    "  c.r += u_temperature;\n" +
    "  c.b -= u_temperature;\n" +
    "  float d = distance(v_uv, vec2(0.5)) * 1.41421356;\n" +
    "  float edge = clamp((d - 0.25) / 0.75, 0.0, 1.0);\n" +
    "  c *= 1.0 - (u_vignette * edge * 0.85);\n" +
    "  outColor = vec4(clamp(c, 0.0, 1.0), px.a);\n" +
    "}\n";

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create shader.");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info || "Shader compile error.");
    }

    return shader;
  }

  let program;
  let texture;
  let buffer;

  try {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);

    program = gl.createProgram();

    if (!program) throw new Error("Could not create shader program.");

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Shader link failed.");
    }

    const input = ctx.getImageData(0, 0, width, height);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      input.data
    );

    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.useProgram(program);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);

    const getUniform = name => gl.getUniformLocation(program, name);

    gl.uniform1f(getUniform("u_brightness"), (filters.brightness || 0) / 100);
    gl.uniform1f(getUniform("u_contrast"), 1 + (filters.contrast || 0) / 100);
    gl.uniform1f(getUniform("u_saturation"), 1 + (filters.saturation || 0) / 100);
    gl.uniform1f(getUniform("u_exposure"), Math.pow(2, (filters.exposure || 0) / 100));
    gl.uniform1f(getUniform("u_temperature"), (filters.temperature || 0) * 0.6 / 255);
    gl.uniform1f(getUniform("u_vignette"), (filters.vignette || 0) / 100);

    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const pixels = new Uint8Array(width * height * 4);

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const flipped = new Uint8ClampedArray(pixels.length);
    const stride = width * 4;

    for (let y = 0; y < height; y++) {
      const srcStart = (height - 1 - y) * stride;
      const dstStart = y * stride;

      flipped.set(pixels.subarray(srcStart, srcStart + stride), dstStart);
    }

    ctx.putImageData(new ImageData(flipped, width, height), 0, 0);

    return true;
  } catch {
    return false;
  } finally {
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
  }
}

async function processPixels(canvas, ctx, message, maskCanvas, useGpu) {
  const width = canvas.width;
  const height = canvas.height;
  const filters = message.filters || {};
  const selective = !!message.maskEnabled && !!maskCanvas;

  if (useGpu && !selective) {
    const success = applyWebGL2(canvas, ctx, width, height, filters);
    if (success) return;
  }

  const brightness = (filters.brightness || 0) / 100 * 255;
  const contrast = 1 + (filters.contrast || 0) / 100;
  const saturation = 1 + (filters.saturation || 0) / 100;
  const exposure = Math.pow(2, (filters.exposure || 0) / 100);
  const temperature = (filters.temperature || 0) * 0.6;
  const vignette = (filters.vignette || 0) / 100;

  for (let top = 0; top < height; top += TILE_ROWS) {
    if (cancelledJobs.has(message.id)) return;

    const tileHeight = Math.min(TILE_ROWS, height - top);
    const image = ctx.getImageData(0, top, width, tileHeight);

    let maskData = null;

    if (selective && maskCanvas) {
      maskData = maskCanvas.getContext("2d", {
        willReadFrequently: true,
      }).getImageData(0, top, width, tileHeight).data;
    }

    const data = image.data;

    for (let y = 0; y < tileHeight; y++) {
      const fullY = top + y;
      const normalizedY = (fullY - height / 2) / Math.max(1, height / 2);

      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const originalR = data[i];
        const originalG = data[i + 1];
        const originalB = data[i + 2];

        const amount = selective && maskData ? maskData[i + 3] / 255 : 1;

        if (amount <= 0) continue;

        const luminance =
          originalR * 0.2126 +
          originalG * 0.7152 +
          originalB * 0.0722;

        let r = luminance + (originalR - luminance) * saturation;
        let g = luminance + (originalG - luminance) * saturation;
        let b = luminance + (originalB - luminance) * saturation;

        r = (r - 127.5) * contrast + 127.5;
        g = (g - 127.5) * contrast + 127.5;
        b = (b - 127.5) * contrast + 127.5;

        r = r * exposure + brightness + temperature;
        g = g * exposure + brightness;
        b = b * exposure + brightness - temperature;

        if (vignette > 0) {
          const nx = (x - width / 2) / Math.max(1, width / 2);
          const distance = Math.sqrt(nx * nx + normalizedY * normalizedY);
          const edge = clamp((distance - 0.25) / 0.75, 0, 1);
          const factor = 1 - vignette * edge * 0.85;

          r *= factor;
          g *= factor;
          b *= factor;
        }

        data[i] = clamp(originalR + (r - originalR) * amount, 0, 255);
        data[i + 1] = clamp(originalG + (g - originalG) * amount, 0, 255);
        data[i + 2] = clamp(originalB + (b - originalB) * amount, 0, 255);
      }
    }

    ctx.putImageData(image, 0, top);

    self.postMessage({
      id: message.id,
      progress: Math.min(1, (top + tileHeight) / height)
    });

    await tick();
  }
}

async function runRender(message) {
  const source = sources.get(message.docId);

  if (!source) {
    self.postMessage({
      id: message.id,
      error: "The source image is no longer available in the worker."
    });
    return;
  }

  let maskBitmap = message.maskBitmap || null;

  try {
    if (cancelledJobs.has(message.id)) {
      self.postMessage({ id: message.id, cancelled: true });
      return;
    }

    const width = Math.max(1, Math.round(message.width));
    const height = Math.max(1, Math.round(message.height));

    const base = getBaseCanvas(message, source, width, height);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: true
    });

    if (!ctx) throw new Error("Could not create output canvas context.");

    if (message.mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(base, 0, 0);

    let maskCanvas = null;

    if (maskBitmap) {
      maskCanvas = new OffscreenCanvas(width, height);
      const maskCtx = maskCanvas.getContext("2d", {
        alpha: true,
        willReadFrequently: true,
      });

      if (maskCtx) {
        maskCtx.drawImage(maskBitmap, 0, 0, width, height);
      }
    }

    if (maskBitmap && typeof maskBitmap.close === "function") {
      maskBitmap.close();
      maskBitmap = null;
    }

    const useGpu =
      !message.isExport &&
      !message.maskEnabled &&
      Math.max(width, height) <= 2048;

    await processPixels(canvas, ctx, message, maskCanvas, useGpu);

    if (cancelledJobs.has(message.id)) {
      self.postMessage({ id: message.id, cancelled: true });
      return;
    }

    const text = String(message.text || "").trim();

    if (text) {
      ctx.save();
      ctx.font = "bold " + Math.max(16, Math.round(width * 0.035)) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = Math.max(2, width * 0.004);
      ctx.fillText(text, width / 2, height - Math.max(18, height * 0.035));
      ctx.restore();
    }

    if (cancelledJobs.has(message.id)) {
      self.postMessage({ id: message.id, cancelled: true });
      return;
    }

    if (message.mime) {
      const blob = await canvas.convertToBlob({
        type: message.mime,
        quality: message.quality,
      });

      if (cancelledJobs.has(message.id)) {
        self.postMessage({ id: message.id, cancelled: true });
        return;
      }

      self.postMessage({
        id: message.id,
        blob,
        width,
        height,
      });
    } else {
      const bitmap = await createImageBitmap(canvas);

      if (cancelledJobs.has(message.id)) {
        bitmap.close();
        self.postMessage({ id: message.id, cancelled: true });
        return;
      }

      self.postMessage({
        id: message.id,
        bitmap,
        width,
        height,
      }, [bitmap]);
    }
  } catch (error) {
    self.postMessage({
      id: message.id,
      error: error && error.message ? error.message : String(error)
    });
  } finally {
    if (maskBitmap && typeof maskBitmap.close === "function") {
      maskBitmap.close();
    }

    cancelledJobs.delete(message.id);
  }
}

self.onmessage = event => {
  const message = event.data || {};

  if (message.type === "load") {
    const previous = sources.get(message.docId);

    if (previous && typeof previous.close === "function") {
      previous.close();
    }

    sources.set(message.docId, message.bitmap);
    return;
  }

  if (message.type === "unload") {
    const previous = sources.get(message.docId);

    if (previous && typeof previous.close === "function") {
      previous.close();
    }

    sources.delete(message.docId);

    for (const key of baseCache.keys()) {
      if (String(key).includes(message.docId)) {
        baseCache.delete(key);
      }
    }

    return;
  }

  if (message.type === "cancel") {
    cancelledJobs.add(message.id);
    return;
  }

  if (message.type === "render") {
    runRender(message);
  }
};
`;

export class WorkerRenderer {
  private worker: Worker | null = null;
  private nextId = 1;

  private pending = new Map<
    number,
    {
      resolve: (value: RenderResult) => void;
      reject: (error: Error) => void;
      onProgress?: (value: number) => void;
    }
  >();

  constructor() {
    if (
      typeof Worker === "undefined" ||
      typeof OffscreenCanvas === "undefined"
    ) {
      return;
    }

    try {
      const blob = new Blob([WORKER_SOURCE], {
        type: "text/javascript",
      });

      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);

      this.worker.onmessage = (event: MessageEvent) => {
        const message = event.data || {};
        const pending = this.pending.get(message.id);

        if (!pending) {
          if (message.bitmap) message.bitmap.close();
          return;
        }

        if (typeof message.progress === "number") {
          pending.onProgress?.(message.progress);
          return;
        }

        this.pending.delete(message.id);

        if (message.cancelled) {
          pending.reject(new DOMException("Render cancelled.", "AbortError"));
          return;
        }

        if (message.error) {
          pending.reject(new Error(message.error));
          return;
        }

        pending.resolve({
          bitmap: message.bitmap,
          blob: message.blob,
          width: message.width,
          height: message.height,
        });
      };

      this.worker.onerror = (event) => {
        const error = new Error(
          event.message || "Image renderer worker failed."
        );

        for (const item of this.pending.values()) {
          item.reject(error);
        }

        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  get available(): boolean {
    return !!this.worker;
  }

  load(docId: string, bitmap: ImageBitmap): void {
    if (!this.worker) {
      bitmap.close();
      return;
    }

    this.worker.postMessage(
      {
        type: "load",
        docId,
        bitmap,
      },
      [bitmap]
    );
  }

  unload(docId: string): void {
    this.worker?.postMessage({
      type: "unload",
      docId,
    });
  }

  render(
    payload: Record<string, unknown>,
    maskBitmap: ImageBitmap | null,
    onProgress?: (progress: number) => void
  ): { id: number; promise: Promise<RenderResult> } {
    if (!this.worker) {
      throw new Error("Worker renderer is not available.");
    }

    const id = this.nextId++;

    const promise = new Promise<RenderResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        onProgress,
      });
    });

    const message = {
      ...payload,
      type: "render",
      id,
      maskBitmap,
    };

    if (maskBitmap) {
      this.worker.postMessage(message, [maskBitmap]);
    } else {
      this.worker.postMessage(message);
    }

    return { id, promise };
  }

  cancel(id: number): void {
    this.worker?.postMessage({
      type: "cancel",
      id,
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;

    for (const item of this.pending.values()) {
      item.reject(new Error("Renderer disposed."));
    }

    this.pending.clear();
  }
}

export class BitmapCache {
  private values = new Map<string, ImageBitmap>();

  constructor(private limit = 8) {}

  get(key: string): ImageBitmap | undefined {
    const bitmap = this.values.get(key);

    if (!bitmap) return undefined;

    this.values.delete(key);
    this.values.set(key, bitmap);

    return bitmap;
  }

  set(key: string, bitmap: ImageBitmap): void {
    const previous = this.values.get(key);

    if (previous && previous !== bitmap) {
      previous.close();
    }

    this.values.delete(key);
    this.values.set(key, bitmap);

    while (this.values.size > this.limit) {
      const firstKey = this.values.keys().next().value;

      if (!firstKey) break;

      const firstBitmap = this.values.get(firstKey);
      firstBitmap?.close();

      this.values.delete(firstKey);
    }
  }

  clear(): void {
    for (const bitmap of this.values.values()) {
      bitmap.close();
    }

    this.values.clear();
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "doc-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

export function normalizedRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

export function getGeometry(doc: ProjectState): Geometry {
  const crop = doc.crop || {
    x: 0,
    y: 0,
    width: doc.width,
    height: doc.height,
  };

  const x = clamp(Math.round(crop.x), 0, doc.width - 1);
  const y = clamp(Math.round(crop.y), 0, doc.height - 1);

  const width = clamp(Math.round(crop.width), 1, doc.width - x);
  const height = clamp(Math.round(crop.height), 1, doc.height - y);

  const rotation = normalizedRotation(doc.rotation);
  const swapped = rotation === 90 || rotation === 270;

  return {
    crop: { x, y, width, height },
    width: swapped ? height : width,
    height: swapped ? width : height,
    rotation,
  };
}

export function stateFromDocument(doc: EditorDocument): ProjectState {
  return {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    filters: { ...doc.filters },
    crop: doc.crop ? { ...doc.crop } : null,
    rotation: doc.rotation,
    flipX: doc.flipX,
    flipY: doc.flipY,
    zoom: doc.zoom,
    panX: doc.panX,
    panY: doc.panY,
    brushSize: doc.brushSize,
    maskEnabled: doc.maskEnabled,
    text: doc.text,
  };
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed."));
      },
      type,
      quality
    );
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(
      reader.error || new Error("Could not encode project asset.")
    );

    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");

  if (comma < 0) {
    throw new Error("Invalid embedded project asset.");
  }

  const metadata = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const match = metadata.match(/^data:([^;]+);base64$/);

  if (!match) {
    throw new Error("Unsupported embedded project asset format.");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], {
    type: match[1],
  });
}

export function mimeExtension(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/avif": return "avif";
    default: return "png";
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function renderFallback(
  doc: EditorDocument,
  width: number,
  height: number,
  maskBitmap: ImageBitmap | null,
  mime: ExportMime | null,
  quality: number
): Promise<RenderResult> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true,
  });

  if (!ctx) throw new Error("Could not create fallback canvas.");

  if (mime === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }

  const geometry = getGeometry(doc);
  const scale = Math.min(
    width / geometry.width,
    height / geometry.height
  );

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(geometry.rotation * Math.PI / 180);
  ctx.scale(
    scale * (doc.flipX ? -1 : 1),
    scale * (doc.flipY ? -1 : 1)
  );

  if (doc.filters.blur > 0) {
    ctx.filter = "blur(" + (doc.filters.blur * scale) + "px)";
  }

  ctx.drawImage(
    doc.bitmap,
    geometry.crop.x,
    geometry.crop.y,
    geometry.crop.width,
    geometry.crop.height,
    -geometry.crop.width / 2,
    -geometry.crop.height / 2,
    geometry.crop.width,
    geometry.crop.height
  );

  ctx.restore();

  let maskCanvas: HTMLCanvasElement | null = null;

  if (maskBitmap) {
    maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;

    const maskContext = maskCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    maskContext?.drawImage(maskBitmap, 0, 0, width, height);
  }

  const filters = doc.filters;
  const tileRows = 128;

  for (let top = 0; top < height; top += tileRows) {
    const tileHeight = Math.min(tileRows, height - top);
    const image = ctx.getImageData(0, top, width, tileHeight);

    const maskData = doc.maskEnabled && maskCanvas
      ? maskCanvas.getContext("2d", {
          willReadFrequently: true,
        })!.getImageData(0, top, width, tileHeight).data
      : null;

    const data = image.data;
    const brightness = filters.brightness / 100 * 255;
    const contrast = 1 + filters.contrast / 100;
    const saturation = 1 + filters.saturation / 100;
    const exposure = Math.pow(2, filters.exposure / 100);
    const temperature = filters.temperature * 0.6;
    const vignette = filters.vignette / 100;

    for (let y = 0; y < tileHeight; y++) {
      const ny = (top + y - height / 2) / Math.max(1, height / 2);

      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const originalR = data[i];
        const originalG = data[i + 1];
        const originalB = data[i + 2];

        const amount = maskData ? maskData[i + 3] / 255 : 1;

        if (amount <= 0) continue;

        const luminance =
          originalR * 0.2126 +
          originalG * 0.7152 +
          originalB * 0.0722;

        let r = luminance + (originalR - luminance) * saturation;
        let g = luminance + (originalG - luminance) * saturation;
        let b = luminance + (originalB - luminance) * saturation;

        r = (r - 127.5) * contrast + 127.5;
        g = (g - 127.5) * contrast + 127.5;
        b = (b - 127.5) * contrast + 127.5;

        r = r * exposure + brightness + temperature;
        g = g * exposure + brightness;
        b = b * exposure + brightness - temperature;

        if (vignette > 0) {
          const nx = (x - width / 2) / Math.max(1, width / 2);
          const d = Math.sqrt(nx * nx + ny * ny);
          const edge = clamp((d - 0.25) / 0.75, 0, 1);
          const factor = 1 - vignette * edge * 0.85;

          r *= factor;
          g *= factor;
          b *= factor;
        }

        data[i] = clamp(originalR + (r - originalR) * amount, 0, 255);
        data[i + 1] = clamp(originalG + (g - originalG) * amount, 0, 255);
        data[i + 2] = clamp(originalB + (b - originalB) * amount, 0, 255);
      }
    }

    ctx.putImageData(image, 0, top);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  if (doc.text.trim()) {
    ctx.save();
    ctx.font = "bold " + Math.max(16, Math.round(width * 0.035)) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = Math.max(2, width * 0.004);
    ctx.fillText(doc.text, width / 2, height - Math.max(18, height * 0.035));
    ctx.restore();
  }

  if (mime) {
    const blob = await canvasToBlob(canvas, mime, quality);
    return { blob, width, height };
  }

  const bitmap = await createImageBitmap(canvas);
  return { bitmap, width, height };
}

export function createDefaultProjectState(doc: Pick<ProjectState, 'id' | 'name' | 'width' | 'height'>, state?: Partial<ProjectState>): ProjectState {
  return {
    id: state?.id ?? doc.id,
    name: state?.name ?? doc.name,
    width: doc.width,
    height: doc.height,
    filters: { ...DEFAULT_FILTERS, ...(state?.filters ?? {}) },
    crop: state?.crop ? { ...state.crop } : null,
    rotation: normalizedRotation(state?.rotation ?? 0),
    flipX: !!state?.flipX,
    flipY: !!state?.flipY,
    zoom: clamp(state?.zoom ?? 1, 0.25, 4),
    panX: state?.panX ?? 0,
    panY: state?.panY ?? 0,
    brushSize: clamp(state?.brushSize ?? 32, 2, 200),
    maskEnabled: !!state?.maskEnabled,
    text: state?.text ?? "",
  };
}

export const DEFAULT_EXPORT_MIME: ExportMime = "image/png";
