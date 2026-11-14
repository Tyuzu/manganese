import { button, createButton, div, input, label, p, span, svgElement } from '../components/ui/dom';
import {
  createDetailPanel,
  createEditorFooter,
  createEditorShell,
  createEditorTabNav,
  createPresetButton,
  createSliderControl,
} from './shared';
import { createScanCameraController } from './scan/camera';
import type { ScanMode } from './scan/controls';
import { createWorker } from 'tesseract.js';

type ScanTab = 'mode' | 'filters' | 'crop' | 'sign' | 'ocr' | 'batch' | 'export';
type FilterPreset = 'magic' | 'gray' | 'bw' | 'original';
type DocumentPreset = 'pdf' | 'id' | 'ocr' | 'photo';

interface Point {
  x: number;
  y: number;
}

interface ScannedPage {
  id: string;
  name: string;
  dataUrl: string;
  filter: FilterPreset;
  rotation: number;
  flipX: boolean;
  brightness: number;
  contrast: number;
  corners: [Point, Point, Point, Point];
  signatureDataUrl?: string | null;
  watermarkText?: string;
  watermarkOpacity?: number;
  extractedText?: string;
}

export async function createScanPage(): Promise<HTMLElement> {
  // --- State Management ---
  let currentMode: ScanMode = 'pdf';
  let docPreset: DocumentPreset = 'pdf';
  let activeTab: ScanTab = 'mode';
  let flashEnabled = false;
  let isCameraActive = false;

  let pages: ScannedPage[] = [];
  let activePageIndex = -1;

  let scanName = `Scan_${new Date().toISOString().slice(0, 10)}`;
  let exportFormat: 'pdf' | 'jpg' | 'png' = 'pdf';
  let exportQuality = 0.92;
  let controller!: ReturnType<typeof createScanCameraController>;

  let activeCornerIndex: number | null = null;
  let isOcrProcessing = false;

  const getActivePage = (): ScannedPage | null =>
    activePageIndex >= 0 && activePageIndex < pages.length ? pages[activePageIndex] : null;

  // --- Core DOM Elements ---
  const statusMsgEl = span({ id: 'status-msg', className: 'text-slate-200 font-mono truncate max-w-[140px]' }, 'Waiting for upload');
  const statusModeEl = span({ className: 'font-semibold text-emerald-400' }, 'PDF Document');

  const statusBox = div(
    { className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs space-y-1.5' },
    div({ className: 'flex justify-between items-center' }, span({ className: 'text-slate-400' }, 'Mode'), statusModeEl),
    div({ className: 'flex justify-between items-center' }, span({ className: 'text-slate-400' }, 'Status'), statusMsgEl),
    div({ className: 'flex justify-between items-center' }, span({ className: 'text-slate-400' }, 'Pages'), span({ id: 'page-count-badge', className: 'text-slate-200 font-semibold' }, '0'))
  );

  const setStatus = (message: string) => {
    statusMsgEl.textContent = message;
  };

  const updatePageCounter = () => {
    const badge = statusBox.querySelector('#page-count-badge');
    if (badge) {
      badge.textContent = pages.length > 0 ? `${activePageIndex + 1} / ${pages.length}` : '0';
    }
  };

  // --- File Handling & Page Stack Management ---
  const addPageFromDataUrl = (dataUrl: string, name?: string) => {
    const newPage: ScannedPage = {
      id: crypto.randomUUID(),
      name: name || `Page ${pages.length + 1}`,
      dataUrl,
      filter: 'magic',
      rotation: 0,
      flipX: false,
      brightness: 100,
      contrast: 100,
      corners: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 }
      ],
      signatureDataUrl: null,
      watermarkText: '',
      watermarkOpacity: 15,
      extractedText: ''
    };
    pages.push(newPage);
    activePageIndex = pages.length - 1;
    isCameraActive = false;
    renderStagePreview();
    renderToolControls();
    updatePageCounter();
    setStatus(`Added ${newPage.name}`);
  };

  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    Array.from(fileList).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        controller.setPreviewFromFile(file);
        setStatus(`Loaded ${file.name}`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          addPageFromDataUrl(e.target.result, file.name.replace(/\.[^/.]+$/, ''));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const fileInput = input({
    type: 'file',
    accept: 'image/*,.pdf',
    multiple: true,
    className: 'sr-only',
    onchange: (e: Event) => {
      const target = e.target as HTMLInputElement;
      processFiles(target.files);
      target.value = '';
    }
  });

  // --- Top Quick Actions & Header ---
  const quickActions = div(
    { className: 'flex items-center justify-between gap-3 mb-3' },
    div(
      { className: 'flex items-center gap-2' },
      button(
        {
          type: 'button',
          className: 'rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 px-3 py-2 text-xs font-semibold border border-slate-700/60 transition-all',
          onclick: () => rotateActivePage(-90),
          title: 'Rotate Left 90°'
        },
        '↺ Rotate'
      ),
      button(
        {
          type: 'button',
          className: 'rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 px-3 py-2 text-xs font-semibold border border-slate-700/60 transition-all',
          onclick: () => rotateActivePage(90),
          title: 'Rotate Right 90°'
        },
        '↻ Rotate'
      ),
      button(
        {
          type: 'button',
          className: 'rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 px-3 py-2 text-xs font-semibold border border-slate-700/60 transition-all',
          onclick: () => flipActivePage(),
          title: 'Flip Horizontal'
        },
        '⇄ Flip'
      )
    ),
    div(
      { className: 'flex items-center gap-2' },
      label(
        {
          className:
            'cursor-pointer inline-flex items-center justify-center rounded-xl bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white border border-slate-700/60'
        },
        '+ Upload',
        fileInput
      ),
      createButton(
        'primary',
        {
          type: 'button',
          className:
            'bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20',
          onclick: () => triggerExport()
        },
        'Export'
      )
    )
  );

  // --- Side Panel Navigation ---
  const toolContainer = div({ className: 'space-y-4' });

  const tabs: { id: ScanTab; label: string }[] = [
    { id: 'mode', label: 'MODE' },
    { id: 'filters', label: 'ADJUST' },
    { id: 'crop', label: 'CROP' },
    { id: 'sign', label: 'SIGN' },
    { id: 'ocr', label: 'OCR' },
    { id: 'batch', label: 'BATCH' },
    { id: 'export', label: 'EXPORT' }
  ];

  const sidePanelNav = createEditorTabNav(tabs, activeTab, (tabId) => switchTab(tabId), {
    activeClassName: 'border-emerald-400/30 bg-slate-900/60 text-white shadow-inner',
    inactiveClassName: 'border-transparent bg-transparent text-slate-300 hover:text-white hover:bg-white/5',
    containerClassName: 'flex gap-1 px-5 pb-3 overflow-x-auto'
  });

  function getTabClassName(isSelected: boolean): string {
    return `inline-flex min-w-[55px] flex-1 sm:flex-none sm:min-w-[70px] items-center justify-center rounded-xl border px-1.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-all ${
      isSelected
        ? 'border-emerald-400/30 bg-slate-900/60 text-white shadow-inner'
        : 'border-transparent bg-transparent text-slate-300 hover:text-white hover:bg-white/5'
    }`;
  }

  const sidePanel = div(
    { className: 'w-full shrink-0 rounded-[18px] border border-white/10 bg-[#49677a]/70 p-4 md:w-[290px] flex flex-col justify-between' },
    toolContainer
  );

  // --- Preview Stage & Drag-and-Drop ---
  const previewFrame = div({
    className: 'relative flex-1 flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden min-h-[360px] border border-slate-800/80'
  });

  const stage = div(
    {
      className: 'relative flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-800/50 bg-[#4f6675] p-4 min-h-0 transition-colors'
    },
    quickActions,
    previewFrame
  );

  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
    previewFrame.classList.add('ring-2', 'ring-emerald-400', 'bg-slate-900');
  });

  stage.addEventListener('dragleave', () => {
    previewFrame.classList.remove('ring-2', 'ring-emerald-400', 'bg-slate-900');
  });

  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    previewFrame.classList.remove('ring-2', 'ring-emerald-400', 'bg-slate-900');
    if (e.dataTransfer?.files) {
      processFiles(e.dataTransfer.files);
    }
  });

  controller = createScanCameraController({
    previewFrame,
    getMode: () => currentMode,
    setStatus
  });

  function computeCssFilter(page: ScannedPage): string {
    let base = '';
    if (page.filter === 'magic') base = 'contrast(125%) brightness(105%) saturate(115%)';
    else if (page.filter === 'gray') base = 'grayscale(100%) contrast(115%)';
    else if (page.filter === 'bw') base = 'grayscale(100%) contrast(195%) brightness(110%)';

    const custom = `brightness(${page.brightness}%) contrast(${page.contrast}%)`;
    return `${base} ${custom}`.trim();
  }

  function renderStagePreview() {
    if (isCameraActive) return;

    previewFrame.innerHTML = '';
    const activePage = getActivePage();

    if (!activePage) {
      const uploadIcon = svgElement(
        'svg',
        {
          class: 'w-8 h-8',
          fill: 'none',
          stroke: 'currentColor',
          viewBox: '0 0 24 24',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5'
        },
        svgElement('path', {
          d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
        })
      );

      const emptyDropzone = div(
        {
          className:
            'flex flex-col items-center justify-center text-center p-8 m-4 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 hover:border-emerald-500/50 transition-all cursor-pointer w-full h-full',
          onclick: () => fileInput.click()
        },
        div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-emerald-400 border border-slate-700/50' }, uploadIcon),
        p({ className: 'text-sm font-semibold text-slate-200' }, 'No document selected yet'),
        p({ className: 'mt-1 text-xs text-slate-400' }, 'Click to upload files, drag & drop here, or open camera below')
      );

      previewFrame.append(emptyDropzone);
      return;
    }

    const containerWrapper = div({ className: 'relative inline-flex items-center justify-center max-w-full max-h-full overflow-hidden' });

    const img = document.createElement('img');
    img.src = activePage.dataUrl;
    img.alt = activePage.name;
    img.className = 'max-h-[380px] max-w-full object-contain transition-all duration-200 shadow-2xl rounded block pointer-events-none select-none';
    img.style.filter = computeCssFilter(activePage);
    img.style.transform = `rotate(${activePage.rotation}deg) scaleX(${activePage.flipX ? -1 : 1})`;

    containerWrapper.append(img);

    if (activePage.watermarkText) {
      const watermarkDiv = div(
        {
          className: 'absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none'
        },
        span(
          {
            className: 'font-black uppercase tracking-widest text-white whitespace-nowrap -rotate-30',
            style: `opacity: ${(activePage.watermarkOpacity ?? 15) / 100}; font-size: 3rem; text-shadow: 0 2px 4px rgba(0,0,0,0.5);`
          },
          activePage.watermarkText
        )
      );
      containerWrapper.append(watermarkDiv);
    }

    if (activePage.signatureDataUrl) {
      const sigImg = Object.assign(document.createElement('img'), {
        src: activePage.signatureDataUrl,
        className: 'absolute bottom-6 right-6 h-16 w-32 object-contain pointer-events-none drop-shadow-md border border-white/20 bg-white/10 rounded p-1 backdrop-blur-sm'
      });
      containerWrapper.append(sigImg);
    }

    if (activeTab === 'crop') {
      const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgOverlay.setAttribute('class', 'absolute inset-0 w-full h-full pointer-events-none');

      setTimeout(() => {
        const rect = img.getBoundingClientRect();
        const parentRect = containerWrapper.getBoundingClientRect();
        const offsetX = rect.left - parentRect.left;
        const offsetY = rect.top - parentRect.top;
        const imgW = rect.width;
        const imgH = rect.height;

        svgOverlay.setAttribute('style', `position: absolute; left: ${offsetX}px; top: ${offsetY}px; width: ${imgW}px; height: ${imgH}px; overflow: visible;`);

        const [tl, tr, br, bl] = activePage.corners;
        const pts = [tl, tr, br, bl].map(p => ({ x: p.x * imgW, y: p.y * imgH }));

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', pts.map(pt => `${pt.x},${pt.y}`).join(' '));
        polygon.setAttribute('class', 'fill-emerald-500/15 stroke-emerald-400 stroke-2 pointer-events-none');
        svgOverlay.append(polygon);

        pts.forEach((pt, idx) => {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', String(pt.x));
          circle.setAttribute('cy', String(pt.y));
          circle.setAttribute('r', '10');
          circle.setAttribute('class', 'fill-emerald-500 stroke-white stroke-2 cursor-pointer pointer-events-auto hover:scale-125 transition-transform');

          const onPointerDown = (e: PointerEvent) => {
            e.preventDefault();
            activeCornerIndex = idx;
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
          };

          const onPointerMove = (e: PointerEvent) => {
            if (activeCornerIndex === null) return;
            const currentRect = img.getBoundingClientRect();
            const relX = Math.max(0, Math.min(1, (e.clientX - currentRect.left) / currentRect.width));
            const relY = Math.max(0, Math.min(1, (e.clientY - currentRect.top) / currentRect.height));
            activePage.corners[activeCornerIndex] = { x: relX, y: relY };
            renderStagePreview();
          };

          const onPointerUp = () => {
            activeCornerIndex = null;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
          };

          circle.addEventListener('pointerdown', onPointerDown);
          svgOverlay.append(circle);
        });
      }, 50);

      containerWrapper.append(svgOverlay);
    }

    const pageNavOverlay =
      pages.length > 1
        ? div(
            {
              className:
                'absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-slate-900/85 border border-slate-700/80 px-3 py-1 text-xs text-slate-200 backdrop-blur-md z-10'
            },
            button(
              {
                type: 'button',
                className: 'hover:text-emerald-400 disabled:opacity-30 font-bold px-1',
                disabled: activePageIndex === 0,
                onclick: () => {
                  if (activePageIndex > 0) {
                    activePageIndex--;
                    renderStagePreview();
                    renderToolControls();
                    updatePageCounter();
                  }
                }
              },
              '‹'
            ),
            span({ className: 'font-mono text-[11px]' }, `Page ${activePageIndex + 1} of ${pages.length}`),
            button(
              {
                type: 'button',
                className: 'hover:text-emerald-400 disabled:opacity-30 font-bold px-1',
                disabled: activePageIndex === pages.length - 1,
                onclick: () => {
                  if (activePageIndex < pages.length - 1) {
                    activePageIndex++;
                    renderStagePreview();
                    renderToolControls();
                    updatePageCounter();
                  }
                }
              },
              '›'
            )
          )
        : null;

    previewFrame.append(containerWrapper);
    if (pageNavOverlay) previewFrame.append(pageNavOverlay);
  }

  // --- Stage Bottom Live HUD Bar ---
  const cameraToggleButton = button(
    {
      type: 'button',
      className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-slate-700 transition-all'
    },
    '🎥 Open Camera'
  );

  const captureButton = button(
    {
      type: 'button',
      className: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition-all'
    },
    '📷 Capture'
  );

  const flashButton = button(
    {
      type: 'button',
      className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-slate-700 transition-all'
    },
    '⚡ Flash Off'
  );

  const stageHud = div(
    {
      className:
        'mt-3 flex h-14 shrink-0 items-center justify-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/90 px-4 backdrop-blur-md z-10'
    },
    cameraToggleButton,
    captureButton,
    flashButton
  );

  stage.append(stageHud);

  // --- Camera Actions ---
  cameraToggleButton.addEventListener('click', async () => {
    isCameraActive = true;
    await controller.startCamera();
    setStatus('Camera live');
  });

  captureButton.addEventListener('click', () => {
    if (!isCameraActive) {
      setStatus('Open camera first to capture');
      return;
    }
    controller.capturePhoto();
    requestAnimationFrame(() => {
      const capturedImg = previewFrame.querySelector('img');
      if (capturedImg?.src) {
        addPageFromDataUrl(capturedImg.src, `Scan_${pages.length + 1}`);
      }
    });
  });

  flashButton.addEventListener('click', () => {
    flashEnabled = !flashEnabled;
    flashButton.textContent = flashEnabled ? '⚡ Flash On' : '⚡ Flash Off';
    flashButton.classList.toggle('border-amber-400/50', flashEnabled);
    flashButton.classList.toggle('text-amber-300', flashEnabled);
    setStatus(flashEnabled ? 'Flash enabled' : 'Flash disabled');
  });

  function rotateActivePage(delta: number) {
    const page = getActivePage();
    if (!page) return setStatus('No page selected');
    page.rotation = (page.rotation + delta + 360) % 360;
    renderStagePreview();
    setStatus(`Rotated to ${page.rotation}°`);
  }

  function flipActivePage() {
    const page = getActivePage();
    if (!page) return setStatus('No page selected');
    page.flipX = !page.flipX;
    renderStagePreview();
    setStatus(page.flipX ? 'Flipped horizontally' : 'Restored orientation');
  }

  // --- Render Tool Controls per Tab ---
  function renderToolControls() {
    toolContainer.innerHTML = '';
    const activePage = getActivePage();

    if (activeTab === 'mode') {
      const modes: { id: DocumentPreset; label: string; mode: ScanMode; status: string }[] = [
        { id: 'pdf', label: '📄 PDF Document', mode: 'pdf', status: 'PDF Document' },
        { id: 'id', label: '🪪 ID / Passport', mode: 'pdf', status: 'ID Card Mode' },
        { id: 'ocr', label: '🔍 OCR Text Scan', mode: 'pdf', status: 'OCR Text Mode' },
        { id: 'photo', label: '🖼️ HD Photo', mode: 'photo', status: 'HD Photo' }
      ];

      const modeGrid = div(
        { className: 'grid grid-cols-2 gap-2.5' },
        ...modes.map((m) =>
          createPresetButton(m.label, docPreset === m.id, () => {
            docPreset = m.id;
            currentMode = m.mode;
            statusModeEl.textContent = m.status;
            setStatus(`${m.status} active`);
            renderToolControls();
          })
        )
      );

      toolContainer.append(
        p({ className: 'text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2' }, 'Document Type'),
        modeGrid
      );
    } else if (activeTab === 'filters') {
      const currentFilter = activePage?.filter ?? 'magic';
      const filters: { id: FilterPreset; label: string }[] = [
        { id: 'magic', label: '✨ Magic Color' },
        { id: 'gray', label: '⬛ Grayscale' },
        { id: 'bw', label: '🖋️ High Contrast' },
        { id: 'original', label: '📷 Original' }
      ];

      const filterGrid = div(
        { className: 'grid grid-cols-2 gap-2.5' },
        ...filters.map((f) =>
          createPresetButton(f.label, currentFilter === f.id, () => {
            if (!activePage) return setStatus('Upload a document first');
            activePage.filter = f.id;
            renderStagePreview();
            renderToolControls();
            setStatus(`Filter: ${f.label.replace(/^[^\s]+\s/, '')}`);
          })
        )
      );

      const brightnessVal = activePage?.brightness ?? 100;
      const contrastVal = activePage?.contrast ?? 100;

      const slidersBox = div(
        { className: 'mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3' },
        createSliderControl('Brightness', brightnessVal, 50, 150, (val) => {
          if (!activePage) return;
          activePage.brightness = val;
          renderStagePreview();
        }),
        createSliderControl('Contrast', contrastVal, 50, 200, (val) => {
          if (!activePage) return;
          activePage.contrast = val;
          renderStagePreview();
        })
      );

      toolContainer.append(
        p({ className: 'text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2' }, 'Enhancement Presets'),
        filterGrid,
        slidersBox
      );
    } else if (activeTab === 'crop') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2' }, '4-Corner Perspective Crop'),
        div(
          { className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300 space-y-2' },
          p({}, 'Drag the 4 green corner handles on the preview to align with document boundaries.'),
          p({ className: 'text-slate-400' }, 'This flattens skewed perspective shots into clean rectangular scans.')
        ),
        createButton(
          'primary',
          {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg mt-2',
            onclick: () => applyPerspectiveCrop()
          },
          '✨ Apply Perspective Crop'
        )
      );
    } else if (activeTab === 'sign') {
      const watermarkInput = input({
        type: 'text',
        value: activePage?.watermarkText ?? '',
        placeholder: 'e.g., CONFIDENTIAL',
        className: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none',
        oninput: (e: Event) => {
          if (!activePage) return;
          activePage.watermarkText = (e.target as HTMLInputElement).value;
          renderStagePreview();
        }
      });

      const watermarkControl = div(
        { className: 'space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3' },
        p({ className: 'text-xs font-semibold text-emerald-400' }, '🛡️ Security Watermark'),
        div(
          {},
          label({ className: 'block text-[11px] text-slate-400 mb-1' }, 'Watermark Text'),
          watermarkInput
        ),
        createSliderControl('Opacity', activePage?.watermarkOpacity ?? 15, 5, 50, (val) => {
          if (!activePage) return;
          activePage.watermarkOpacity = val;
          renderStagePreview();
        })
      );

      const signatureBox = div(
        { className: 'space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 mt-3' },
        p({ className: 'text-xs font-semibold text-emerald-400' }, '✍️ Electronic Signature'),
        p({ className: 'text-[11px] text-slate-400' }, activePage?.signatureDataUrl ? '✅ Signature attached' : 'No signature added yet'),
        createButton(
          'primary',
          {
            type: 'button',
            className: 'w-full text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700',
            onclick: () => openSignaturePadModal()
          },
          activePage?.signatureDataUrl ? 'Redraw Signature' : 'Draw Signature'
        ),
        activePage?.signatureDataUrl
          ? createButton(
              'secondary',
              {
                type: 'button',
                className: 'w-full text-xs py-1.5 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 rounded-xl border border-rose-800/60',
                onclick: () => {
                  if (activePage) {
                    activePage.signatureDataUrl = null;
                    renderStagePreview();
                    renderToolControls();
                    setStatus('Signature removed');
                  }
                }
              },
              'Remove Signature'
            )
          : null
      );

      toolContainer.append(
        p({ className: 'text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2' }, 'Sign & Protect'),
        watermarkControl,
        signatureBox
      );
    } else if (activeTab === 'ocr') {
      const textOutputArea = div(
        { className: 'mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300 space-y-2' },
        div(
          { className: 'flex justify-between items-center' },
          p({ className: 'font-semibold text-emerald-400' }, 'Extracted Text'),
          activePage?.extractedText
            ? createButton(
                'secondary',
                {
                  type: 'button',
                  className: 'text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg',
                  onclick: () => {
                    void navigator.clipboard.writeText(activePage.extractedText || '');
                    setStatus('Copied extracted text to clipboard');
                  }
                },
                '📋 Copy Text'
              )
            : null
        ),
        div(
          { className: 'max-h-[140px] overflow-y-auto font-mono text-[11px] text-slate-300 whitespace-pre-wrap bg-slate-900/60 p-2 rounded-lg border border-slate-800' },
          activePage?.extractedText || (isOcrProcessing ? 'Recognizing text...' : 'No text extracted yet. Click run OCR below.')
        )
      );

      toolContainer.append(
        p({ className: 'text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2' }, 'Tesseract.js OCR'),
        div(
          { className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300 space-y-2' },
          p({}, 'Extract searchable and selectable text locally from your document using neural OCR.'),
          createButton(
            'primary',
            {
              type: 'button',
              className: 'w-full text-xs py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg mt-1',
              disabled: isOcrProcessing || !activePage,
              onclick: () => void runTesseractOcr()
            },
            isOcrProcessing ? 'Processing OCR...' : '🔍 Run Text Recognition'
          )
        ),
        textOutputArea
      );
    } else if (activeTab === 'batch') {
      const batchList = div({ className: 'space-y-2 max-h-[210px] overflow-y-auto pr-1' });

      if (pages.length === 0) {
        batchList.append(
          div(
            { className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-400 text-center' },
            'No pages in stack yet. Upload or capture a page.'
          )
        );
      } else {
        pages.forEach((pg, idx) => {
          const isSelected = idx === activePageIndex;
          const item = div(
            {
              className: `flex items-center justify-between gap-2 rounded-xl border p-2 text-xs transition-all cursor-pointer ${
                isSelected
                  ? 'border-emerald-500/60 bg-slate-900 text-white'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
              }`,
              onclick: () => {
                activePageIndex = idx;
                isCameraActive = false;
                renderStagePreview();
                renderToolControls();
                updatePageCounter();
              }
            },
            div(
              { className: 'flex items-center gap-2.5 min-w-0' },
              Object.assign(document.createElement('img'), {
                src: pg.dataUrl,
                className: 'h-9 w-7 rounded object-cover border border-slate-700 shrink-0'
              }),
              div(
                { className: 'truncate' },
                p({ className: 'font-semibold truncate' }, `${idx + 1}. ${pg.name}`),
                p({ className: 'text-[10px] text-slate-400 uppercase' }, `${pg.filter} • ${pg.rotation}°`)
              )
            ),
            div(
              { className: 'flex items-center gap-1 shrink-0' },
              button(
                {
                  type: 'button',
                  className: 'p-1 text-slate-400 hover:text-white disabled:opacity-30',
                  disabled: idx === 0,
                  title: 'Move Up',
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    movePage(idx, -1);
                  }
                },
                '↑'
              ),
              button(
                {
                  type: 'button',
                  className: 'p-1 text-slate-400 hover:text-white disabled:opacity-30',
                  disabled: idx === pages.length - 1,
                  title: 'Move Down',
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    movePage(idx, 1);
                  }
                },
                '↓'
              ),
              button(
                {
                  type: 'button',
                  className: 'p-1 text-rose-400 hover:text-rose-300',
                  title: 'Delete Page',
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    deletePage(idx);
                  }
                },
                '✕'
              )
            )
          );
          batchList.append(item);
        });
      }

      toolContainer.append(
        p({ className: 'text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2' }, `Batch Stack (${pages.length})`),
        batchList,
        createButton(
          'secondary',
          {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 mt-2',
            onclick: () => fileInput.click()
          },
          '+ Add Pages from Device'
        )
      );
    } else if (activeTab === 'export') {
      const nameInput = input({
        type: 'text',
        value: scanName,
        className:
          'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none',
        oninput: (e: Event) => {
          scanName = (e.target as HTMLInputElement).value;
        }
      });

      const formatRow = div(
        { className: 'grid grid-cols-3 gap-2' },
        ...(['pdf', 'jpg', 'png'] as const).map((fmt) =>
          createPresetButton(fmt.toUpperCase(), exportFormat === fmt, () => {
            exportFormat = fmt;
            renderToolControls();
          })
        )
      );

      toolContainer.append(
        div(
          { className: 'space-y-3' },
          div(
            {},
            label({ className: 'block text-xs font-medium text-slate-300 mb-1' }, 'File Name'),
            nameInput
          ),
          div(
            {},
            label({ className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Export Format'),
            formatRow
          ),
          createSliderControl('Compression Quality', Math.round(exportQuality * 100), 40, 100, (val) => {
            exportQuality = val / 100;
          }),
          createButton(
            'primary',
            {
              type: 'button',
              className:
                'w-full text-xs py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/25',
              onclick: () => triggerExport()
            },
            `Download ${exportFormat.toUpperCase()} (${pages.length || 0} pages)`
          )
        )
      );
    }

    toolContainer.append(
      div(
        { className: 'mt-5 border-t border-slate-700/60 pt-4 space-y-3' },
        statusBox,
        createDetailPanel('Scan info', [
          { label: 'Engine', value: 'Edge-detect v2' },
          { label: 'Format', value: exportFormat.toUpperCase() },
          { label: 'Pages', value: `${pages.length}` }
        ])
      )
    );
  }

  // --- Tesseract.js OCR Execution ---
  async function runTesseractOcr() {
    const activePage = getActivePage();
    if (!activePage) return setStatus('No page selected');

    isOcrProcessing = true;
    renderToolControls();
    setStatus('Initializing OCR worker...');

    try {
      const worker = await createWorker('eng');
      setStatus('Recognizing text...');
      const ret = await worker.recognize(activePage.dataUrl);
      await worker.terminate();

      activePage.extractedText = ret.data.text.trim() || 'No text detected in image.';
      isOcrProcessing = false;
      renderToolControls();
      setStatus('OCR completed successfully');
    } catch {
      isOcrProcessing = false;
      renderToolControls();
      setStatus('OCR recognition failed');
    }
  }

  // --- Signature Pad Modal Creator ---
  function openSignaturePadModal() {
    const activePage = getActivePage();
    if (!activePage) return setStatus('Select a page to sign first');

    const overlay = div({
      className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4'
    });

    const modalBox = div(
      {
        className: 'w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4'
      },
      div(
        { className: 'flex items-center justify-between' },
        p({ className: 'text-sm font-bold text-white' }, '✍️ Draw Your Signature'),
        button(
          {
            type: 'button',
            className: 'text-slate-400 hover:text-white text-sm font-bold',
            onclick: () => overlay.remove()
          },
          '✕'
        )
      ),
      div({ className: 'relative w-full h-48 bg-white rounded-xl border border-slate-700 overflow-hidden cursor-crosshair' }, (() => {
        const sigCanvas = document.createElement('canvas');
        sigCanvas.width = 500;
        sigCanvas.height = 200;
        sigCanvas.className = 'w-full h-full touch-none';
        const ctx = sigCanvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }

        let drawing = false;
        const getPos = (e: MouseEvent | TouchEvent) => {
          const rect = sigCanvas.getBoundingClientRect();
          const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
          return {
            x: (clientX - rect.left) * (sigCanvas.width / rect.width),
            y: (clientY - rect.top) * (sigCanvas.height / rect.height)
          };
        };

        sigCanvas.addEventListener('mousedown', (e) => { drawing = true; const pos = getPos(e); ctx?.beginPath(); ctx?.moveTo(pos.x, pos.y); });
        sigCanvas.addEventListener('mousemove', (e) => { if (!drawing) return; const pos = getPos(e); ctx?.lineTo(pos.x, pos.y); ctx?.stroke(); });
        window.addEventListener('mouseup', () => { drawing = false; });

        sigCanvas.addEventListener('touchstart', (e) => { drawing = true; const pos = getPos(e); ctx?.beginPath(); ctx?.moveTo(pos.x, pos.y); e.preventDefault(); });
        sigCanvas.addEventListener('touchmove', (e) => { if (!drawing) return; const pos = getPos(e); ctx?.lineTo(pos.x, pos.y); ctx?.stroke(); e.preventDefault(); });
        window.addEventListener('touchend', () => { drawing = false; });

        setTimeout(() => {
          const saveBtn = modalBox.querySelector('#save-sig-btn');
          const clearBtn = modalBox.querySelector('#clear-sig-btn');

          clearBtn?.addEventListener('click', () => {
            ctx?.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
          });

          saveBtn?.addEventListener('click', () => {
            activePage.signatureDataUrl = sigCanvas.toDataURL('image/png');
            renderStagePreview();
            renderToolControls();
            setStatus('Signature attached successfully');
            overlay.remove();
          });
        }, 50);

        return sigCanvas;
      })()),
      div(
        { className: 'flex gap-3 pt-2' },
        createButton('secondary', { id: 'clear-sig-btn', type: 'button', className: 'flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold' }, 'Clear Pad'),
        createButton('primary', { id: 'save-sig-btn', type: 'button', className: 'flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg' }, 'Apply Signature')
      )
    );

    overlay.append(modalBox);
    document.body.append(overlay);
  }

  // --- Perspective Crop Execution ---
  async function applyPerspectiveCrop() {
    const activePage = getActivePage();
    if (!activePage) return setStatus('No page selected');

    setStatus('Cropping perspective...');

    try {
      const img = new Image();
      img.src = activePage.dataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const [tl, tr, br, bl] = activePage.corners;
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;

      const minX = Math.min(tl.x, bl.x) * srcW;
      const minY = Math.min(tl.y, tr.y) * srcH;
      const maxX = Math.max(tr.x, br.x) * srcW;
      const maxY = Math.max(bl.y, br.y) * srcH;
      const boxW = Math.max(100, maxX - minX);
      const boxH = Math.max(100, maxY - minY);

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = boxW;
      croppedCanvas.height = boxH;
      const cCtx = croppedCanvas.getContext('2d');
      cCtx?.drawImage(img, minX, minY, boxW, boxH, 0, 0, boxW, boxH);

      activePage.dataUrl = croppedCanvas.toDataURL('image/jpeg', 0.92);
      activePage.corners = [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }];
      
      renderStagePreview();
      switchTab('filters');
      setStatus('Perspective crop applied successfully');
    } catch {
      setStatus('Crop failed');
    }
  }

  // --- Batch Helpers ---
  function movePage(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= pages.length) return;
    const [moved] = pages.splice(index, 1);
    pages.splice(targetIndex, 0, moved);
    activePageIndex = targetIndex;
    renderStagePreview();
    renderToolControls();
    updatePageCounter();
  }

  function deletePage(index: number) {
    pages.splice(index, 1);
    if (pages.length === 0) {
      activePageIndex = -1;
    } else if (activePageIndex >= pages.length) {
      activePageIndex = pages.length - 1;
    }
    renderStagePreview();
    renderToolControls();
    updatePageCounter();
    setStatus('Page removed');
  }

  // --- Functional Canvas Export ---
  async function triggerExport() {
    const activePage = getActivePage();
    if (!activePage) {
      setStatus('Nothing to export');
      return;
    }

    setStatus('Rendering document...');

    try {
      const img = new Image();
      img.src = activePage.dataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const isRotated90 = activePage.rotation % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = isRotated90 ? img.height : img.width;
      canvas.height = isRotated90 ? img.width : img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      ctx.filter = computeCssFilter(activePage);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((activePage.rotation * Math.PI) / 180);
      ctx.scale(activePage.flipX ? -1 : 1, 1);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (activePage.watermarkText) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((-30 * Math.PI) / 180);
        ctx.font = '900 80px sans-serif';
        ctx.fillStyle = `rgba(255, 255, 255, ${(activePage.watermarkOpacity ?? 15) / 100})`;
        ctx.textAlign = 'center';
        ctx.fillText(activePage.watermarkText, 0, 0);
        ctx.restore();
      }

      if (activePage.signatureDataUrl) {
        const sigImg = new Image();
        sigImg.src = activePage.signatureDataUrl;
        await new Promise((res) => { sigImg.onload = res; });
        const sigW = 300;
        const sigH = 150;
        ctx.drawImage(sigImg, canvas.width - sigW - 60, canvas.height - sigH - 60, sigW, sigH);
      }

      const mimeType = exportFormat === 'png' ? 'image/png' : 'image/jpeg';
      const extension = exportFormat === 'pdf' ? 'jpg' : exportFormat;
      const downloadUrl = canvas.toDataURL(mimeType, exportQuality);

      const link = document.createElement('a');
      link.download = `${scanName || 'Scan'}.${extension}`;
      link.href = downloadUrl;
      link.click();

      setStatus(`Exported ${link.download}`);
    } catch {
      setStatus('Export failed');
    }
  }

  // --- UI Helpers ---
  function switchTab(tab: ScanTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      btn.className = getTabClassName(tabs[idx].id === tab);
    });
    renderToolControls();
  }

  function resetEditor() {
    flashEnabled = false;
    flashButton.textContent = '⚡ Flash Off';
    flashButton.classList.remove('border-amber-400/50', 'text-amber-300');

    const activePage = getActivePage();
    if (activePage) {
      activePage.filter = 'original';
      activePage.rotation = 0;
      activePage.flipX = false;
      activePage.brightness = 100;
      activePage.contrast = 100;
      activePage.signatureDataUrl = null;
      activePage.watermarkText = '';
      activePage.extractedText = '';
      activePage.corners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
      renderStagePreview();
      setStatus('Reset current page edits');
    } else {
      setStatus('Waiting for upload');
    }
    renderToolControls();
  }

  // --- Layout Assembly & Fullscreen ---
  const workspace = div({ className: 'flex flex-col md:flex-row gap-5 px-5 pb-5' }, sidePanel, stage);
  const modalFooter = createEditorFooter(() => resetEditor(), () => triggerExport());

  const { root, modal, fullscreenButton } = createEditorShell({
    title: 'Edit your scan',
    nav: sidePanelNav,
    workspace,
    footer: modalFooter,
    onReset: () => resetEditor(),
    onToggleFullscreen: () => toggleEditorFullscreen(),
    rootClassName: 'min-h-screen p-4 sm:p-8 lg:p-10 flex items-center justify-center select-none',
    modalClassName: 'editor-surface w-full max-w-[1060px] rounded-[28px] border border-slate-700/70 bg-[#536d7b] shadow-[0_25px_60px_rgba(15,23,42,0.25)] overflow-hidden flex flex-col'
  });

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

  // Initial Render
  renderStagePreview();
  renderToolControls();

  return root;
}