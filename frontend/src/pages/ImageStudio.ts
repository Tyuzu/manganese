import { button, createButton, div, input, label, p, path, svg } from '../components/ui/dom';
import { createDetailPanel, createEditorFooter, createEditorTitleRow } from './shared';

type ImageStudioTab = 'crop' | 'adjust' | 'transform' | 'filters' | 'text';

interface EditorState {
  filters: {
    brightness: number;
    contrast: number;
    saturate: number;
    temperature: number;
    vignette: number;
    grain: number;
    blur: number;
    grayscale: number;
    sepia: number;
  };
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  cropBox: { x: number; y: number; width: number; height: number };
  textOverlay: { content: string; fontSize: number; color: string };
}

export async function createImageEditorPage(): Promise<HTMLElement> {
  let originalImage: HTMLImageElement | null = null;
  let activeTab: ImageStudioTab = 'adjust';

  let zoomLevel = 1;
  let rotation = 0;
  let flipH = false;
  let flipV = false;

  // Crop state (normalized 0 to 1 relative to image dimensions)
  const cropBox = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  let isDraggingCrop = false;
  let cropHandle: 'move' | 'nw' | 'ne' | 'sw' | 'se' | null = null;
  let dragStart = { x: 0, y: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 };
  let aspectRatioLock: number | null = null; // null = freeform

  const filters = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    temperature: 0,
    vignette: 0,
    grain: 0,
    blur: 0,
    grayscale: 0,
    sepia: 0,
  };

  const textOverlay = {
    content: '',
    fontSize: 32,
    color: '#ffffff',
  };

  // History Stack for Undo / Redo
  let history: EditorState[] = [];
  let historyIndex = -1;

  function pushState() {
    const currentState: EditorState = {
      filters: { ...filters },
      rotation,
      flipH,
      flipV,
      cropBox: { ...cropBox },
      textOverlay: { ...textOverlay }
    };
    // Trim any future states if we branched
    history = history.slice(0, historyIndex + 1);
    history.push(currentState);
    historyIndex = history.length - 1;
  }

  function restoreState(state: EditorState) {
    Object.assign(filters, state.filters);
    rotation = state.rotation;
    flipH = state.flipH;
    flipV = state.flipV;
    Object.assign(cropBox, state.cropBox);
    Object.assign(textOverlay, state.textOverlay);
    renderComposedImage();
    renderToolControls();
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      restoreState(history[historyIndex]);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      restoreState(history[historyIndex]);
    }
  }

  const root = div({
    className: 'min-h-screen p-2 sm:p-8 lg:p-10 flex items-center justify-center'
  });

  const modal = div({
    className: 'editor-surface w-full max-w-[1020px] rounded-[28px] border border-slate-700/70 bg-[#34495e] shadow-[0_25px_60px_rgba(15,23,42,0.3)] overflow-hidden flex flex-col'
  });

  const fileInput = input({
    type: 'file',
    accept: 'image/*',
    className: 'sr-only',
    onchange: (e: Event) => handleFileUpload(e)
  });

  const { titleRow, fullscreenButton } = createEditorTitleRow(
    'Image Studio Pro',
    () => resetEditor(),
    () => toggleEditorFullscreen()
  );

  const sidePanelNav = div({ className: 'flex flex-wrap gap-2 px-3 pb-2 sm:gap-3 sm:px-5 bg-[#2c3e50]/40 pt-3 items-center justify-between' });
  const toolContainer = div({ className: 'space-y-4' });

  const tabs: { id: ImageStudioTab; label: string }[] = [
    { id: 'adjust', label: 'ADJUST' },
    { id: 'filters', label: 'FILTERS' },
    { id: 'crop', label: 'CROP' },
    { id: 'transform', label: 'TRANSFORM' },
    { id: 'text', label: 'TEXT' },
  ];

  const tabButtonsContainer = div({ className: 'flex flex-wrap gap-2 flex-1' });
  tabs.forEach((tab) => {
    const btn = button({
      type: 'button',
      className: `editor-tab inline-flex min-w-[75px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[90px] sm:px-3 sm:text-[11px] ${
        activeTab === tab.id
          ? 'border-slate-100/20 bg-slate-900/60 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`,
      onclick: () => switchTab(tab.id)
    }, tab.label);
    tabButtonsContainer.append(btn);
  });

  // Undo / Redo buttons in top nav bar
  const undoRedoGroup = div({ className: 'flex items-center gap-1.5 ml-2' },
    button({
      type: 'button',
      className: 'p-2 rounded-xl bg-slate-900/50 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700/50 text-xs font-bold transition-all',
      title: 'Undo (Ctrl+Z)',
      onclick: () => undo()
    }, '↶'),
    button({
      type: 'button',
      className: 'p-2 rounded-xl bg-slate-900/50 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700/50 text-xs font-bold transition-all',
      title: 'Redo (Ctrl+Y)',
      onclick: () => redo()
    }, '↷')
  );

  sidePanelNav.append(tabButtonsContainer, undoRedoGroup);

  const previewCanvas = document.createElement('canvas');
  previewCanvas.className = 'max-h-full max-w-full object-contain block cursor-crosshair rounded-lg shadow-md';

  const emptyState = div({ className: 'flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/40 hover:bg-slate-900/70 transition-all cursor-pointer w-full max-w-md' },
    div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-indigo-400 border border-slate-700/50' },
      svg({
        className: 'w-8 h-8',
        fill: 'none',
        stroke: 'currentColor',
        viewBox: '0 0 24 24',
      },
        path({
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
        })
      )
    ),
    p({ className: 'text-sm font-semibold text-slate-200' }, 'Drop photo here or click to load'),
    p({ className: 'mt-1 text-xs text-slate-400' }, 'Supports PNG, JPG, WebP, SVG')
  );

  emptyState.onclick = () => fileInput.click();

  const viewport = div({ className: 'relative flex h-[350px] flex-1 items-center justify-center overflow-hidden rounded-[18px] border border-slate-700/40 bg-[#2c3e50] p-4 sm:h-[520px]', }, emptyState);

  const canvasOverlayControls = div({ className: 'absolute bottom-4 left-1/2 -translate-x-1/2 hidden items-center gap-2 rounded-full border border-slate-600/80 bg-slate-900/90 px-4 py-1.5 backdrop-blur-md text-xs text-slate-300 z-20 shadow-xl' },
    button({ type: 'button', className: 'hover:text-white px-2 py-1 font-bold', onclick: () => setZoom(zoomLevel - 0.15) }, '−'),
    div({ id: 'zoom-label', className: 'w-12 text-center font-mono text-[11px]' }, '100%'),
    button({ type: 'button', className: 'hover:text-white px-2 py-1 font-bold', onclick: () => setZoom(zoomLevel + 0.15) }, '+'),
    div({ className: 'h-3 w-px bg-slate-700 mx-1' }),
    button({ type: 'button', className: 'hover:text-white px-2 py-1 text-indigo-400 font-semibold', onclick: resetEditor }, 'Reset All')
  );
  viewport.append(canvasOverlayControls);

  // Enhanced Crop Interaction on Preview Canvas
  previewCanvas.addEventListener('mousedown', (e) => {
    if (activeTab !== 'crop' || !originalImage) return;
    const rect = previewCanvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    const bx = cropBox.x;
    const by = cropBox.y;
    const bw = cropBox.width;
    const bh = cropBox.height;

    // Check corners / handles (threshold 0.05)
    const handleThreshold = 0.06;
    if (Math.abs(clickX - bx) < handleThreshold && Math.abs(clickY - by) < handleThreshold) {
      cropHandle = 'nw';
    } else if (Math.abs(clickX - (bx + bw)) < handleThreshold && Math.abs(clickY - by) < handleThreshold) {
      cropHandle = 'ne';
    } else if (Math.abs(clickX - bx) < handleThreshold && Math.abs(clickY - (by + bh)) < handleThreshold) {
      cropHandle = 'sw';
    } else if (Math.abs(clickX - (bx + bw)) < handleThreshold && Math.abs(clickY - (by + bh)) < handleThreshold) {
      cropHandle = 'se';
    } else if (clickX >= bx && clickX <= bx + bw && clickY >= by && clickY <= by + bh) {
      cropHandle = 'move';
    } else {
      // Start a new crop box
      cropHandle = 'se';
      cropBox.x = clickX;
      cropBox.y = clickY;
      cropBox.width = 0.1;
      cropBox.height = 0.1;
    }

    isDraggingCrop = true;
    dragStart = { x: clickX, y: clickY, boxX: bx, boxY: by, boxW: bw, boxH: bh };
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingCrop || activeTab !== 'crop' || !originalImage) return;
    const rect = previewCanvas.getBoundingClientRect();
    const curX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const curY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const dx = curX - dragStart.x;
    const dy = curY - dragStart.y;

    if (cropHandle === 'move') {
      cropBox.x = Math.max(0, Math.min(1 - cropBox.width, dragStart.boxX + dx));
      cropBox.y = Math.max(0, Math.min(1 - cropBox.height, dragStart.boxY + dy));
    } else if (cropHandle === 'se') {
      let newW = Math.max(0.05, dragStart.boxW + dx);
      let newH = aspectRatioLock ? newW / aspectRatioLock : Math.max(0.05, dragStart.boxH + dy);
      if (cropBox.x + newW > 1) newW = 1 - cropBox.x;
      if (cropBox.y + newH > 1) newH = 1 - cropBox.y;
      cropBox.width = newW;
      cropBox.height = newH;
    } else if (cropHandle === 'nw') {
      const right = dragStart.boxX + dragStart.boxW;
      const bottom = dragStart.boxY + dragStart.boxH;
      const newX = Math.max(0, Math.min(right - 0.05, dragStart.boxX + dx));
      const newY = Math.max(0, Math.min(bottom - 0.05, dragStart.boxY + dy));
      cropBox.x = newX;
      cropBox.y = newY;
      cropBox.width = right - newX;
      cropBox.height = bottom - newY;
    } else if (cropHandle === 'ne') {
      const left = dragStart.boxX;
      const bottom = dragStart.boxY + dragStart.boxH;
      const newRight = Math.max(left + 0.05, Math.min(1, left + dragStart.boxW + dx));
      const newY = Math.max(0, Math.min(bottom - 0.05, dragStart.boxY + dy));
      cropBox.x = left;
      cropBox.y = newY;
      cropBox.width = newRight - left;
      cropBox.height = bottom - newY;
    } else if (cropHandle === 'sw') {
      const right = dragStart.boxX + dragStart.boxW;
      const top = dragStart.boxY;
      const newLeft = Math.max(0, Math.min(right - 0.05, dragStart.boxX + dx));
      const newBottom = Math.max(top + 0.05, Math.min(1, top + dragStart.boxH + dy));
      cropBox.x = newLeft;
      cropBox.y = top;
      cropBox.width = right - newLeft;
      cropBox.height = newBottom - top;
    }

    renderComposedImage();
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingCrop) {
      isDraggingCrop = false;
      pushState();
    }
  });

  const sidePanel = div({ className: 'w-full shrink-0 rounded-[18px] border border-white/5 bg-[#2c3e50]/70 p-4 md:w-[310px] flex flex-col justify-between overflow-y-auto max-h-[520px]' },
    toolContainer
  );

  const workspace = div({ className: 'flex flex-col gap-4 p-4 sm:flex-row sm:gap-5' }, sidePanel, viewport);
  const modalFooter = createEditorFooter(() => resetEditor(), () => exportImage('png'));
  const modalWrap = div({ className: 'w-full' }, titleRow, sidePanelNav, workspace, modalFooter);

  modal.append(modalWrap);
  root.append(modal);

  const updateFullscreenButton = () => {
    fullscreenButton.textContent = document.fullscreenElement === modal ? '⤡' : '⤢';
  };
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

  function toggleEditorFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement === modal) {
      void document.exitFullscreen();
      return;
    }
    void modal.requestFullscreen();
  }

  renderToolControls();

  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'adjust') {
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Image Adjustments'),
        createSliderControl('Brightness', filters.brightness, 0, 200, (v) => { filters.brightness = v; renderComposedImage(); }),
        createSliderControl('Contrast', filters.contrast, 0, 200, (v) => { filters.contrast = v; renderComposedImage(); }),
        createSliderControl('Saturation', filters.saturate, 0, 200, (v) => { filters.saturate = v; renderComposedImage(); }),
        createSliderControl('Temperature', filters.temperature, -50, 50, (v) => { filters.temperature = v; renderComposedImage(); }),
        createSliderControl('Vignette', filters.vignette, 0, 100, (v) => { filters.vignette = v; renderComposedImage(); }),
        createSliderControl('Grain', filters.grain, 0, 100, (v) => { filters.grain = v; renderComposedImage(); }),
        createSliderControl('Blur', filters.blur, 0, 20, (v) => { filters.blur = v; renderComposedImage(); }),
        createSliderControl('Grayscale', filters.grayscale, 0, 100, (v) => { filters.grayscale = v; renderComposedImage(); }),
        createSliderControl('Sepia', filters.sepia, 0, 100, (v) => { filters.sepia = v; renderComposedImage(); })
      );
    } else if (activeTab === 'filters') {
      const presetGrid = div({ className: 'grid grid-cols-2 gap-3' },
        createThumbnailPresetCard('Normal', { brightness: 100, contrast: 100, saturate: 100, temperature: 0, vignette: 0, grain: 0, blur: 0, grayscale: 0, sepia: 0 }, '✨'),
        createThumbnailPresetCard('Cinematic', { brightness: 95, contrast: 125, saturate: 110, temperature: 15, vignette: 40, grain: 10, blur: 0, grayscale: 0, sepia: 0 }, '🎬'),
        createThumbnailPresetCard('Mono Noir', { brightness: 105, contrast: 135, saturate: 0, temperature: 0, vignette: 50, grain: 15, blur: 0, grayscale: 100, sepia: 0 }, '🎞️'),
        createThumbnailPresetCard('Warm Sunset', { brightness: 105, contrast: 110, saturate: 130, temperature: 35, vignette: 25, grain: 5, blur: 0, grayscale: 0, sepia: 15 }, '🌅')
      );
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'One-Click Filter Presets'),
        presetGrid
      );
    } else if (activeTab === 'crop') {
      const cropRatios = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('Freeform', () => { aspectRatioLock = null; cropBox.x = 0.1; cropBox.y = 0.1; cropBox.width = 0.8; cropBox.height = 0.8; renderComposedImage(); pushState(); }),
        createPresetButton('Square (1:1)', () => { aspectRatioLock = 1; cropBox.x = 0.2; cropBox.y = 0.2; cropBox.width = 0.6; cropBox.height = 0.6; renderComposedImage(); pushState(); }),
        createPresetButton('Landscape (16:9)', () => { aspectRatioLock = 16 / 9; cropBox.x = 0.1; cropBox.y = 0.25; cropBox.width = 0.8; cropBox.height = 0.45; renderComposedImage(); pushState(); }),
        createPresetButton('Portrait (4:5)', () => { aspectRatioLock = 4 / 5; cropBox.x = 0.25; cropBox.y = 0.1; cropBox.width = 0.5; cropBox.height = 0.625; renderComposedImage(); pushState(); })
      );
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Smart Crop & Ratios'),
        cropRatios,
        div({ className: 'pt-3 space-y-2' },
          createButton('primary', {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg',
            onclick: () => applyCropCommit()
          }, 'Crop & Commit Canvas'),
          createButton('secondary', {
            type: 'button',
            className: 'w-full text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700',
            onclick: () => { aspectRatioLock = null; cropBox.x = 0.1; cropBox.y = 0.1; cropBox.width = 0.8; cropBox.height = 0.8; renderComposedImage(); pushState(); }
          }, 'Reset Crop Box')
        )
      );
    } else if (activeTab === 'transform') {
      const transformGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('Rotate 90° CW', () => { rotation = (rotation + 90) % 360; renderComposedImage(); pushState(); }),
        createPresetButton('Rotate 90° CCW', () => { rotation = (rotation - 90 + 360) % 360; renderComposedImage(); pushState(); }),
        createPresetButton('Flip Horizontal', () => { flipH = !flipH; renderComposedImage(); pushState(); }),
        createPresetButton('Flip Vertical', () => { flipV = !flipV; renderComposedImage(); pushState(); })
      );
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Orientation & Rotation'),
        transformGrid
      );
    } else if (activeTab === 'text') {
      const watermarkInput = input({
        type: 'text',
        placeholder: 'Enter watermark text...',
        value: textOverlay.content,
        className: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none',
        oninput: (e: Event) => {
          textOverlay.content = (e.target as HTMLInputElement).value;
          renderComposedImage();
        },
        onchange: () => pushState()
      });

      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Watermark Overlay'),
        div({ className: 'space-y-4' },
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Watermark Text'),
            watermarkInput
          ),
          createSliderControl('Font Size', textOverlay.fontSize, 16, 96, (v) => {
            textOverlay.fontSize = v;
            renderComposedImage();
          })
        )
      );
    }

    toolContainer.append(
      div({ className: 'mt-6 border-t border-slate-700/60 pt-4' },
        createDetailPanel('Studio Info', [
          { label: 'Dimensions', value: originalImage ? `${originalImage.naturalWidth} × ${originalImage.naturalHeight}` : '—' },
          { label: 'History Stack', value: `${historyIndex + 1} / ${history.length}` },
          { label: 'Status', value: originalImage ? 'Ready' : 'Waiting for asset' },
        ])
      )
    );
  }

  function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || !target.files[0]) return;
    const file = target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        cropBox.x = 0.1; cropBox.y = 0.1; cropBox.width = 0.8; cropBox.height = 0.8;
        viewport.innerHTML = '';
        viewport.append(previewCanvas, canvasOverlayControls);
        canvasOverlayControls.classList.remove('hidden');
        canvasOverlayControls.classList.add('flex');
        
        history = [];
        historyIndex = -1;
        pushState();
        renderComposedImage();
        renderToolControls();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  function applyCropCommit() {
    if (!originalImage) return;
    const canvas = document.createElement('canvas');
    const sx = cropBox.x * originalImage.naturalWidth;
    const sy = cropBox.y * originalImage.naturalHeight;
    const sw = cropBox.width * originalImage.naturalWidth;
    const sh = cropBox.height * originalImage.naturalHeight;

    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(originalImage, sx, sy, sw, sh, 0, 0, sw, sh);

    const croppedImg = new Image();
    croppedImg.onload = () => {
      originalImage = croppedImg;
      cropBox.x = 0.1; cropBox.y = 0.1; cropBox.width = 0.8; cropBox.height = 0.8;
      pushState();
      renderComposedImage();
      renderToolControls();
    };
    croppedImg.src = canvas.toDataURL();
  }

  function renderComposedImage() {
    if (!originalImage) return;

    const sx = cropBox.x * originalImage.naturalWidth;
    const sy = cropBox.y * originalImage.naturalHeight;
    const sw = cropBox.width * originalImage.naturalWidth;
    const sh = cropBox.height * originalImage.naturalHeight;

    const workCanvas = document.createElement('canvas');
    const isRotated90 = rotation === 90 || rotation === 270;
    workCanvas.width = isRotated90 ? sh : sw;
    workCanvas.height = isRotated90 ? sw : sh;
    const ctx = workCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(workCanvas.width / 2, workCanvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(originalImage, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();

    const tempHue = Math.round((filters.temperature / 50) * 180);
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%) blur(${filters.blur}px) hue-rotate(${tempHue}deg)`;
    
    const filteredCanvas = document.createElement('canvas');
    filteredCanvas.width = workCanvas.width;
    filteredCanvas.height = workCanvas.height;
    const fCtx = filteredCanvas.getContext('2d');
    if (!fCtx) return;
    fCtx.drawImage(workCanvas, 0, 0);
    ctx.clearRect(0, 0, workCanvas.width, workCanvas.height);
    ctx.drawImage(filteredCanvas, 0, 0);
    ctx.filter = 'none';

    if (filters.vignette > 0) {
      drawVignette(ctx, workCanvas.width, workCanvas.height, filters.vignette);
    }
    if (filters.grain > 0) {
      drawGrain(ctx, workCanvas.width, workCanvas.height, filters.grain);
    }

    if (textOverlay.content) {
      ctx.font = `700 ${textOverlay.fontSize}px sans-serif`;
      ctx.fillStyle = textOverlay.color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 10;
      ctx.textBaseline = 'bottom';
      ctx.fillText(textOverlay.content, 32, workCanvas.height - 32);
      ctx.shadowBlur = 0;
    }

    previewCanvas.width = workCanvas.width;
    previewCanvas.height = workCanvas.height;
    previewCanvas.style.transform = `scale(${zoomLevel})`;
    const pCtx = previewCanvas.getContext('2d');
    if (!pCtx) return;
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    pCtx.drawImage(workCanvas, 0, 0);

    // Enhanced Crop Overlay with Rule of Thirds Grid & Corner Handles
    if (activeTab === 'crop') {
      const cx = cropBox.x * previewCanvas.width;
      const cy = cropBox.y * previewCanvas.height;
      const cw = cropBox.width * previewCanvas.width;
      const ch = cropBox.height * previewCanvas.height;

      // Darken outside crop area
      pCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      pCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      pCtx.clearRect(cx, cy, cw, ch);
      pCtx.drawImage(workCanvas, cx, cy, cw, ch, cx, cy, cw, ch);

      // Crop Border
      pCtx.strokeStyle = '#ffffff';
      pCtx.lineWidth = 2;
      pCtx.strokeRect(cx, cy, cw, ch);

      // Rule of Thirds Grid Lines
      pCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      pCtx.lineWidth = 1;
      pCtx.beginPath();
      pCtx.moveTo(cx + cw / 3, cy); pCtx.lineTo(cx + cw / 3, cy + ch);
      pCtx.moveTo(cx + (2 * cw) / 3, cy); pCtx.lineTo(cx + (2 * cw) / 3, cy + ch);
      pCtx.moveTo(cx, cy + ch / 3); pCtx.lineTo(cx + cw, cy + ch / 3);
      pCtx.moveTo(cx, cy + (2 * ch) / 3); pCtx.lineTo(cx + cw, cy + (2 * ch) / 3);
      pCtx.stroke();

      // Corner handles
      const handleSize = 10;
      pCtx.fillStyle = '#6366f1';
      pCtx.fillRect(cx - handleSize/2, cy - handleSize/2, handleSize, handleSize);
      pCtx.fillRect(cx + cw - handleSize/2, cy - handleSize/2, handleSize, handleSize);
      pCtx.fillRect(cx - handleSize/2, cy + ch - handleSize/2, handleSize, handleSize);
      pCtx.fillRect(cx + cw - handleSize/2, cy + ch - handleSize/2, handleSize, handleSize);
    }
  }

  function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number) {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.75);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${Math.min(strength / 100, 0.85)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawGrain(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const strength = (amount / 100) * 40;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * strength;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function setZoom(val: number) {
    zoomLevel = Math.max(0.4, Math.min(3, val));
    renderComposedImage();
    const labelEl = root.querySelector('#zoom-label');
    if (labelEl) labelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
  }

  function resetEditor() {
    filters.brightness = 100;
    filters.contrast = 100;
    filters.saturate = 100;
    filters.temperature = 0;
    filters.vignette = 0;
    filters.grain = 0;
    filters.blur = 0;
    filters.grayscale = 0;
    filters.sepia = 0;
    rotation = 0;
    flipH = false;
    flipV = false;
    cropBox.x = 0.1; cropBox.y = 0.1; cropBox.width = 0.8; cropBox.height = 0.8;
    textOverlay.content = '';
    setZoom(1);
    pushState();
    renderComposedImage();
    renderToolControls();
  }

  function switchTab(tab: ImageStudioTab) {
    activeTab = tab;
    tabButtonsContainer.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `editor-tab inline-flex min-w-[75px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[90px] sm:px-3 sm:text-[11px] ${
        isSelected
          ? 'border-slate-100/20 bg-slate-900/60 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`;
    });
    renderToolControls();
    renderComposedImage();
  }

  function exportImage(format: 'png' | 'jpeg' = 'png') {
    if (!originalImage) return;
    const prevTab = activeTab;
    activeTab = 'adjust';
    renderComposedImage();

    const link = document.createElement('a');
    link.download = `studio-export-${Date.now()}.${format}`;
    link.href = previewCanvas.toDataURL(`image/${format}`, 0.95);
    link.click();

    activeTab = prevTab;
    renderComposedImage();
  }

  function createSliderControl(title: string, value: number, min: number, max: number, onChange: (val: number) => void) {
    const valDisplay = div({ className: 'text-xs font-mono text-indigo-400 font-bold' }, value.toString());
    return div({ className: 'space-y-1' },
      div({ className: 'flex justify-between items-center' },
        label({ className: 'text-xs font-medium text-slate-300' }, title),
        valDisplay
      ),
      input({
        type: 'range',
        min: min.toString(),
        max: max.toString(),
        value: value.toString(),
        className: 'w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500',
        oninput: (e: Event) => {
          const v = parseFloat((e.target as HTMLInputElement).value);
          valDisplay.textContent = v.toString();
          onChange(v);
        },
        onchange: () => pushState()
      })
    );
  }

  function createPresetButton(name: string, onClick: () => void) {
    return button({
      type: 'button',
      className: 'rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-left text-xs font-medium text-slate-200 hover:border-indigo-500 hover:text-white transition-all shadow-sm',
      onclick: onClick
    }, name);
  }

  function createThumbnailPresetCard(name: string, presetValues: Partial<typeof filters>, icon: string) {
    const card = div({
      className: 'flex flex-col items-center justify-center p-3 rounded-xl border border-slate-700 bg-slate-900/70 hover:border-indigo-500 hover:bg-slate-900 cursor-pointer transition-all shadow-sm text-center group'
    },
      div({ className: 'text-2xl mb-1 group-hover:scale-110 transition-transform' }, icon),
      p({ className: 'text-xs font-semibold text-slate-200' }, name)
    );

    card.onclick = () => {
      Object.assign(filters, presetValues);
      pushState();
      renderComposedImage();
    };

    return card;
  }

  return root;
}