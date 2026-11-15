/* image-editor.ts
 *
 * Self-contained browser image editor.
 *
 * Includes:
 * - OffscreenCanvas rendering in a Web Worker
 * - Tiled pixel processing
 * - Cancellation of superseded worker jobs
 * - Optional WebGL2 preview colour adjustments
 * - Zoom-aware preview resolution
 * - LRU preview cache and worker geometry-stage cache
 * - IndexedDB document autosave
 * - Multiple open documents
 * - Portable JSON project export/import
 * - PNG, JPEG, WebP and AVIF export
 * - Crop, rotate, flip, colour adjustments, blur and vignette
 * - Optional painted adjustment mask
 *
 * No framework or third-party dependencies.
 */

type ExportMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/avif";

type FilterState = {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  temperature: number;
  blur: number;
  vignette: number;
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ProjectState = {
  id: string;
  name: string;
  width: number;
  height: number;
  filters: FilterState;
  crop: CropRect | null;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  zoom: number;
  brushSize: number;
  maskEnabled: boolean;
  text: string;
};

type StoredProject = {
  id: string;
  name: string;
  updatedAt: number;
  state: ProjectState;
  source: Blob;
  mask: Blob | null;
};

type EditorDocument = ProjectState & {
  source: Blob;
  bitmap: ImageBitmap;
  maskCanvas: HTMLCanvasElement;
  hasMask: boolean;
  maskRevision: number;
  revision: number;
};

type Geometry = {
  crop: CropRect;
  width: number;
  height: number;
  rotation: number;
};

type RenderResult = {
  bitmap?: ImageBitmap;
  blob?: Blob;
  width: number;
  height: number;
};

const DEFAULT_FILTERS: FilterState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  blur: 0,
  vignette: 0,
};

const FILTER_DEFINITIONS: Array<{
  key: keyof FilterState;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
  { key: "exposure", label: "Exposure", min: -100, max: 100, step: 1 },
  { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1 },
  { key: "blur", label: "Blur", min: 0, max: 20, step: 0.5 },
  { key: "vignette", label: "Vignette", min: 0, max: 100, step: 1 },
];

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

/*
 * Optional WebGL2 colour pass.
 * Used only for smaller, unmasked previews.
 * The CPU tiled path remains the fallback and is used for exports.
 */
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

    const getUniform = name =>
      gl.getUniformLocation(program, name);

    gl.uniform1f(
      getUniform("u_brightness"),
      (filters.brightness || 0) / 100
    );

    gl.uniform1f(
      getUniform("u_contrast"),
      1 + (filters.contrast || 0) / 100
    );

    gl.uniform1f(
      getUniform("u_saturation"),
      1 + (filters.saturation || 0) / 100
    );

    gl.uniform1f(
      getUniform("u_exposure"),
      Math.pow(2, (filters.exposure || 0) / 100)
    );

    gl.uniform1f(
      getUniform("u_temperature"),
      (filters.temperature || 0) * 0.6 / 255
    );

    gl.uniform1f(
      getUniform("u_vignette"),
      (filters.vignette || 0) / 100
    );

    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const pixels = new Uint8Array(width * height * 4);

    gl.readPixels(
      0,
      0,
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );

    /*
     * WebGL readPixels returns rows bottom-to-top.
     * Flip them before passing the pixels back to 2D canvas.
     */
    const flipped = new Uint8ClampedArray(pixels.length);
    const stride = width * 4;

    for (let y = 0; y < height; y++) {
      const srcStart = (height - 1 - y) * stride;
      const dstStart = y * stride;

      flipped.set(
        pixels.subarray(srcStart, srcStart + stride),
        dstStart
      );
    }

    ctx.putImageData(
      new ImageData(flipped, width, height),
      0,
      0
    );

    return true;
  } catch {
    return false;
  } finally {
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
  }
}

function processTile(data, maskData, width, startY, filters, selective) {
  const brightness = (filters.brightness || 0) / 100 * 255;
  const contrast = 1 + (filters.contrast || 0) / 100;
  const saturation = 1 + (filters.saturation || 0) / 100;
  const exposure = Math.pow(2, (filters.exposure || 0) / 100);
  const temperature = (filters.temperature || 0) * 0.6;
  const vignette = (filters.vignette || 0) / 100;

  const height = data.length / (width * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      const originalR = data[i];
      const originalG = data[i + 1];
      const originalB = data[i + 2];

      const amount = selective && maskData
        ? maskData[i + 3] / 255
        : 1;

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
        const px = (x - width / 2) / Math.max(1, width / 2);
        const py = (startY + y - (height * 0 + 0)) / 1;

        /*
         * The caller supplies the full-image vertical position
         * by adjusting this value after the tile is read.
         */
        const normalizedY = py;
        const distance = Math.sqrt(px * px + normalizedY * normalizedY);
        const edge = clamp((distance - 0.25) / 0.75, 0, 1);
        const factor = 1 - vignette * edge * 0.85;

        r *= factor;
        g *= factor;
        b *= factor;
      }

      data[i]     = clamp(originalR + (r - originalR) * amount, 0, 255);
      data[i + 1] = clamp(originalG + (g - originalG) * amount, 0, 255);
      data[i + 2] = clamp(originalB + (b - originalB) * amount, 0, 255);
    }
  }
}

async function processPixels(
  canvas,
  ctx,
  message,
  maskCanvas,
  useGpu
) {
  const width = canvas.width;
  const height = canvas.height;
  const filters = message.filters || {};
  const selective = !!message.maskEnabled && !!maskCanvas;

  if (useGpu && !selective) {
    const success = applyWebGL2(
      canvas,
      ctx,
      width,
      height,
      filters
    );

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

    const image = ctx.getImageData(
      0,
      top,
      width,
      tileHeight
    );

    let maskData = null;

    if (selective && maskCanvas) {
      maskData = maskCanvas.getContext("2d", {
        willReadFrequently: true
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

        const amount = selective && maskData
          ? maskData[i + 3] / 255
          : 1;

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
        willReadFrequently: true
      });

      if (maskCtx) {
        maskCtx.drawImage(maskBitmap, 0, 0, width, height);
      }
    }

    if (maskBitmap && typeof maskBitmap.close === "function") {
      maskBitmap.close();
      maskBitmap = null;
    }

    const filters = message.filters || {};

    const useGpu =
      !message.isExport &&
      !message.maskEnabled &&
      Math.max(width, height) <= 2048;

    await processPixels(
      canvas,
      ctx,
      message,
      maskCanvas,
      useGpu
    );

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
        quality: message.quality
      });

      if (cancelledJobs.has(message.id)) {
        self.postMessage({ id: message.id, cancelled: true });
        return;
      }

      self.postMessage({
        id: message.id,
        blob,
        width,
        height
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
        height
      }, [bitmap]);
    }
  } catch (error) {
    self.postMessage({
      id: message.id,
      error: error && error.message
        ? error.message
        : String(error)
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

class WorkerRenderer {
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

class ProjectDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("IndexedDB is unavailable."));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("image-studio-projects", 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("projects")) {
          db.createObjectStore("projects", {
            keyPath: "id",
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("Could not open project database.")
      );
    });

    return this.dbPromise;
  }

  async put(project: StoredProject): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");

      transaction.objectStore("projects").put(project);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error || new Error("Project save failed.")
      );
      transaction.onabort = () => reject(
        transaction.error || new Error("Project save was aborted.")
      );
    });
  }

  async get(id: string): Promise<StoredProject | undefined> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const request = db
        .transaction("projects", "readonly")
        .objectStore("projects")
        .get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("Could not load project.")
      );
    });
  }

  async all(): Promise<StoredProject[]> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const request = db
        .transaction("projects", "readonly")
        .objectStore("projects")
        .getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(
        request.error || new Error("Could not list projects.")
      );
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");

      transaction.objectStore("projects").delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error || new Error("Could not delete project.")
      );
    });
  }
}

class BitmapCache {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "doc-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function normalizedRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function getGeometry(doc: ProjectState): Geometry {
  const crop = doc.crop || {
    x: 0,
    y: 0,
    width: doc.width,
    height: doc.height,
  };

  const x = clamp(Math.round(crop.x), 0, doc.width - 1);
  const y = clamp(Math.round(crop.y), 0, doc.height - 1);

  const width = clamp(
    Math.round(crop.width),
    1,
    doc.width - x
  );

  const height = clamp(
    Math.round(crop.height),
    1,
    doc.height - y
  );

  const rotation = normalizedRotation(doc.rotation);
  const swapped = rotation === 90 || rotation === 270;

  return {
    crop: { x, y, width, height },
    width: swapped ? height : width,
    height: swapped ? width : height,
    rotation,
  };
}

function stateFromDocument(doc: EditorDocument): ProjectState {
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
    brushSize: doc.brushSize,
    maskEnabled: doc.maskEnabled,
    text: doc.text,
  };
}

function canvasToBlob(
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(
      reader.error || new Error("Could not encode project asset.")
    );

    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
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

function mimeExtension(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/avif": return "avif";
    default: return "png";
  }
}

function downloadBlob(blob: Blob, filename: string): void {
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

/*
 * Fallback renderer for browsers that do not support workers with
 * OffscreenCanvas. The primary renderer remains the worker above.
 */
async function renderFallback(
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
    ctx.fillText(
      doc.text,
      width / 2,
      height - Math.max(18, height * 0.035)
    );
    ctx.restore();
  }

  if (mime) {
    const blob = await canvasToBlob(canvas, mime, quality);

    return {
      blob,
      width,
      height,
    };
  }

  const bitmap = await createImageBitmap(canvas);

  return {
    bitmap,
    width,
    height,
  };
}

export function createImageEditorPage(): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "image-studio";

  const style = document.createElement("style");

  style.textContent = `
    .image-studio {
      --ie-bg: #101216;
      --ie-panel: #181c22;
      --ie-panel-2: #202630;
      --ie-border: #303844;
      --ie-text: #e8edf4;
      --ie-muted: #929baa;
      --ie-accent: #79a9ff;
      --ie-radius: 10px;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: min(900px, 100%);
      min-height: 620px;
      overflow: hidden;
      background: var(--ie-bg);
      color: var(--ie-text);
      border: 1px solid var(--ie-border);
      border-radius: 12px;
      font: 13px/1.4 Inter, ui-sans-serif, system-ui, sans-serif;
      box-sizing: border-box;
    }

    .image-studio * {
      box-sizing: border-box;
    }

    .ie-topbar {
      display: flex;
      align-items: center;
      gap: 9px;
      flex-wrap: wrap;
      padding: 10px 12px;
      background: var(--ie-panel);
      border-bottom: 1px solid var(--ie-border);
    }

    .ie-brand {
      font-weight: 800;
      letter-spacing: .08em;
      margin-right: auto;
      color: #fff;
      white-space: nowrap;
    }

    .ie-brand span {
      color: var(--ie-accent);
    }

    .ie-button {
      border: 1px solid var(--ie-border);
      color: var(--ie-text);
      background: var(--ie-panel-2);
      border-radius: 7px;
      padding: 7px 10px;
      cursor: pointer;
      font: inherit;
      white-space: nowrap;
    }

    .ie-button:hover {
      border-color: #66768d;
      background: #2a3442;
    }

    .ie-button.primary {
      background: #315f9d;
      border-color: #477fca;
      color: white;
    }

    .ie-button.active {
      border-color: var(--ie-accent);
      color: var(--ie-accent);
      background: #24364e;
    }

    .ie-button:disabled {
      opacity: .4;
      cursor: not-allowed;
    }

    .ie-status {
      color: var(--ie-muted);
      min-width: 120px;
      text-align: right;
      font-size: 11px;
    }

    .ie-tabs {
      display: flex;
      align-items: center;
      gap: 5px;
      min-height: 38px;
      padding: 4px 8px;
      overflow-x: auto;
      background: #14181e;
      border-bottom: 1px solid var(--ie-border);
    }

    .ie-tab {
      border: 1px solid transparent;
      color: var(--ie-muted);
      background: transparent;
      border-radius: 6px;
      padding: 6px 10px;
      max-width: 190px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      font: inherit;
    }

    .ie-tab.active {
      color: white;
      border-color: var(--ie-border);
      background: var(--ie-panel-2);
    }

    .ie-layout {
      display: grid;
      grid-template-columns: 218px minmax(0, 1fr) 250px;
      flex: 1;
      min-height: 0;
    }

    .ie-sidebar {
      background: var(--ie-panel);
      overflow: auto;
      padding: 14px;
    }

    .ie-sidebar.left {
      border-right: 1px solid var(--ie-border);
    }

    .ie-sidebar.right {
      border-left: 1px solid var(--ie-border);
    }

    .ie-section {
      margin-bottom: 19px;
    }

    .ie-section-title {
      color: #b9c2d0;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .12em;
      margin: 0 0 10px;
    }

    .ie-button-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .ie-button-row .ie-button {
      flex: 1;
    }

    .ie-field {
      display: block;
      margin: 0 0 13px;
    }

    .ie-field-label {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: #cbd3de;
      font-size: 11px;
      margin-bottom: 5px;
    }

    .ie-value {
      color: var(--ie-accent);
      font-variant-numeric: tabular-nums;
    }

    .ie-field input[type="range"] {
      width: 100%;
      accent-color: var(--ie-accent);
      cursor: pointer;
    }

    .ie-field input[type="number"],
    .ie-field input[type="text"],
    .ie-field select,
    .ie-select {
      width: 100%;
      border: 1px solid var(--ie-border);
      background: #11161d;
      color: var(--ie-text);
      border-radius: 6px;
      padding: 7px;
      font: inherit;
    }

    .ie-check {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 9px 0;
      color: #cbd3de;
      font-size: 12px;
    }

    .ie-check input {
      accent-color: var(--ie-accent);
    }

    .ie-workspace {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background:
        radial-gradient(circle at 50% 40%, #252b35 0%, #171b22 65%, #12161c 100%);
    }

    .ie-workspace-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      color: var(--ie-muted);
      background: rgba(15, 19, 25, .55);
      border-bottom: 1px solid rgba(255,255,255,.05);
    }

    .ie-canvas-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .ie-canvas-frame {
      position: relative;
      flex: 0 0 auto;
      background-color: #fff;
      background-image:
        linear-gradient(45deg, #ddd 25%, transparent 25%),
        linear-gradient(-45deg, #ddd 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ddd 75%),
        linear-gradient(-45deg, transparent 75%, #ddd 75%);
      background-size: 18px 18px;
      background-position:
        0 0, 0 9px, 9px -9px, -9px 0;
      box-shadow: 0 12px 40px rgba(0,0,0,.4);
    }

    .ie-canvas-frame canvas {
      display: block;
    }

    .ie-main-canvas {
      touch-action: none;
      user-select: none;
    }

    .ie-mask-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: .55;
      display: none;
    }

    .ie-empty {
      margin: auto;
      text-align: center;
      color: var(--ie-muted);
      max-width: 390px;
      padding: 30px;
    }

    .ie-empty strong {
      color: white;
      display: block;
      font-size: 18px;
      margin-bottom: 8px;
    }

    .ie-crop-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
    }

    .ie-small-note {
      color: var(--ie-muted);
      font-size: 10px;
      line-height: 1.5;
      margin-top: 7px;
    }

    .ie-footer {
      padding: 7px 12px;
      border-top: 1px solid var(--ie-border);
      color: var(--ie-muted);
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }

    @media (max-width: 900px) {
      .ie-layout {
        grid-template-columns: 180px minmax(0, 1fr);
      }

      .ie-sidebar.right {
        grid-column: 1 / -1;
        border-left: 0;
        border-top: 1px solid var(--ie-border);
        max-height: 260px;
      }
    }

    @media (max-width: 600px) {
      .ie-layout {
        grid-template-columns: 1fr;
      }

      .ie-sidebar.left {
        display: none;
      }

      .ie-sidebar.right {
        max-height: 300px;
      }

      .ie-workspace {
        min-height: 350px;
      }

      .ie-status {
        width: 100%;
        text-align: left;
      }
    }
  `;

  root.appendChild(style);

  root.insertAdjacentHTML("beforeend", `
    <header class="ie-topbar">
      <div class="ie-brand">PIXEL<span>STUDIO</span></div>

      <button class="ie-button" data-action="open">Open image</button>
      <button class="ie-button" data-action="import-project">Import project</button>
      <button class="ie-button" data-action="save-project">Export project JSON</button>

      <select class="ie-select" data-role="saved-projects" style="width:150px">
        <option value="">Saved projects</option>
      </select>

      <select class="ie-select" data-role="export-format" style="width:95px">
        <option value="image/png">PNG</option>
        <option value="image/jpeg">JPEG</option>
        <option value="image/webp">WebP</option>
        <option value="image/avif">AVIF</option>
      </select>

      <button class="ie-button primary" data-action="export">Export image</button>

      <span class="ie-status" data-role="status">Ready</span>

      <input data-role="file-input" type="file" accept="image/*" multiple hidden>
      <input data-role="project-input" type="file" accept=".json,application/json" hidden>
    </header>

    <nav class="ie-tabs" data-role="tabs"></nav>

    <div class="ie-layout">
      <aside class="ie-sidebar left">
        <section class="ie-section">
          <h3 class="ie-section-title">Transform</h3>

          <div class="ie-button-row">
            <button class="ie-button" data-action="rotate-left">↶ Rotate</button>
            <button class="ie-button" data-action="rotate-right">Rotate ↷</button>
          </div>

          <div class="ie-button-row" style="margin-top:7px">
            <button class="ie-button" data-action="flip-x">Flip H</button>
            <button class="ie-button" data-action="flip-y">Flip V</button>
          </div>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Crop · source pixels</h3>

          <div class="ie-crop-grid">
            <label class="ie-field">
              <span class="ie-field-label">X</span>
              <input type="number" data-role="crop-x" min="0" value="0">
            </label>

            <label class="ie-field">
              <span class="ie-field-label">Y</span>
              <input type="number" data-role="crop-y" min="0" value="0">
            </label>

            <label class="ie-field">
              <span class="ie-field-label">Width</span>
              <input type="number" data-role="crop-width" min="1" value="1">
            </label>

            <label class="ie-field">
              <span class="ie-field-label">Height</span>
              <input type="number" data-role="crop-height" min="1" value="1">
            </label>
          </div>

          <div class="ie-button-row">
            <button class="ie-button" data-action="apply-crop">Apply crop</button>
            <button class="ie-button" data-action="reset-crop">Reset</button>
          </div>

          <p class="ie-small-note">
            Crop coordinates refer to the original image, before rotation.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Mask brush</h3>

          <button class="ie-button" data-action="toggle-brush" style="width:100%">
            Enable mask brush
          </button>

          <label class="ie-field" style="margin-top:12px">
            <span class="ie-field-label">
              Brush size
              <span class="ie-value" data-role="brush-value">32 px</span>
            </span>
            <input type="range" data-role="brush-size" min="2" max="200" value="32">
          </label>

          <label class="ie-check">
            <input type="checkbox" data-role="mask-enabled">
            Apply adjustments only to mask
          </label>

          <button class="ie-button" data-action="clear-mask" style="width:100%">
            Clear mask
          </button>

          <p class="ie-small-note">
            Paint on the image to define where adjustments are applied.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">View</h3>

          <label class="ie-field">
            <span class="ie-field-label">
              Zoom
              <span class="ie-value" data-role="zoom-value">100%</span>
            </span>
            <input type="range" data-role="zoom" min="25" max="400" value="100" step="5">
          </label>

          <button class="ie-button" data-action="fit" style="width:100%">
            Fit image
          </button>
        </section>
      </aside>

      <main class="ie-workspace">
        <div class="ie-workspace-toolbar">
          <span data-role="document-info">No image open</span>
          <span style="margin-left:auto" data-role="render-info"></span>
        </div>

        <div class="ie-canvas-scroll" data-role="canvas-scroll">
          <div class="ie-empty" data-role="empty">
            <strong>Open an image to begin</strong>
            Your original image remains unchanged. Edits are stored as project settings.
          </div>

          <div class="ie-canvas-frame" data-role="canvas-frame" hidden>
            <canvas class="ie-main-canvas" data-role="canvas"></canvas>
            <canvas class="ie-mask-overlay" data-role="mask-overlay"></canvas>
          </div>
        </div>
      </main>

      <aside class="ie-sidebar right">
        <section class="ie-section">
          <h3 class="ie-section-title">Adjustments</h3>
          <div data-role="filter-controls"></div>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Text overlay</h3>

          <label class="ie-field">
            <span class="ie-field-label">Bottom watermark / caption</span>
            <input type="text" data-role="text" placeholder="Enter text...">
          </label>

          <p class="ie-small-note">
            Text is rendered during preview and export.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Export quality</h3>

          <label class="ie-field">
            <span class="ie-field-label">
              Quality
              <span class="ie-value" data-role="quality-value">92%</span>
            </span>
            <input type="range" data-role="quality" min="10" max="100" value="92">
          </label>

          <p class="ie-small-note">
            Quality affects JPEG, WebP and AVIF. PNG is lossless.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Project</h3>

          <div class="ie-button-row">
            <button class="ie-button" data-action="reset">Reset edits</button>
            <button class="ie-button" data-action="close">Close document</button>
          </div>
        </section>
      </aside>
    </div>

    <footer class="ie-footer">
      <span>Worker rendering · Tiled processing · IndexedDB autosave</span>
      <span data-role="engine-status">Checking renderer…</span>
    </footer>
  `);

  const renderer = new WorkerRenderer();
  const database = new ProjectDatabase();
  const bitmapCache = new BitmapCache(8);

  const documents = new Map<string, EditorDocument>();

  let activeId: string | null = null;
  let activeJob = 0;
  let renderVersion = 0;
  let renderTimer = 0;
  let animationFrame = 0;
  let autosaveTimer = 0;
  let brushActive = false;
  let painting = false;
  let lastPaintPoint: { x: number; y: number } | null = null;

  const query = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);

    if (!element) {
      throw new Error("Missing editor element: " + selector);
    }

    return element;
  };

  const statusElement = query<HTMLElement>('[data-role="status"]');
  const engineStatus = query<HTMLElement>('[data-role="engine-status"]');

  const canvas = query<HTMLCanvasElement>('[data-role="canvas"]');
  const overlayCanvas = query<HTMLCanvasElement>('[data-role="mask-overlay"]');
  const canvasFrame = query<HTMLDivElement>('[data-role="canvas-frame"]');

  const emptyState = query<HTMLDivElement>('[data-role="empty"]');
  const tabsElement = query<HTMLElement>('[data-role="tabs"]');
  const filterControls = query<HTMLDivElement>('[data-role="filter-controls"]');

  const fileInput = query<HTMLInputElement>('[data-role="file-input"]');
  const projectInput = query<HTMLInputElement>('[data-role="project-input"]');

  const fileFormat = query<HTMLSelectElement>('[data-role="export-format"]');
  const savedProjects = query<HTMLSelectElement>('[data-role="saved-projects"]');

  const canvasContext = canvas.getContext("2d") as CanvasRenderingContext2D | null;

  if (!canvasContext) {
    throw new Error("Could not initialize editor canvas.");
  }

  for (const definition of FILTER_DEFINITIONS) {
    const field = document.createElement("label");
    field.className = "ie-field";

    field.innerHTML = `
      <span class="ie-field-label">
        <span>${definition.label}</span>
        <span class="ie-value" data-filter-value="${definition.key}">0</span>
      </span>
      <input
        type="range"
        data-filter="${definition.key}"
        min="${definition.min}"
        max="${definition.max}"
        step="${definition.step}"
        value="0"
      >
    `;

    filterControls.appendChild(field);
  }

  function setStatus(message: string): void {
    statusElement.textContent = message;
  }

  function activeDocument(): EditorDocument | null {
    if (!activeId) return null;
    return documents.get(activeId) || null;
  }

  function updateRevision(doc: EditorDocument): void {
    doc.revision++;
    scheduleRender(45);
    scheduleAutosave();
    renderTabs();
  }

  function resizeMaskCanvas(
    doc: EditorDocument,
    preserve = true
  ): void {
    const geometry = getGeometry(doc);

    if (
      doc.maskCanvas.width === geometry.width &&
      doc.maskCanvas.height === geometry.height
    ) {
      return;
    }

    const oldCanvas = doc.maskCanvas;
    const newCanvas = document.createElement("canvas");

    newCanvas.width = geometry.width;
    newCanvas.height = geometry.height;

    const ctx = newCanvas.getContext("2d");

    if (ctx && preserve && doc.hasMask) {
      ctx.drawImage(
        oldCanvas,
        0,
        0,
        oldCanvas.width,
        oldCanvas.height,
        0,
        0,
        newCanvas.width,
        newCanvas.height
      );
    }

    doc.maskCanvas = newCanvas;
    doc.maskRevision++;
  }

  function renderTabs(): void {
    tabsElement.replaceChildren();

    for (const doc of documents.values()) {
      const button = document.createElement("button");
      button.className = "ie-tab" + (doc.id === activeId ? " active" : "");
      button.textContent = doc.name;
      button.title = doc.name;

      button.addEventListener("click", () => {
        activateDocument(doc.id);
      });

      tabsElement.appendChild(button);
    }
  }

  function updateControls(): void {
    const doc = activeDocument();

    const controls = root.querySelectorAll<
      HTMLInputElement
    >("[data-filter]");

    if (!doc) {
      query<HTMLElement>('[data-role="document-info"]').textContent =
        "No image open";

      query<HTMLElement>('[data-role="empty"]').hidden = false;
      canvasFrame.hidden = true;

      return;
    }

    emptyState.hidden = true;
    canvasFrame.hidden = false;

    query<HTMLElement>('[data-role="document-info"]').textContent =
      doc.name + " · " + doc.width + " × " + doc.height;

    for (const input of controls) {
      const key = input.dataset.filter as keyof FilterState;

      input.value = String(doc.filters[key]);

      const value = root.querySelector<HTMLElement>(
        '[data-filter-value="' + key + '"]'
      );

      if (value) {
        value.textContent = String(doc.filters[key]);
      }
    }

    query<HTMLInputElement>('[data-role="zoom"]').value =
      String(Math.round(doc.zoom * 100));

    query<HTMLElement>('[data-role="zoom-value"]').textContent =
      Math.round(doc.zoom * 100) + "%";

    query<HTMLInputElement>('[data-role="brush-size"]').value =
      String(doc.brushSize);

    query<HTMLElement>('[data-role="brush-value"]').textContent =
      doc.brushSize + " px";

    query<HTMLInputElement>('[data-role="mask-enabled"]').checked =
      doc.maskEnabled;

    query<HTMLInputElement>('[data-role="text"]').value =
      doc.text;

    const crop = doc.crop || {
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
    };

    query<HTMLInputElement>('[data-role="crop-x"]').value = String(crop.x);
    query<HTMLInputElement>('[data-role="crop-y"]').value = String(crop.y);
    query<HTMLInputElement>('[data-role="crop-width"]').value = String(crop.width);
    query<HTMLInputElement>('[data-role="crop-height"]').value = String(crop.height);

    root.querySelector<HTMLButtonElement>(
      '[data-action="toggle-brush"]'
    )?.classList.toggle("active", brushActive);

    root.querySelector<HTMLButtonElement>(
      '[data-action="toggle-brush"]'
    )!.textContent = brushActive
      ? "Disable mask brush"
      : "Enable mask brush";

    canvas.style.cursor = brushActive ? "crosshair" : "default";
  }

  function updateMaskOverlay(doc: EditorDocument): void {
    if (!brushActive || !doc.hasMask || canvas.width < 1 || canvas.height < 1) {
      overlayCanvas.style.display = "none";
      return;
    }

    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;

    const ctx = overlayCanvas.getContext("2d");

    if (!ctx) return;

    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    ctx.drawImage(
      doc.maskCanvas,
      0,
      0,
      overlayCanvas.width,
      overlayCanvas.height
    );

    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "rgba(255, 65, 65, 0.8)";
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    ctx.globalCompositeOperation = "source-over";

    overlayCanvas.style.display = "block";
  }

  function drawPreview(bitmap: ImageBitmap, doc: EditorDocument): void {
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      overlayCanvas.width = bitmap.width;
      overlayCanvas.height = bitmap.height;
    }

    const ctx = canvasContext;
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);

    const geometry = getGeometry(doc);
    const fit = Math.min(
      1,
      1080 / geometry.width,
      720 / geometry.height
    );

    const cssWidth = Math.max(1, geometry.width * fit * doc.zoom);
    const cssHeight = Math.max(1, geometry.height * fit * doc.zoom);

    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";

    overlayCanvas.style.width = cssWidth + "px";
    overlayCanvas.style.height = cssHeight + "px";

    canvasFrame.style.width = cssWidth + "px";
    canvasFrame.style.height = cssHeight + "px";

    updateMaskOverlay(doc);

    query<HTMLElement>('[data-role="render-info"]').textContent =
      bitmap.width + " × " + bitmap.height + " preview";
  }

  function getPreviewDimensions(doc: EditorDocument): {
    width: number;
    height: number;
  } {
    const geometry = getGeometry(doc);

    const fit = Math.min(
      1,
      1080 / geometry.width,
      720 / geometry.height
    );

    const dpr = Math.min(2, window.devicePixelRatio || 1);

    /*
     * At low zoom, fewer pixels are needed.
     * At high zoom, the preview gains resolution up to the source resolution.
     * The 3072px cap avoids needlessly large preview surfaces.
     */
    const scale = Math.min(
      1,
      3072 / Math.max(geometry.width, geometry.height),
      Math.max(0.05, fit * doc.zoom * dpr)
    );

    return {
      width: Math.max(1, Math.round(geometry.width * scale)),
      height: Math.max(1, Math.round(geometry.height * scale)),
    };
  }

  function previewCacheKey(
    doc: EditorDocument,
    width: number,
    height: number
  ): string {
    return JSON.stringify({
      id: doc.id,
      width,
      height,
      filters: doc.filters,
      crop: doc.crop,
      rotation: doc.rotation,
      flipX: doc.flipX,
      flipY: doc.flipY,
      maskEnabled: doc.maskEnabled,
      maskRevision: doc.maskRevision,
      hasMask: doc.hasMask,
      text: doc.text,
    });
  }

  async function renderPreview(): Promise<void> {
    const doc = activeDocument();

    if (!doc) return;

    const currentVersion = ++renderVersion;

    if (activeJob) {
      renderer.cancel(activeJob);
      activeJob = 0;
    }

    const dimensions = getPreviewDimensions(doc);
    const { width, height } = dimensions;

    const key = previewCacheKey(doc, width, height);
    const cached = bitmapCache.get(key);

    if (cached) {
      drawPreview(cached, doc);
      return;
    }

    setStatus("Rendering preview…");

    let maskBitmap: ImageBitmap | null = null;

    try {
      if (doc.hasMask && doc.maskEnabled) {
        maskBitmap = await createImageBitmap(doc.maskCanvas);
      }

      if (currentVersion !== renderVersion) {
        maskBitmap?.close();
        return;
      }

      let result: RenderResult;

      if (renderer.available) {
        const render = renderer.render(
          {
            docId: doc.id,
            width,
            height,
            crop: getGeometry(doc).crop,
            rotation: doc.rotation,
            flipX: doc.flipX,
            flipY: doc.flipY,
            filters: { ...doc.filters },
            maskEnabled: doc.maskEnabled,
            isExport: false,
            text: doc.text,
          },
          maskBitmap
        );

        maskBitmap = null;
        activeJob = render.id;

        result = await render.promise;

        if (activeJob === render.id) {
          activeJob = 0;
        }
      } else {
        result = await renderFallback(
          doc,
          width,
          height,
          maskBitmap,
          null,
          0.92
        );

        maskBitmap?.close();
        maskBitmap = null;
      }

      if (!result.bitmap) {
        throw new Error("Preview renderer returned no bitmap.");
      }

      if (currentVersion !== renderVersion) {
        result.bitmap.close();
        return;
      }

      bitmapCache.set(key, result.bitmap);
      drawPreview(result.bitmap, doc);

      setStatus("Preview updated");
    } catch (error) {
      maskBitmap?.close();

      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      setStatus(
        error instanceof Error
          ? error.message
          : "Rendering failed"
      );
    }
  }

  function scheduleRender(delay = 55): void {
    window.clearTimeout(renderTimer);

    renderTimer = window.setTimeout(() => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = requestAnimationFrame(() => {
        void renderPreview();
      });
    }, delay);
  }

  async function saveDocument(doc: EditorDocument): Promise<void> {
    try {
      let maskBlob: Blob | null = null;

      if (doc.hasMask) {
        maskBlob = await canvasToBlob(doc.maskCanvas, "image/png");
      }

      const record: StoredProject = {
        id: doc.id,
        name: doc.name,
        updatedAt: Date.now(),
        state: stateFromDocument(doc),
        source: doc.source,
        mask: maskBlob,
      };

      await database.put(record);

      setStatus("Saved locally");
      refreshSavedProjects();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? "Autosave failed: " + error.message
          : "Autosave failed"
      );
    }
  }

  function scheduleAutosave(): void {
    window.clearTimeout(autosaveTimer);

    autosaveTimer = window.setTimeout(() => {
      const doc = activeDocument();

      if (doc) {
        void saveDocument(doc);
      }
    }, 550);
  }

  async function refreshSavedProjects(): Promise<void> {
    try {
      const records = await database.all();

      records.sort((a, b) => b.updatedAt - a.updatedAt);

      savedProjects.replaceChildren();

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Saved projects";
      savedProjects.appendChild(placeholder);

      for (const record of records) {
        const option = document.createElement("option");
        option.value = record.id;

        const date = new Date(record.updatedAt);

        option.textContent =
          record.name + " · " +
          date.toLocaleDateString();

        savedProjects.appendChild(option);
      }
    } catch {
      // IndexedDB may be disabled. Editing still works for this session.
    }
  }

  async function registerDocument(doc: EditorDocument): Promise<void> {
    documents.set(doc.id, doc);

    if (renderer.available) {
      const workerBitmap = await createImageBitmap(doc.bitmap);
      renderer.load(doc.id, workerBitmap);
    }

    activeId = doc.id;

    renderTabs();
    updateControls();
    scheduleRender(0);
    scheduleAutosave();
  }

  async function createDocumentFromBlob(
    blob: Blob,
    name: string,
    state?: Partial<ProjectState>,
    maskBlob?: Blob | null
  ): Promise<EditorDocument> {
    const bitmap = await createImageBitmap(blob);

    const doc: EditorDocument = {
      id: state?.id || createId(),
      name: state?.name || name,
      width: bitmap.width,
      height: bitmap.height,
      filters: {
        ...DEFAULT_FILTERS,
        ...(state?.filters || {}),
      },
      crop: state?.crop ? { ...state.crop } : null,
      rotation: normalizedRotation(state?.rotation || 0),
      flipX: !!state?.flipX,
      flipY: !!state?.flipY,
      zoom: clamp(state?.zoom || 1, 0.25, 4),
      brushSize: clamp(state?.brushSize || 32, 2, 200),
      maskEnabled: !!state?.maskEnabled,
      text: state?.text || "",
      source: blob,
      bitmap,
      maskCanvas: document.createElement("canvas"),
      hasMask: false,
      maskRevision: 0,
      revision: 0,
    };

    const geometry = getGeometry(doc);

    doc.maskCanvas.width = geometry.width;
    doc.maskCanvas.height = geometry.height;

    if (maskBlob) {
      const maskBitmap = await createImageBitmap(maskBlob);
      const maskCtx = doc.maskCanvas.getContext("2d");

      maskCtx?.drawImage(
        maskBitmap,
        0,
        0,
        doc.maskCanvas.width,
        doc.maskCanvas.height
      );

      maskBitmap.close();
      doc.hasMask = true;
    }

    return doc;
  }

  async function openImageFiles(files: FileList | File[]): Promise<void> {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;

      try {
        setStatus("Opening " + file.name + "…");

        const doc = await createDocumentFromBlob(
          file,
          file.name
        );

        await registerDocument(doc);
      } catch (error) {
        setStatus(
          error instanceof Error
            ? "Could not open image: " + error.message
            : "Could not open image"
        );
      }
    }
  }

  async function loadStoredProject(id: string): Promise<void> {
    if (documents.has(id)) {
      activateDocument(id);
      return;
    }

    try {
      setStatus("Loading saved project…");

      const record = await database.get(id);

      if (!record) {
        setStatus("Saved project not found");
        return;
      }

      const doc = await createDocumentFromBlob(
        record.source,
        record.name,
        record.state,
        record.mask
      );

      await registerDocument(doc);
      setStatus("Project restored");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? "Could not restore project: " + error.message
          : "Could not restore project"
      );
    }
  }

  function activateDocument(id: string): void {
    if (!documents.has(id)) return;

    if (activeJob) {
      renderer.cancel(activeJob);
      activeJob = 0;
    }

    activeId = id;
    brushActive = false;

    renderTabs();
    updateControls();
    scheduleRender(0);
  }

  async function exportProjectJson(): Promise<void> {
    const doc = activeDocument();

    if (!doc) return;

    try {
      setStatus("Preparing portable project…");

      const sourceData = await blobToDataUrl(doc.source);

      const maskData = doc.hasMask
        ? await blobToDataUrl(
            await canvasToBlob(doc.maskCanvas, "image/png")
          )
        : null;

      const project = {
        format: "image-studio-project",
        version: 1,
        state: stateFromDocument(doc),
        assets: {
          source: sourceData,
          mask: maskData,
        },
      };

      const blob = new Blob(
        [JSON.stringify(project)],
        { type: "application/json" }
      );

      const filename =
        doc.name.replace(/\.[^.]+$/, "") + ".image-studio.json";

      downloadBlob(blob, filename);
      setStatus("Project JSON exported");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? "Project export failed: " + error.message
          : "Project export failed"
      );
    }
  }

  async function importProjectJson(file: File): Promise<void> {
    try {
      setStatus("Importing project…");

      const text = await file.text();
      const parsed = JSON.parse(text);

      if (
        parsed.format !== "image-studio-project" ||
        parsed.version !== 1 ||
        !parsed.assets?.source ||
        !parsed.state
      ) {
        throw new Error("Unsupported or invalid project file.");
      }

      const source = dataUrlToBlob(parsed.assets.source);

      const mask = parsed.assets.mask
        ? dataUrlToBlob(parsed.assets.mask)
        : null;

      const state = parsed.state as ProjectState;

      const doc = await createDocumentFromBlob(
        source,
        state.name || "Imported project",
        {
          ...state,
          id: createId(),
        },
        mask
      );

      await registerDocument(doc);

      setStatus("Project imported");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? "Project import failed: " + error.message
          : "Project import failed"
      );
    }
  }

  async function exportImage(): Promise<void> {
    const doc = activeDocument();

    if (!doc) return;

    const button = root.querySelector<HTMLButtonElement>(
      '[data-action="export"]'
    );

    const mime = fileFormat.value as ExportMime;
    const quality =
      Number(query<HTMLInputElement>('[data-role="quality"]').value) / 100;

    button?.setAttribute("disabled", "true");

    let maskBitmap: ImageBitmap | null = null;

    try {
      setStatus("Preparing full-resolution export…");

      const geometry = getGeometry(doc);

      if (doc.hasMask && doc.maskEnabled) {
        maskBitmap = await createImageBitmap(doc.maskCanvas);
      }

      let result: RenderResult;

      if (renderer.available) {
        const render = renderer.render(
          {
            docId: doc.id,
            width: geometry.width,
            height: geometry.height,
            crop: geometry.crop,
            rotation: doc.rotation,
            flipX: doc.flipX,
            flipY: doc.flipY,
            filters: { ...doc.filters },
            maskEnabled: doc.maskEnabled,
            isExport: true,
            mime,
            quality,
            text: doc.text,
          },
          maskBitmap,
          (progress) => {
            setStatus("Exporting… " + Math.round(progress * 100) + "%");
          }
        );

        maskBitmap = null;
        activeJob = render.id;

        result = await render.promise;

        if (activeJob === render.id) {
          activeJob = 0;
        }
      } else {
        result = await renderFallback(
          doc,
          geometry.width,
          geometry.height,
          maskBitmap,
          mime,
          quality
        );

        maskBitmap?.close();
        maskBitmap = null;
      }

      if (!result.blob) {
        throw new Error("The renderer did not return an export file.");
      }

      const actualMime = result.blob.type || mime;
      const extension = mimeExtension(actualMime);

      const filename =
        doc.name.replace(/\.[^.]+$/, "") + "-edited." + extension;

      downloadBlob(result.blob, filename);

      setStatus(
        "Exported " +
        result.width +
        " × " +
        result.height +
        " " +
        extension.toUpperCase()
      );
    } catch (error) {
      maskBitmap?.close();

      setStatus(
        error instanceof Error
          ? "Export failed: " + error.message
          : "Export failed"
      );
    } finally {
      button?.removeAttribute("disabled");
    }
  }

  function updateMaskPoint(event: PointerEvent): void {
    const doc = activeDocument();

    if (!doc || !brushActive || !painting) return;

    const rect = canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) return;

    const x =
      ((event.clientX - rect.left) / rect.width) *
      doc.maskCanvas.width;

    const y =
      ((event.clientY - rect.top) / rect.height) *
      doc.maskCanvas.height;

    const radius = doc.brushSize * (
      doc.maskCanvas.width / Math.max(1, rect.width)
    );

    const ctx = doc.maskCanvas.getContext("2d");

    if (!ctx) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.lineWidth = Math.max(1, radius);

    if (!lastPaintPoint) {
      ctx.beginPath();
      ctx.arc(x, y, radius / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(lastPaintPoint.x, lastPaintPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    lastPaintPoint = { x, y };

    doc.hasMask = true;
    doc.maskRevision++;

    updateMaskOverlay(doc);
    scheduleRender(90);
    scheduleAutosave();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!brushActive || !activeDocument()) return;

    painting = true;
    lastPaintPoint = null;

    canvas.setPointerCapture(event.pointerId);
    updateMaskPoint(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (painting) {
      updateMaskPoint(event);
    }
  });

  function finishPainting(): void {
    if (!painting) return;

    painting = false;
    lastPaintPoint = null;

    const doc = activeDocument();

    if (doc) {
      updateMaskOverlay(doc);
      scheduleRender(0);
      scheduleAutosave();
    }
  }

  canvas.addEventListener("pointerup", finishPainting);
  canvas.addEventListener("pointercancel", finishPainting);
  canvas.addEventListener("lostpointercapture", finishPainting);

  function readCropInputs(): CropRect | null {
    const doc = activeDocument();

    if (!doc) return null;

    const x = Number(query<HTMLInputElement>('[data-role="crop-x"]').value);
    const y = Number(query<HTMLInputElement>('[data-role="crop-y"]').value);
    const width = Number(query<HTMLInputElement>('[data-role="crop-width"]').value);
    const height = Number(query<HTMLInputElement>('[data-role="crop-height"]').value);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return null;
    }

    const left = clamp(Math.round(x), 0, doc.width - 1);
    const top = clamp(Math.round(y), 0, doc.height - 1);

    return {
      x: left,
      y: top,
      width: clamp(Math.round(width), 1, doc.width - left),
      height: clamp(Math.round(height), 1, doc.height - top),
    };
  }

  function resetEdits(): void {
    const doc = activeDocument();

    if (!doc) return;

    doc.filters = { ...DEFAULT_FILTERS };
    doc.crop = null;
    doc.rotation = 0;
    doc.flipX = false;
    doc.flipY = false;
    doc.text = "";
    doc.hasMask = false;
    doc.maskEnabled = false;

    resizeMaskCanvas(doc, false);

    updateRevision(doc);
    updateControls();
  }

  function handleAction(action: string): void {
    const doc = activeDocument();

    switch (action) {
      case "open":
        fileInput.click();
        return;

      case "import-project":
        projectInput.click();
        return;

      case "save-project":
        void exportProjectJson();
        return;

      case "export":
        void exportImage();
        return;

      case "rotate-left":
        if (doc) {
          doc.rotation = normalizedRotation(doc.rotation - 90);
          resizeMaskCanvas(doc, true);
          updateRevision(doc);
          updateControls();
        }
        return;

      case "rotate-right":
        if (doc) {
          doc.rotation = normalizedRotation(doc.rotation + 90);
          resizeMaskCanvas(doc, true);
          updateRevision(doc);
          updateControls();
        }
        return;

      case "flip-x":
        if (doc) {
          doc.flipX = !doc.flipX;
          updateRevision(doc);
        }
        return;

      case "flip-y":
        if (doc) {
          doc.flipY = !doc.flipY;
          updateRevision(doc);
        }
        return;

      case "apply-crop":
        if (doc) {
          const crop = readCropInputs();

          if (!crop) {
            setStatus("Invalid crop dimensions");
            return;
          }

          doc.crop = crop;
          resizeMaskCanvas(doc, true);
          updateRevision(doc);
          updateControls();
        }
        return;

      case "reset-crop":
        if (doc) {
          doc.crop = null;
          resizeMaskCanvas(doc, true);
          updateRevision(doc);
          updateControls();
        }
        return;

      case "toggle-brush":
        brushActive = !brushActive;

        if (!brushActive) {
          finishPainting();
        }

        updateControls();

        if (doc) updateMaskOverlay(doc);
        return;

      case "clear-mask":
        if (doc) {
          const ctx = doc.maskCanvas.getContext("2d");

          ctx?.clearRect(
            0,
            0,
            doc.maskCanvas.width,
            doc.maskCanvas.height
          );

          doc.hasMask = false;
          doc.maskRevision++;

          updateRevision(doc);
          updateMaskOverlay(doc);
        }
        return;

      case "fit":
        if (doc) {
          doc.zoom = 1;
          updateControls();
          scheduleRender(0);
          scheduleAutosave();
        }
        return;

      case "reset":
        resetEdits();
        return;

      case "close":
        if (doc) {
          renderer.unload(doc.id);

          doc.bitmap.close();
          documents.delete(doc.id);

          if (activeJob) {
            renderer.cancel(activeJob);
            activeJob = 0;
          }

          bitmapCache.clear();

          activeId = documents.size
            ? Array.from(documents.keys()).slice(-1)[0] || null
            : null;

          brushActive = false;

          renderTabs();
          updateControls();

          if (activeId) {
            scheduleRender(0);
          } else {
            canvas.width = 1;
            canvas.height = 1;
            setStatus("No document open");
          }
        }
        return;
    }
  }

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-action]");

    if (!button) return;

    const action = button.dataset.action;

    if (action) handleAction(action);
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) {
      void openImageFiles(fileInput.files);
    }

    fileInput.value = "";
  });

  projectInput.addEventListener("change", () => {
    const file = projectInput.files?.[0];

    if (file) {
      void importProjectJson(file);
    }

    projectInput.value = "";
  });

  savedProjects.addEventListener("change", () => {
    const id = savedProjects.value;

    if (id) {
      void loadStoredProject(id);
    }

    savedProjects.value = "";
  });

  for (const input of root.querySelectorAll<HTMLInputElement>("[data-filter]")) {
    const updateFilter = () => {
      const doc = activeDocument();

      if (!doc) return;

      const key = input.dataset.filter as keyof FilterState;
      const value = Number(input.value);

      doc.filters[key] = value;

      const valueElement = root.querySelector<HTMLElement>(
        '[data-filter-value="' + key + '"]'
      );

      if (valueElement) {
        valueElement.textContent = String(value);
      }

      updateRevision(doc);
    };

    input.addEventListener("input", updateFilter);
    input.addEventListener("change", () => scheduleRender(0));
  }

  query<HTMLInputElement>('[data-role="zoom"]').addEventListener(
    "input",
    (event) => {
      const doc = activeDocument();

      if (!doc) return;

      const value = Number((event.target as HTMLInputElement).value);

      doc.zoom = clamp(value / 100, 0.25, 4);

      query<HTMLElement>('[data-role="zoom-value"]').textContent =
        Math.round(doc.zoom * 100) + "%";

      updateRevision(doc);
    }
  );

  query<HTMLInputElement>('[data-role="brush-size"]').addEventListener(
    "input",
    (event) => {
      const doc = activeDocument();

      if (!doc) return;

      const value = Number((event.target as HTMLInputElement).value);

      doc.brushSize = clamp(value, 2, 200);

      query<HTMLElement>('[data-role="brush-value"]').textContent =
        doc.brushSize + " px";

      scheduleAutosave();
    }
  );

  query<HTMLInputElement>('[data-role="mask-enabled"]').addEventListener(
    "change",
    (event) => {
      const doc = activeDocument();

      if (!doc) return;

      doc.maskEnabled = (event.target as HTMLInputElement).checked;

      updateRevision(doc);
    }
  );

  query<HTMLInputElement>('[data-role="text"]').addEventListener(
    "input",
    (event) => {
      const doc = activeDocument();

      if (!doc) return;

      doc.text = (event.target as HTMLInputElement).value;

      updateRevision(doc);
    }
  );

  query<HTMLInputElement>('[data-role="quality"]').addEventListener(
    "input",
    (event) => {
      const value = Number((event.target as HTMLInputElement).value);

      query<HTMLElement>('[data-role="quality-value"]').textContent =
        value + "%";
    }
  );

  async function restoreRecentProjects(): Promise<void> {
    try {
      const records = await database.all();

      records.sort((a, b) => b.updatedAt - a.updatedAt);

      /*
       * Restore only the most recent three documents automatically.
       * Older projects remain available in the Saved projects selector.
       */
      for (const record of records.slice(0, 3)) {
        if (documents.has(record.id)) continue;

        const doc = await createDocumentFromBlob(
          record.source,
          record.name,
          record.state,
          record.mask
        );

        await registerDocument(doc);
      }

      if (records.length) {
        setStatus("Recent projects restored");
      }
    } catch {
      setStatus("Local project storage unavailable");
    }
  }

  function dispose(): void {
    window.clearTimeout(renderTimer);
    window.clearTimeout(autosaveTimer);

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    if (activeJob) {
      renderer.cancel(activeJob);
    }

    for (const doc of documents.values()) {
      doc.bitmap.close();
    }

    documents.clear();
    bitmapCache.clear();
    renderer.dispose();
  }

  /*
   * Allows the caller to cleanly dispose of the worker and document bitmaps
   * when removing this editor from the page.
   */
  Object.defineProperty(root, "dispose", {
    value: dispose,
    configurable: true,
  });

  if (renderer.available) {
    engineStatus.textContent = "OffscreenCanvas worker renderer active";
  } else {
    engineStatus.textContent = "Canvas fallback renderer active";
  }

  void refreshSavedProjects();
  void restoreRecentProjects();

  return root;
}

export default createImageEditorPage;