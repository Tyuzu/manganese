import '../../css/imagestudio.css';

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

import {
  DEFAULT_FILTERS,
  type CropRect,
  type EditorDocument,
  type ExportMime,
  type FilterState,
  type ProjectState,
  type RenderResult,
  type StoredProject,
} from './image-studio/types';
import {
  BitmapCache,
  WorkerRenderer,
  blobToDataUrl,
  canvasToBlob,
  clamp,
  createId,
  dataUrlToBlob,
  downloadBlob,
  getGeometry,
  mimeExtension,
  normalizedRotation,
  renderFallback,
  stateFromDocument,
} from './image-studio/renderer';
import { ProjectDatabase } from './image-studio/storage';
import { buildFilterControls, buildImageStudioShell } from './image-studio/dom';

export function createImageEditorPage(): HTMLDivElement {
  const root = buildImageStudioShell();

  let renderer = new WorkerRenderer();
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
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let lastPaintPoint: { x: number; y: number } | null = null;

  const query = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);

    if (!element) {
      throw new Error("Missing editor element: " + selector);
    }

    return element;
  };

  const statusElement = query<HTMLElement>('[data-role="status"]');
  const loaderElement = query<HTMLElement>('[data-role="loader"]');
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

  buildFilterControls(filterControls);

  let loadingCount = 0;

  function setLoading(loading: boolean): void {
    loadingCount = Math.max(0, loading ? loadingCount + 1 : loadingCount - 1);
    loaderElement.hidden = loadingCount === 0;
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

  function closeDocument(id: string): void {
    const doc = documents.get(id);

    if (!doc) return;

    renderer.unload(doc.id);
    doc.bitmap.close();
    documents.delete(id);

    if (activeJob) {
      renderer.cancel(activeJob);
      activeJob = 0;
    }

    bitmapCache.clear();

    if (activeId === id) {
      activeId = documents.size
        ? Array.from(documents.keys()).slice(-1)[0] || null
        : null;
    }

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

  function refreshRendererStatus(): void {
    if (renderer.available) {
      engineStatus.textContent = "OffscreenCanvas worker renderer active";
    } else {
      engineStatus.textContent = "Canvas fallback renderer active";
    }
  }

  async function flushAllDocuments(): Promise<void> {
    window.clearTimeout(renderTimer);
    window.clearTimeout(autosaveTimer);

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }

    if (activeJob) {
      renderer.cancel(activeJob);
      activeJob = 0;
    }

    renderVersion++;

    for (const doc of documents.values()) {
      renderer.unload(doc.id);
      doc.bitmap.close();

      const maskCtx = doc.maskCanvas.getContext("2d");
      maskCtx?.clearRect(0, 0, doc.maskCanvas.width, doc.maskCanvas.height);
      doc.maskCanvas.width = 1;
      doc.maskCanvas.height = 1;
    }

    documents.clear();
    activeId = null;
    brushActive = false;
    painting = false;
    panning = false;
    lastPaintPoint = null;
    bitmapCache.clear();

    try {
      await database.clearAll();
      savedProjects.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Saved projects";
      savedProjects.appendChild(placeholder);
    } catch {
      // Keep the empty state consistent even if local storage is unavailable.
    }

    renderer.dispose();
    renderer = new WorkerRenderer();
    refreshRendererStatus();

    renderTabs();
    updateControls();
    canvas.width = 1;
    canvas.height = 1;
    overlayCanvas.width = 1;
    overlayCanvas.height = 1;
    overlayCanvas.style.display = "none";
    setStatus("Memory flushed");
  }

  function renderTabs(): void {
    tabsElement.replaceChildren();

    for (const doc of documents.values()) {
      const tab = document.createElement("div");
      tab.className = "ie-tab-wrap" + (doc.id === activeId ? " active" : "");

      const button = document.createElement("button");
      button.className = "ie-tab" + (doc.id === activeId ? " active" : "");
      button.textContent = doc.name;
      button.title = doc.name;

      button.addEventListener("click", () => {
        activateDocument(doc.id);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "ie-tab-close";
      removeButton.textContent = "×";
      removeButton.title = "Remove document";
      removeButton.setAttribute("aria-label", "Remove " + doc.name);
      removeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        closeDocument(doc.id);
      });

      tab.appendChild(button);
      tab.appendChild(removeButton);
      tabsElement.appendChild(tab);
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

    applyCanvasTransform(doc);

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

  function applyCanvasTransform(doc: EditorDocument): void {
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
    canvasFrame.style.transform = "translate(" + doc.panX + "px, " + doc.panY + "px)";
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

    applyCanvasTransform(doc);
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
    setLoading(true);

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

        try {
          result = await Promise.race([
            render.promise,
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error("Preview worker timed out.")), 5000);
            }),
          ]);
        } catch {
          result = await renderFallback(
            doc,
            width,
            height,
            null,
            null,
            0.92
          );
        }

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

      if (!result.bitmap || result.width <= 0 || result.height <= 0) {
        result = await renderFallback(
          doc,
          width,
          height,
          null,
          null,
          0.92
        );
      }

      const bitmap = result.bitmap;
      if (!bitmap) {
        throw new Error("Preview renderer returned no bitmap.");
      }

      if (currentVersion !== renderVersion) {
        bitmap.close();
        return;
      }

      bitmapCache.set(key, bitmap);
      drawPreview(bitmap, doc);

      setStatus("Preview updated");
    } catch (error) {
      maskBitmap?.close();

      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      const message = error instanceof Error ? error.message : "Rendering failed";

      if (message.includes("The source image is no longer available in the worker.")) {
        setStatus("Preparing preview…");
        window.setTimeout(() => {
          scheduleRender(100);
        }, 150);
        return;
      }

      setStatus(message);
    } finally {
      setLoading(false);
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
    requestAnimationFrame(() => {
      scheduleRender(0);
      void renderPreview();
    });
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
      panX: state?.panX ?? 0,
      panY: state?.panY ?? 0,
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

      setLoading(true);

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
      } finally {
        setLoading(false);
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
    scheduleRender(120);
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

  function finishPanning(): void {
    if (!panning) return;

    panning = false;
    canvas.style.cursor = brushActive ? "crosshair" : "default";
  }

  canvas.addEventListener("pointerdown", (event) => {
    const doc = activeDocument();

    if (!doc) return;

    if (brushActive) {
      painting = true;
      lastPaintPoint = null;

      canvas.setPointerCapture(event.pointerId);
      updateMaskPoint(event);
      return;
    }

    if (event.button !== 0) return;

    panning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panOriginX = doc.panX;
    panOriginY = doc.panY;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const doc = activeDocument();

    if (painting) {
      updateMaskPoint(event);
      return;
    }

    if (panning && doc) {
      doc.panX = panOriginX + (event.clientX - panStartX);
      doc.panY = panOriginY + (event.clientY - panStartY);
      applyCanvasTransform(doc);
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

  canvas.addEventListener("pointerup", () => {
    finishPainting();
    finishPanning();
  });
  canvas.addEventListener("pointercancel", () => {
    finishPainting();
    finishPanning();
  });
  canvas.addEventListener("lostpointercapture", () => {
    finishPainting();
    finishPanning();
  });

  canvas.addEventListener("wheel", (event) => {
    const doc = activeDocument();

    if (!doc) return;

    event.preventDefault();

    const previousZoom = doc.zoom;
    const nextZoom = clamp(
      doc.zoom * (event.deltaY < 0 ? 1.12 : 0.88),
      0.25,
      4
    );

    if (nextZoom === previousZoom) return;

    const ratio = nextZoom / previousZoom;
    doc.zoom = nextZoom;
    doc.panX *= ratio;
    doc.panY *= ratio;

    updateControls();
    updateRevision(doc);
  }, { passive: false });

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
    doc.zoom = 1;
    doc.panX = 0;
    doc.panY = 0;

    updateRevision(doc);
    updateControls();
  }

  function handleAction(action: string): void {
    const doc = activeDocument();

    switch (action) {
      case "open":
        fileInput.value = "";
        fileInput.click();
        return;

      case "import-project":
        projectInput.click();
        return;

      case "save-project":
        void exportProjectJson();
        return;

      case "flush-all":
        void flushAllDocuments();
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
          doc.panX = 0;
          doc.panY = 0;
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
          closeDocument(doc.id);
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

  refreshRendererStatus();

  void refreshSavedProjects();
  void restoreRecentProjects();

  return root;
}

export default createImageEditorPage;