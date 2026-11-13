import { button, createButton, div, input, label, p, path, svg } from '../components/ui/dom';
import { createDetailPanel } from './shared';

declare global {
  interface Window {
    Cropper: any;
  }
}

type ImageStudioTab = 'adjust' | 'transform' | 'filters' | 'crop' | 'text';

export async function createImageEditorPage(): Promise<HTMLElement> {
  ensureCropperLoaded();

  let originalImage: HTMLImageElement | null = null;
  let cropperInstance: any = null;
  let zoomLevel = 1;
  let activeTab: ImageStudioTab = 'crop';

  let rotation = 0;
  let flipH = false;
  let flipV = false;

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

  const root = div({
    className: 'min-h-screen bg-[#edf0f1] p-4 sm:p-8 lg:p-10 flex items-center justify-center'
  });

  const modal = div({
    className: 'w-full max-w-[980px] rounded-[28px] border border-slate-700/70 bg-[#536d7b] shadow-[0_25px_60px_rgba(15,23,42,0.2)] overflow-hidden'
  });

  const fileInput = input({
    type: 'file',
    accept: 'image/*',
    className: 'sr-only',
    onchange: (e: Event) => handleFileUpload(e)
  });

  const titleRow = div({ className: 'flex items-center justify-between px-6 pt-6 pb-4' },
    div({ className: 'text-[2rem] leading-none font-medium tracking-tight text-slate-50' }, 'Edit your image'),
    button({
      type: 'button',
      className: 'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-500/40 bg-slate-900/35 text-2xl leading-none text-slate-100 transition hover:bg-slate-800/70',
      onclick: () => resetEditor()
    }, '×')
  );

  const sidePanelNav = div({ className: 'flex gap-3 px-5 pb-2' });
  const toolContainer = div({ className: 'space-y-4' });

  const tabs: { id: ImageStudioTab; label: string }[] = [
    { id: 'crop', label: 'RESIZE' },
    { id: 'adjust', label: 'CROP' },
    { id: 'transform', label: 'TRANSFORM' },
  ];

  tabs.forEach((tab) => {
    const btn = button({
      type: 'button',
      className: `inline-flex min-w-[120px] items-center justify-center rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
        activeTab === tab.id
          ? 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`,
      onclick: () => switchTab(tab.id)
    }, tab.label);
    sidePanelNav.append(btn);
  });

  const imageElement = document.createElement('img');
  imageElement.className = 'max-h-full max-w-full object-contain block';

  const emptyState = div({ className: 'flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 transition-all cursor-pointer' },
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
    p({ className: 'mt-1 text-xs text-slate-500' }, 'Supports PNG, JPG, WebP, SVG')
  );

  emptyState.onclick = () => fileInput.click();

  const viewport = div({ className: 'relative flex h-[480px] flex-1 items-center justify-center overflow-hidden rounded-[18px] border border-slate-800/50 bg-[#4f6675] p-4', }, emptyState);

  const canvasOverlayControls = div({ className: 'absolute bottom-4 left-1/2 -translate-x-1/2 hidden items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-4 py-1.5 backdrop-blur-md text-xs text-slate-300 z-20 shadow-lg' },
    button({ type: 'button', className: 'hover:text-white px-2 py-1 font-bold', onclick: () => setZoom(zoomLevel - 0.1) }, '−'),
    div({ id: 'zoom-label', className: 'w-12 text-center font-mono text-[11px]' }, '100%'),
    button({ type: 'button', className: 'hover:text-white px-2 py-1 font-bold', onclick: () => setZoom(zoomLevel + 0.1) }, '+'),
    div({ className: 'h-3 w-px bg-slate-700 mx-1' }),
    button({ type: 'button', className: 'hover:text-white px-2 py-1 text-indigo-400 font-semibold', onclick: resetEditor }, 'Reset All')
  );
  viewport.append(canvasOverlayControls);

  const sidePanel = div({ className: 'w-[270px] shrink-0 rounded-[18px] border border-white/5 bg-[#49677a]/60 p-3' },
    toolContainer
  );

  const workspace = div({ className: 'flex gap-5 px-5 pb-5' }, sidePanel, viewport);

  const modalFooter = div({ className: 'flex items-center justify-end gap-3 px-5 pb-5' },
    button({
      type: 'button',
      className: 'rounded-xl border border-slate-400/50 bg-transparent px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-200 transition hover:border-slate-300 hover:text-white',
      onclick: () => resetEditor()
    }, 'Cancel'),
    button({
      type: 'button',
      className: 'rounded-xl bg-[#4ec7a6] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 shadow-[0_12px_24px_rgba(78,199,166,0.35)] transition hover:bg-[#5fdcb3]',
      onclick: () => exportImage('png')
    }, 'Save changes')
  );

  const modalWrap = div({ className: 'w-full' }, titleRow, sidePanelNav, workspace, modalFooter);

  modal.append(modalWrap);
  root.append(modal);
  renderToolControls();

  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'crop') {
      const cropRatios = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('Freeform', () => setCropAspect(NaN)),
        createPresetButton('1:1 Square', () => setCropAspect(1)),
        createPresetButton('16:9 Landscape', () => setCropAspect(16 / 9)),
        createPresetButton('4:5 Social', () => setCropAspect(4 / 5)),
        createPresetButton('3:2 Photo', () => setCropAspect(3 / 2))
      );

      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Interactive Cropper.js Controls'),
        cropRatios,
        div({ className: 'pt-2 space-y-2' },
          createButton('primary', {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20',
            onclick: () => applyCropperCrop()
          }, 'Crop & Commit Canvas'),
          createButton('secondary', {
            type: 'button',
            className: 'w-full text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700/60',
            onclick: () => initCropper()
          }, 'Reset Crop Box')
        )
      );
    } else if (activeTab === 'adjust') {
      toolContainer.append(
        createSliderControl('Brightness', filters.brightness, 0, 200, (v) => { filters.brightness = v; applyCanvasFilters(); }),
        createSliderControl('Contrast', filters.contrast, 0, 200, (v) => { filters.contrast = v; applyCanvasFilters(); }),
        createSliderControl('Saturation', filters.saturate, 0, 200, (v) => { filters.saturate = v; applyCanvasFilters(); }),
        createSliderControl('Temperature', filters.temperature, -50, 50, (v) => { filters.temperature = v; applyCanvasFilters(); }),
        createSliderControl('Vignette', filters.vignette, 0, 100, (v) => { filters.vignette = v; applyCanvasFilters(); }),
        createSliderControl('Blur', filters.blur, 0, 20, (v) => { filters.blur = v; applyCanvasFilters(); }),
        createSliderControl('Grayscale', filters.grayscale, 0, 100, (v) => { filters.grayscale = v; applyCanvasFilters(); })
      );
    } else if (activeTab === 'transform') {
      const transformGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('Rotate 90° CW', () => rotateImage(90)),
        createPresetButton('Rotate 90° CCW', () => rotateImage(-90)),
        createPresetButton('Flip Horizontal', () => flipImage('h')),
        createPresetButton('Flip Vertical', () => flipImage('v'))
      );
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Orientation & Angles'),
        transformGrid
      );
    } else if (activeTab === 'filters') {
      const presetGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('Normal', () => applyPreset({ brightness: 100, contrast: 100, saturate: 100, temperature: 0, vignette: 0, grayscale: 0 })),
        createPresetButton('Cinematic', () => applyPreset({ brightness: 95, contrast: 125, saturate: 110, temperature: 15, vignette: 40, grayscale: 0 })),
        createPresetButton('Mono Noir', () => applyPreset({ brightness: 105, contrast: 135, saturate: 0, temperature: 0, vignette: 50, grayscale: 100 })),
        createPresetButton('Warm Sunset', () => applyPreset({ brightness: 105, contrast: 110, saturate: 130, temperature: 35, vignette: 20, grayscale: 0 }))
      );
      toolContainer.append(presetGrid);
    } else if (activeTab === 'text') {
      const textInput = input({
        type: 'text',
        placeholder: 'Watermark or label...',
        value: textOverlay.content,
        className: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none',
        oninput: (e: Event) => {
          textOverlay.content = (e.target as HTMLInputElement).value;
          applyCanvasFilters();
        }
      });

      toolContainer.append(
        div({ className: 'space-y-4' },
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Watermark Text'),
            textInput
          ),
          createSliderControl('Font Size', textOverlay.fontSize, 12, 120, (v) => {
            textOverlay.fontSize = v;
            applyCanvasFilters();
          })
        )
      );
    }

    toolContainer.append(
      div({ className: 'mt-6 border-t border-slate-800 pt-5' },
        createDetailPanel('Asset info', [
          { label: 'Dimensions', value: imageElement.src ? `${imageElement.naturalWidth} × ${imageElement.naturalHeight}` : '—' },
          { label: 'Cropper', value: cropperInstance ? 'Active' : 'Disabled' },
          { label: 'Status', value: originalImage ? 'Ready' : 'No asset' },
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
        imageElement.src = event.target?.result as string;

        viewport.innerHTML = '';
        viewport.append(imageElement, canvasOverlayControls);
        canvasOverlayControls.classList.remove('hidden');
        canvasOverlayControls.classList.add('flex');

        initCropper();
        renderToolControls();
      };
      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  }

  function initCropper() {
    if (!window.Cropper || !imageElement.src) return;
    if (cropperInstance) {
      cropperInstance.destroy();
    }

    cropperInstance = new window.Cropper(imageElement, {
      viewMode: 1,
      dragMode: 'crop',
      autoCropArea: 0.85,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblClick: false,
      ready() {
        applyCanvasFilters();
      }
    });
  }

  function setCropAspect(aspectRatio: number) {
    if (cropperInstance) {
      cropperInstance.setAspectRatio(Number.isFinite(aspectRatio) ? aspectRatio : NaN);
    }
  }

  function applyCropperCrop() {
    if (!cropperInstance) return;
    const croppedCanvas = cropperInstance.getCroppedCanvas();
    if (!croppedCanvas) return;

    const croppedImg = new Image();
    croppedImg.onload = () => {
      originalImage = croppedImg;
      imageElement.src = croppedCanvas.toDataURL();
      initCropper();
      renderToolControls();
    };
    croppedImg.src = croppedCanvas.toDataURL();
  }

  function rotateImage(deg: number) {
    if (cropperInstance) {
      cropperInstance.rotate(deg);
    } else {
      rotation = (rotation + deg) % 360;
      applyCanvasFilters();
    }
  }

  function flipImage(dir: 'h' | 'v') {
    if (cropperInstance) {
      if (dir === 'h') {
        flipH = !flipH;
        cropperInstance.scaleX(flipH ? -1 : 1);
      } else {
        flipV = !flipV;
        cropperInstance.scaleY(flipV ? -1 : 1);
      }
    }
  }

  function applyCanvasFilters() {
    const container = viewport.querySelector('.cropper-container img');
    const target = (container ?? imageElement) as HTMLElement;
    if (target) {
      target.style.filter = `
        brightness(${filters.brightness}%)
        contrast(${filters.contrast}%)
        saturate(${filters.saturate}%)
        blur(${filters.blur}px)
        grayscale(${filters.grayscale}%)
      `.trim();
    }

    if (textOverlay.content) {
      const overlayTarget = viewport.querySelector('.cropper-crop-box') as HTMLElement | null;
      const existingText = overlayTarget?.querySelector('[data-watermark="studio-text"]') as HTMLElement | null;
      const watermark = existingText ?? document.createElement('div');
      watermark.dataset.watermark = 'studio-text';
      watermark.textContent = textOverlay.content;
      watermark.style.position = 'absolute';
      watermark.style.left = '24px';
      watermark.style.bottom = '24px';
      watermark.style.fontSize = `${textOverlay.fontSize}px`;
      watermark.style.fontWeight = '700';
      watermark.style.color = textOverlay.color;
      watermark.style.textShadow = '0 2px 10px rgba(15, 23, 42, 0.9)';
      watermark.style.pointerEvents = 'none';
      watermark.style.zIndex = '20';
      if (!existingText && overlayTarget) {
        overlayTarget.appendChild(watermark);
      }
    }
  }

  function setZoom(val: number) {
    zoomLevel = Math.max(0.2, Math.min(3, val));
    if (cropperInstance) {
      cropperInstance.zoomTo(zoomLevel);
    }
    const labelEl = root.querySelector('#zoom-label');
    if (labelEl) labelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
  }

  function resetEditor() {
    filters.brightness = 100;
    filters.contrast = 100;
    filters.saturate = 100;
    filters.temperature = 0;
    filters.vignette = 0;
    filters.blur = 0;
    filters.grayscale = 0;
    rotation = 0;
    flipH = false;
    flipV = false;
    textOverlay.content = '';
    if (cropperInstance) {
      cropperInstance.reset();
    }
    setZoom(1);
    applyCanvasFilters();
    renderToolControls();
  }

  function switchTab(tab: ImageStudioTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `inline-flex min-w-[120px] items-center justify-center rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
        isSelected
          ? 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`;
    });
    renderToolControls();
  }

  function applyPreset(preset: Partial<typeof filters>) {
    Object.assign(filters, preset);
    applyCanvasFilters();
    renderToolControls();
  }

  function exportImage(format: 'png' | 'jpeg' = 'png') {
    if (!cropperInstance) return;
    const finalCanvas = cropperInstance.getCroppedCanvas();
    if (!finalCanvas) return;

    const link = document.createElement('a');
    link.download = `cropped-export-${Date.now()}.${format}`;
    link.href = finalCanvas.toDataURL(`image/${format}`, 0.92);
    link.click();
  }

  function createSliderControl(title: string, value: number, min: number, max: number, onChange: (val: number) => void) {
    const valDisplay = div({ className: 'text-xs font-mono text-indigo-400' }, value.toString());

    return div({ className: 'space-y-1.5' },
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
        }
      })
    );
  }

  function createPresetButton(name: string, onClick: () => void) {
    return button({
      type: 'button',
      className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-left text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-all shadow-sm',
      onclick: onClick
    }, name);
  }

  function ensureCropperLoaded() {
    if (!document.getElementById('cropper-css')) {
      const link = document.createElement('link');
      link.id = 'cropper-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css';
      document.head.appendChild(link);
    }

    if (!window.Cropper && !document.getElementById('cropper-js')) {
      const script = document.createElement('script');
      script.id = 'cropper-js';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js';
      script.onload = () => {
        if (imageElement.src) {
          initCropper();
        }
      };
      document.head.appendChild(script);
    }
  }

  return root;
}