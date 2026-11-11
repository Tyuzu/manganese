import { button, createButton, div, h1, input, label, p, path, svg } from '../components/ui/dom';
import { createDetailPanel } from './shared';

type ImageStudioTab = 'adjust' | 'transform' | 'filters' | 'crop' | 'text';

export async function createImageEditorPage(): Promise<HTMLElement> {
  // State Management
  let originalImage: HTMLImageElement | null = null;
  let zoomLevel = 1;
  let activeTab: ImageStudioTab = 'adjust';
  
  // Transform State
  let rotation = 0; // 0, 90, 180, 270
  let flipH = false;
  let flipV = false;

  // Crop State
  let cropMode = false;
  let cropAspect: 'free' | '1:1' | '16:9' | '4:5' = 'free';

  const filters = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    temperature: 0, // Kelvin shift simulation (-50 to 50)
    vignette: 0,    // 0 to 100
    grain: 0,       // 0 to 50
    blur: 0,
    grayscale: 0,
    sepia: 0,
  };

  const textOverlay = {
    content: '',
    fontSize: 32,
    color: '#ffffff',
  };

  // Main Container
  const root = div({ className: 'flex flex-col h-full min-h-[calc(100vh-5rem)] bg-slate-900 text-slate-100 rounded-3xl overflow-hidden shadow-2xl border border-slate-800' });

  // 1. Header & Global Toolbar
  const header = div({ className: 'flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/80 px-6 py-4 backdrop-blur-md' },
    div({ className: 'flex items-center gap-3' },
      div({ className: 'flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold' }, 'IS'),
      div({},
        h1({ className: 'text-lg font-bold tracking-tight text-white' }, 'Image Studio'),
        p({ className: 'text-xs text-slate-400' }, 'Client-side photo retouching & asset exporter')
      )
    ),
    div({ className: 'flex items-center gap-3' },
      label({ className: 'relative cursor-pointer inline-flex items-center justify-center rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white border border-slate-700' },
        'Open Image',
        input({
          type: 'file',
          accept: 'image/*',
          className: 'sr-only',
          onchange: (e: Event) => handleFileUpload(e)
        })
      ),
      createButton('primary', {
        type: 'button',
        onclick: () => exportImage('png')
      }, 'Export PNG')
    )
  );

  // 2. Main Workspace Layout
  const workspace = div({ className: 'flex flex-1 flex-col lg:flex-row overflow-hidden' });

  const canvas = document.createElement('canvas');
  canvas.className = 'max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-75';
  const ctx = canvas.getContext('2d');

  const emptyState = div({ className: 'flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 transition-colors cursor-pointer' },
    div({ className: 'mb-4 rounded-full bg-slate-800 p-4 text-indigo-400' },
      svg({
        className: 'h-8 w-8',
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

  emptyState.onclick = () => {
    const fileInput = header.querySelector('input[type="file"]') as HTMLInputElement;
    fileInput?.click();
  };

  const viewport = div({ className: 'relative flex-1 flex items-center justify-center bg-slate-950 p-6 overflow-hidden min-h-[400px]' },
    emptyState
  );

  // Floating Controls
  const canvasOverlayControls = div({ className: 'absolute bottom-4 left-1/2 -translate-x-1/2 hidden items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1.5 backdrop-blur-md text-xs text-slate-300' },
    button({ type: 'button', className: 'hover:text-white px-2 py-1', onclick: () => setZoom(zoomLevel - 0.1) }, '−'),
    div({ id: 'zoom-label', className: 'w-12 text-center font-mono' }, '100%'),
    button({ type: 'button', className: 'hover:text-white px-2 py-1', onclick: () => setZoom(zoomLevel + 0.1) }, '+'),
    div({ className: 'h-3 w-px bg-slate-700 mx-1' }),
    button({ type: 'button', className: 'hover:text-white px-2 py-1 text-indigo-400 font-medium', onclick: resetEditor }, 'Reset All')
  );
  viewport.append(canvasOverlayControls);

  // 3. Side Panel Navigation
  const sidePanelNav = div({ className: 'flex border-b border-slate-800 bg-slate-900 px-2 overflow-x-auto' });
  const toolContainer = div({ className: 'p-6 space-y-6 overflow-y-auto flex-1' });

  const tabs: { id: ImageStudioTab; label: string }[] = [
    { id: 'adjust', label: 'Adjust' },
    { id: 'transform', label: 'Transform' },
    { id: 'crop', label: 'Crop' },
    { id: 'filters', label: 'Presets' },
    { id: 'text', label: 'Text' },
  ];

  tabs.forEach((tab) => {
    const btn = button({
      type: 'button',
      className: `px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
        activeTab === tab.id
          ? 'border-indigo-500 text-indigo-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`,
      onclick: () => switchTab(tab.id)
    }, tab.label);
    sidePanelNav.append(btn);
  });

  const sidePanel = div({ className: 'w-full lg:w-96 border-l border-slate-800 bg-slate-900/90 flex flex-col' },
    sidePanelNav,
    toolContainer
  );

  // Render Tool Controls
  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'adjust') {
      toolContainer.append(
        createSliderControl('Brightness', filters.brightness, 0, 200, (v) => { filters.brightness = v; renderCanvas(); }),
        createSliderControl('Contrast', filters.contrast, 0, 200, (v) => { filters.contrast = v; renderCanvas(); }),
        createSliderControl('Saturation', filters.saturate, 0, 200, (v) => { filters.saturate = v; renderCanvas(); }),
        createSliderControl('Temperature', filters.temperature, -50, 50, (v) => { filters.temperature = v; renderCanvas(); }),
        createSliderControl('Vignette', filters.vignette, 0, 100, (v) => { filters.vignette = v; renderCanvas(); }),
        createSliderControl('Film Grain', filters.grain, 0, 50, (v) => { filters.grain = v; renderCanvas(); }),
        createSliderControl('Blur', filters.blur, 0, 20, (v) => { filters.blur = v; renderCanvas(); }),
        createSliderControl('Grayscale', filters.grayscale, 0, 100, (v) => { filters.grayscale = v; renderCanvas(); })
      );
    } else if (activeTab === 'transform') {
      const transformGrid = div({ className: 'grid grid-cols-2 gap-3' },
        createPresetButton('Rotate 90° CW', () => { rotation = (rotation + 90) % 360; renderCanvas(); }),
        createPresetButton('Rotate 90° CCW', () => { rotation = (rotation - 90 + 360) % 360; renderCanvas(); }),
        createPresetButton('Flip Horizontal', () => { flipH = !flipH; renderCanvas(); }),
        createPresetButton('Flip Vertical', () => { flipV = !flipV; renderCanvas(); })
      );
      toolContainer.append(
        p({ className: 'text-xs text-slate-400 mb-2' }, 'Geometric Adjustments'),
        transformGrid
      );
    } else if (activeTab === 'crop') {
      cropMode = true;
      const cropGrid = div({ className: 'grid grid-cols-2 gap-3' },
        createPresetButton('Freeform', () => { cropAspect = 'free'; cropMode = true; }),
        createPresetButton('1:1 Square', () => { cropAspect = '1:1'; applyCropAspect(1, 1); }),
        createPresetButton('16:9 Landscape', () => { cropAspect = '16:9'; applyCropAspect(16, 9); }),
        createPresetButton('4:5 Portrait', () => { cropAspect = '4:5'; applyCropAspect(4, 5); })
      );
      toolContainer.append(
        p({ className: 'text-xs text-slate-400 mb-2' }, `Crop mode: ${cropAspect === 'free' ? 'Freeform' : cropAspect}`),
        cropGrid,
        createButton('secondary', {
          type: 'button',
          className: 'w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white border-transparent',
          onclick: () => executeCrop()
        }, 'Apply Crop')
      );
    } else if (activeTab === 'filters') {
      const presetGrid = div({ className: 'grid grid-cols-2 gap-3' },
        createPresetButton('Normal', () => applyPreset({ brightness: 100, contrast: 100, saturate: 100, temperature: 0, vignette: 0, grain: 0, grayscale: 0 })),
        createPresetButton('Cinematic', () => applyPreset({ brightness: 95, contrast: 125, saturate: 110, temperature: 15, vignette: 40, grain: 10, grayscale: 0 })),
        createPresetButton('Mono Noir', () => applyPreset({ brightness: 105, contrast: 135, saturate: 0, temperature: 0, vignette: 50, grain: 20, grayscale: 100 })),
        createPresetButton('Warm Sunset', () => applyPreset({ brightness: 105, contrast: 110, saturate: 130, temperature: 35, vignette: 20, grain: 0, grayscale: 0 }))
      );
      toolContainer.append(presetGrid);
    } else if (activeTab === 'text') {
      const textInput = input({
        type: 'text',
        placeholder: 'Watermark text...',
        value: textOverlay.content,
        className: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none',
        oninput: (e: Event) => {
          textOverlay.content = (e.target as HTMLInputElement).value;
          renderCanvas();
        }
      });

      const colorInput = input({
        type: 'color',
        value: textOverlay.color,
        className: 'h-10 w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-1',
        oninput: (e: Event) => {
          textOverlay.color = (e.target as HTMLInputElement).value;
          renderCanvas();
        }
      });

      toolContainer.append(
        div({ className: 'space-y-4' },
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Overlay Text'),
            textInput
          ),
          createSliderControl('Font Size', textOverlay.fontSize, 12, 120, (v) => {
            textOverlay.fontSize = v;
            renderCanvas();
          }),
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Text Color'),
            colorInput
          )
        )
      );
    }

    toolContainer.append(
      div({ className: 'mt-8 border-t border-slate-800 pt-6' },
        createDetailPanel('Asset info', [
          { label: 'Dimensions', value: originalImage ? `${canvas.width} × ${canvas.height}` : '—' },
          { label: 'Transform', value: `Rot: ${rotation}°, Flip: ${flipH || flipV ? 'Yes' : 'No'}` },
          { label: 'Status', value: originalImage ? 'Ready' : 'No asset' },
        ])
      )
    );
  }

  // File Upload
  function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || !target.files[0]) return;

    const file = target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        viewport.innerHTML = '';
        viewport.append(canvas, canvasOverlayControls);
        canvasOverlayControls.classList.remove('hidden');
        canvasOverlayControls.classList.add('flex');
        
        renderCanvas();
        renderToolControls();
      };
      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  }

  // Canvas Rendering Pipeline (Adjustments, Color Grading, Vignette, Grain, Transforms)
  function renderCanvas() {
    if (!originalImage || !ctx) return;

    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;

    // Handle rotation canvas swap
    if (rotation === 90 || rotation === 270) {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Move to center for rotation/flipping transforms
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    // Apply Native Filters
    ctx.filter = `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturate}%)
      blur(${filters.blur}px)
      grayscale(${filters.grayscale}%)
      sepia(${filters.sepia}%)
    `.trim();

    ctx.drawImage(originalImage, -w / 2, -h / 2, w, h);
    ctx.restore();

    // 1. Temperature overlay (Warm/Cool tint)
    if (filters.temperature !== 0) {
      ctx.save();
      ctx.fillStyle = filters.temperature > 0 
        ? `rgba(255, 140, 0, ${Math.abs(filters.temperature) / 200})` 
        : `rgba(0, 100, 255, ${Math.abs(filters.temperature) / 200})`;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // 2. Vignette Effect
    if (filters.vignette > 0) {
      ctx.save();
      const outerRadius = Math.hypot(canvas.width, canvas.height) / 2;
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, outerRadius * 0.4,
        canvas.width / 2, canvas.height / 2, outerRadius
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${filters.vignette / 100})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // 3. Film Grain Generator
    if (filters.grain > 0) {
      ctx.save();
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const intensity = filters.grain * 0.8;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * intensity * 25;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
      ctx.restore();
    }

    // 4. Text / Watermark Overlay
    if (textOverlay.content) {
      ctx.save();
      ctx.font = `bold ${textOverlay.fontSize}px sans-serif`;
      ctx.fillStyle = textOverlay.color;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(textOverlay.content, 40, canvas.height - 40);
      ctx.restore();
    }
  }

  // Crop Ratio helper
  function applyCropAspect(aspectW: number, aspectH: number) {
    if (!originalImage) return;
    cropMode = true;
    const currentW = canvas.width;
    const currentH = canvas.height;
    let targetW = currentW;
    let targetH = currentW * (aspectH / aspectW);

    if (targetH > currentH) {
      targetH = currentH;
      targetW = currentH * (aspectW / aspectH);
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetW;
    tempCanvas.height = targetH;
    const tCtx = tempCanvas.getContext('2d');
    
    tCtx?.drawImage(
      canvas, 
      (currentW - targetW) / 2, 
      (currentH - targetH) / 2, 
      targetW, 
      targetH, 
      0, 
      0, 
      targetW, 
      targetH
    );

    const croppedImg = new Image();
    croppedImg.onload = () => {
      originalImage = croppedImg;
      canvas.width = targetW;
      canvas.height = targetH;
      rotation = 0;
      flipH = false;
      flipV = false;
      renderCanvas();
      renderToolControls();
    };
    croppedImg.src = tempCanvas.toDataURL();
  }

  function executeCrop() {
    if (cropMode) {
      canvas.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.45)';
    } else {
      canvas.style.boxShadow = '';
    }
    renderCanvas();
  }

  // Helpers
  function setZoom(val: number) {
    zoomLevel = Math.max(0.2, Math.min(3, val));
    canvas.style.transform = `scale(${zoomLevel})`;
    const labelEl = root.querySelector('#zoom-label');
    if (labelEl) labelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
  }

  function resetEditor() {
    cropMode = false;
    cropAspect = 'free';
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
    textOverlay.content = '';
    if (originalImage) {
      canvas.width = originalImage.naturalWidth;
      canvas.height = originalImage.naturalHeight;
    }
    setZoom(1);
    renderCanvas();
    renderToolControls();
  }

  function switchTab(tab: ImageStudioTab) {
    activeTab = tab;
    cropMode = tab === 'crop';
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
        isSelected
          ? 'border-indigo-500 text-indigo-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`;
    });
    renderToolControls();
  }

  function applyPreset(preset: Partial<typeof filters>) {
    Object.assign(filters, preset);
    renderCanvas();
    renderToolControls();
  }

  function exportImage(format: 'png' | 'jpeg' = 'png') {
    if (!originalImage) return;
    const link = document.createElement('a');
    link.download = `export-${Date.now()}.${format}`;
    link.href = canvas.toDataURL(`image/${format}`, 0.92);
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
      className: 'rounded-xl border border-slate-800 bg-slate-950 p-3 text-left text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-all',
      onclick: onClick
    }, name);
  }

  // Initialize
  workspace.append(viewport, sidePanel);
  root.append(header, workspace);
  renderToolControls();

  return root;
}