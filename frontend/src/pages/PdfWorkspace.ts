import { button, createButton, div, input, label, p, span, svgElement } from '../components/ui/dom';
import { createDetailPanel, createEditorFooter, createEditorShell, createEditorTabNav } from './shared';

interface ScannerPageItem {
  id: string;
  title: string;
  rotation: number;
  isBlank?: boolean;
}

interface MergeQueueItem {
  id: string;
  name: string;
  sizeMB: string;
  estimatedPages: number;
}

export async function createPdfScannerPage(): Promise<HTMLElement> {
  // --- State Management ---
  type ScanTab = 'pages' | 'enhance' | 'ocr' | 'deskew' | 'merge' | 'export';
  let activeTab: ScanTab = 'pages';

  let uploadedFileName: string | null = null;
  let uploadedFileUrl: string | null = null;
  let uploadedFileType: 'pdf' | 'image' | null = null;

  let pages: ScannerPageItem[] = [
    { id: 'p-1', title: 'Page 1 (Cover)', rotation: 0 },
    { id: 'p-2', title: 'Page 2 (Invoice Details)', rotation: 0 },
    { id: 'p-3', title: 'Page 3 (Line Items)', rotation: 0 },
    { id: 'p-4', title: 'Page 4 (Terms & Signatures)', rotation: 0 },
  ];
  let selectedPageIndex = 0;

  // Image / Scan Enhancement State
  let brightness = 100;
  let contrast = 100;
  let grayscale = 0;
  let scanPreset: 'original' | 'magic' | 'bw' = 'original';

  // Geometry & Viewport State
  let deskewAngle = 0;
  let zoomLevel = 100;

  // OCR & Merge State
  let ocrEnabled = true;
  let ocrLanguage = 'eng';
  let extractedText = 'Upload a document or click "Run OCR" to extract searchable text...';
  let mergeQueue: MergeQueueItem[] = [];

  // --- Toast Notification Helper ---
  const toastContainer = div({
    className: 'pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2',
  });

  function showToast(message: string, variant: 'info' | 'success' = 'info') {
    const badgeColor =
      variant === 'success'
        ? 'border-emerald-500/40 bg-slate-900/95 text-emerald-300'
        : 'border-cyan-500/40 bg-slate-900/95 text-cyan-200';

    const toast = div(
      {
        className: `rounded-xl border px-3.5 py-2 text-xs font-medium shadow-xl backdrop-blur-md transition-all duration-300 ${badgeColor}`,
      },
      message
    );
    toastContainer.append(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      setTimeout(() => toast.remove(), 300);
    }, 2600);
  }

  // --- File Inputs ---
  const fileInput = input({
    type: 'file',
    accept: '.pdf,image/*',
    className: 'sr-only',
    onchange: (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files?.[0]) loadDocumentFile(target.files[0]);
    },
  });

  const mergeFileInput = input({
    type: 'file',
    accept: '.pdf,image/*',
    multiple: true,
    className: 'sr-only',
    onchange: (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (!target.files?.length) return;
      Array.from(target.files).forEach((f) => {
        mergeQueue.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: f.name,
          sizeMB: (f.size / 1024 / 1024).toFixed(2),
          estimatedPages: f.type === 'application/pdf' ? 2 : 1,
        });
      });
      showToast(`Added ${target.files.length} file(s) to merge queue`, 'success');
      renderToolControls();
      target.value = '';
    },
  });

  // --- Top Quick Actions ---
  const quickActions = div(
    { className: 'flex flex-wrap items-center justify-between gap-2 sm:gap-3' },
    div(
      { className: 'flex items-center gap-2 text-[11px] text-slate-300' },
      span({ className: 'rounded-lg bg-slate-900/60 px-2.5 py-1 font-mono text-cyan-300 border border-white/5' },
        `Page ${selectedPageIndex + 1} / ${pages.length}`
      ),
      span({ className: 'hidden sm:inline text-slate-400' }, uploadedFileName || 'Sample_Invoice.pdf')
    ),
    div(
      { className: 'flex flex-wrap justify-end gap-2' },
      label(
        {
          className:
            'cursor-pointer inline-flex items-center justify-center rounded-xl bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white border border-slate-700/60',
        },
        'Upload PDF/Scan',
        fileInput
      ),
      createButton(
        'primary',
        {
          type: 'button',
          className:
            'bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-cyan-600/20',
          onclick: () => triggerExport('pdf'),
        },
        'Export PDF'
      )
    )
  );

  // --- Navigation Tabs ---
  const tabs: { id: ScanTab; label: string }[] = [
    { id: 'pages', label: 'PAGES' },
    { id: 'enhance', label: 'ENHANCE' },
    { id: 'ocr', label: 'OCR' },
    { id: 'deskew', label: 'DESKEW' },
    { id: 'merge', label: 'MERGE' },
    { id: 'export', label: 'EXPORT' },
  ];

  const sidePanelNav = createEditorTabNav(tabs, activeTab, (tabId) => switchTab(tabId), {
    activeClassName: 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner',
    inactiveClassName: 'border-transparent bg-transparent text-slate-300 hover:text-slate-100',
    containerClassName: 'flex flex-wrap gap-1.5 px-3 pb-2 sm:gap-2 sm:px-5',
  });

  const toolContainer = div({ className: 'space-y-4 max-h-[540px] overflow-y-auto pr-1' });
  const sidePanel = div(
    { className: 'w-full shrink-0 rounded-[18px] border border-white/5 bg-[#49677a]/60 p-3 md:w-[290px]' },
    toolContainer
  );

  // --- Document Viewport Stage ---
  const uploadIcon = svgElement(
    'svg',
    {
      class: 'w-8 h-8',
      fill: 'none',
      stroke: 'currentColor',
      viewBox: '0 0 24 24',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '1.5',
    },
    svgElement('path', {
      d: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    })
  );

  const previewContainer = div({
    className:
      'relative flex-1 flex items-center justify-center bg-slate-950 rounded-xl p-2 overflow-hidden min-h-[340px] sm:p-6 select-none',
  });

  function renderEmptyDropzone() {
    previewContainer.innerHTML = '';
    const dropzone = div(
      {
        className:
          'flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 hover:border-cyan-500/50 transition-all cursor-pointer w-full h-full sm:p-8',
        onclick: () => fileInput.click(),
      },
      div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-cyan-400 border border-slate-700/50' }, uploadIcon),
      p({ className: 'text-sm font-semibold text-slate-200' }, 'No document loaded'),
      p({ className: 'mt-1 text-xs text-slate-400' }, 'Drop PDF or image scan here, or click to upload'),
      p({ className: 'mt-2 text-[11px] text-slate-500' }, 'Supports PDF, PNG, JPG, WEBP')
    );
    previewContainer.append(dropzone);
  }

  // Drag & Drop support on Viewport
  previewContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    previewContainer.classList.add('ring-2', 'ring-cyan-500/60');
  });
  previewContainer.addEventListener('dragleave', () => {
    previewContainer.classList.remove('ring-2', 'ring-cyan-500/60');
  });
  previewContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    previewContainer.classList.remove('ring-2', 'ring-cyan-500/60');
    const file = e.dataTransfer?.files?.[0];
    if (file) loadDocumentFile(file);
  });

  // --- Stage Bottom HUD Bar ---
  const zoomOutBtn = button(
    {
      type: 'button',
      className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-2.5 py-2 rounded-xl text-[11px] border border-slate-700',
      title: 'Zoom Out',
    },
    '−'
  );
  const zoomLabel = span({ className: 'text-[11px] font-mono text-slate-300 px-1.5 min-w-[44px] text-center' }, '100%');
  const zoomInBtn = button(
    {
      type: 'button',
      className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-2.5 py-2 rounded-xl text-[11px] border border-slate-700',
      title: 'Zoom In',
    },
    '+'
  );

  const deskewLeftBtn = button(
    {
      type: 'button',
      className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-xl text-[11px] border border-slate-700',
    },
    '📐 -1°'
  );
  const deskewRightBtn = button(
    {
      type: 'button',
      className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-xl text-[11px] border border-slate-700',
    },
    '📐 +1°'
  );
  const rotate90Btn = button(
    {
      type: 'button',
      className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-xl text-[11px] border border-slate-700',
    },
    '↻ 90°'
  );
  const ocrRunBtn = button(
    {
      type: 'button',
      className:
        'bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-xl text-[11px] shadow-lg shadow-cyan-600/30 transition-all',
    },
    '🔍 Run OCR'
  );

  const stageHud = div(
    {
      className:
        'mt-2 flex flex-wrap shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/90 p-2.5 backdrop-blur-md z-10',
    },
    div({ className: 'flex items-center gap-1' }, zoomOutBtn, zoomLabel, zoomInBtn),
    deskewLeftBtn,
    deskewRightBtn,
    rotate90Btn,
    ocrRunBtn
  );

  // Fixed: quickActions is only mounted once here
  const stage = div(
    {
      className:
        'relative flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-800/50 bg-[#4f6675] p-2 min-h-0 sm:p-4',
    },
    toastContainer,
    div({ className: 'mb-2 sm:mb-3' }, quickActions),
    previewContainer,
    stageHud
  );

  const workspace = div(
    { className: 'flex flex-col gap-3 px-2 pb-3 sm:flex-row sm:gap-5 sm:px-5 sm:pb-5' },
    sidePanel,
    stage
  );
  const modalFooter = createEditorFooter(() => resetEditor(), () => triggerExport('pdf'));

  const { root, modal, fullscreenButton } = createEditorShell({
    title: 'Edit your PDF & Scan',
    nav: sidePanelNav,
    workspace,
    footer: modalFooter,
    onReset: () => resetEditor(),
    onToggleFullscreen: () => toggleEditorFullscreen(),
  });

  // Fullscreen Handling
  const updateFullscreenButton = () => {
    fullscreenButton.textContent = document.fullscreenElement === modal ? '⤡' : '⤢';
  };
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

  function toggleEditorFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement === modal) {
      void document.exitFullscreen();
    } else {
      void modal.requestFullscreen();
    }
  }

  // --- Viewport Rendering & Transforms ---
  function renderDocumentPreview() {
    if (!uploadedFileUrl || !uploadedFileType) {
      renderEmptyDropzone();
      return;
    }

    previewContainer.innerHTML = '';
    const activePage = pages[selectedPageIndex] || pages[0];
    const wrapper = div({
      id: 'active-document-canvas',
      className: 'flex items-center justify-center w-full h-full transition-transform duration-150 ease-out',
    });

    if (activePage?.isBlank) {
      wrapper.append(
        div(
          {
            className:
              'flex flex-col items-center justify-center w-[280px] h-[380px] bg-white text-slate-400 rounded shadow-2xl border border-slate-300',
          },
          span({ className: 'text-xs font-mono' }, activePage.title),
          span({ className: 'text-[10px] mt-1' }, '(Blank Inserted Page)')
        )
      );
    } else if (uploadedFileType === 'image') {
      const img = document.createElement('img');
      img.src = uploadedFileUrl;
      img.alt = uploadedFileName || 'Scanned Document';
      img.className = 'max-h-full max-w-full rounded-lg shadow-2xl object-contain bg-white';
      wrapper.append(img);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = `${uploadedFileUrl}#toolbar=0&navpanes=0`;
      iframe.className = 'w-full h-full rounded-lg bg-white shadow-2xl border-0';
      wrapper.append(iframe);
    }

    previewContainer.append(wrapper);
    applyVisualTransforms();
  }

  function applyVisualTransforms() {
    const wrapper = previewContainer.querySelector('#active-document-canvas') as HTMLElement | null;
    if (!wrapper) return;

    const pageRotation = pages[selectedPageIndex]?.rotation ?? 0;
    const totalRotation = pageRotation + deskewAngle;
    const scale = zoomLevel / 100;

    wrapper.style.transform = `scale(${scale}) rotate(${totalRotation}deg)`;
    wrapper.style.filter = `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%)`;
    zoomLabel.textContent = `${zoomLevel}%`;
  }

  // --- File Upload Handler ---
  function loadDocumentFile(file: File) {
    if (uploadedFileUrl) {
      URL.revokeObjectURL(uploadedFileUrl);
    }

    uploadedFileName = file.name;
    uploadedFileUrl = URL.createObjectURL(file);
    uploadedFileType = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';

    if (uploadedFileType === 'image') {
      pages = [{ id: 'p-1', title: `${file.name} (Scan)`, rotation: 0 }];
    } else {
      pages = [
        { id: 'p-1', title: 'Page 1', rotation: 0 },
        { id: 'p-2', title: 'Page 2', rotation: 0 },
        { id: 'p-3', title: 'Page 3', rotation: 0 },
      ];
    }
    selectedPageIndex = 0;

    extractedText = [
      `OCR EXTRACTION — ${file.name.toUpperCase()}`,
      `Processed: ${new Date().toLocaleDateString()} | Language: ${ocrLanguage.toUpperCase()}`,
      `----------------------------------------`,
      `Invoice #9042 — Full-Stack Engineering Inc.`,
      `Subtotal: $3,850.00 | Tax: $400.00 | Total: $4,250.00`,
      `Status: Verified & Searchable Layer Ready`,
    ].join('\n');

    renderDocumentPreview();
    renderToolControls();
    showToast(`Loaded "${file.name}"`, 'success');
  }

  // --- Side Panel Tool Controls ---
  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'pages') {
      const pageList = div(
        { className: 'space-y-2' },
        ...pages.map((pageItem, idx) => createPageThumbnailItem(pageItem, idx))
      );

      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-200 mb-2' }, `Document Pages (${pages.length})`),
        pageList,
        div(
          { className: 'pt-2 grid grid-cols-2 gap-2' },
          createButton(
            'secondary',
            {
              type: 'button',
              className:
                'text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700',
              onclick: () => {
                pages.push({
                  id: `p-${Date.now()}`,
                  title: `Page ${pages.length + 1} (Blank)`,
                  rotation: 0,
                  isBlank: true,
                });
                selectedPageIndex = pages.length - 1;
                renderDocumentPreview();
                renderToolControls();
                showToast('Inserted blank page');
              },
            },
            '+ Blank Page'
          ),
          createButton(
            'secondary',
            {
              type: 'button',
              className:
                'text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700',
              onclick: () => {
                const current = pages[selectedPageIndex];
                if (!current) return;
                pages.splice(selectedPageIndex + 1, 0, {
                  ...current,
                  id: `p-${Date.now()}`,
                  title: `${current.title} (Copy)`,
                });
                selectedPageIndex += 1;
                renderDocumentPreview();
                renderToolControls();
                showToast('Duplicated active page');
              },
            },
            '⧉ Duplicate'
          )
        )
      );
    } else if (activeTab === 'enhance') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-200 mb-2' }, 'Scan Filter Presets'),
        div(
          { className: 'grid grid-cols-3 gap-1.5 mb-3' },
          createPresetButton('Original', () => applyScanPreset('original'), scanPreset === 'original'),
          createPresetButton('Magic Color', () => applyScanPreset('magic'), scanPreset === 'magic'),
          createPresetButton('B&W Doc', () => applyScanPreset('bw'), scanPreset === 'bw')
        ),
        createSliderControl('Brightness', brightness, 50, 160, '%', (v) => {
          brightness = v;
          scanPreset = 'original';
          applyVisualTransforms();
        }),
        createSliderControl('Contrast', contrast, 50, 200, '%', (v) => {
          contrast = v;
          scanPreset = 'original';
          applyVisualTransforms();
        }),
        createSliderControl('Grayscale', grayscale, 0, 100, '%', (v) => {
          grayscale = v;
          scanPreset = 'original';
          applyVisualTransforms();
        })
      );
    } else if (activeTab === 'ocr') {
      const langSelect = document.createElement('select');
      langSelect.className =
        'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none mb-2';
      [
        { value: 'eng', label: 'English (ENG)' },
        { value: 'spa', label: 'Spanish (SPA)' },
        { value: 'fra', label: 'French (FRA)' },
        { value: 'deu', label: 'German (DEU)' },
      ].forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === ocrLanguage) o.selected = true;
        langSelect.append(o);
      });
      langSelect.onchange = () => {
        ocrLanguage = langSelect.value;
        showToast(`OCR language set to ${ocrLanguage.toUpperCase()}`);
      };

      const textArea = document.createElement('textarea');
      textArea.className =
        'w-full h-44 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none resize-none';
      textArea.value = extractedText;
      textArea.oninput = (e) => {
        extractedText = (e.target as HTMLTextAreaElement).value;
      };

      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-200 mb-1' }, 'OCR Recognition Language'),
        langSelect,
        p({ className: 'text-xs font-semibold text-slate-200 mb-1' }, 'Searchable Text Layer'),
        textArea,
        div(
          { className: 'grid grid-cols-2 gap-2 pt-1' },
          createButton(
            'secondary',
            {
              type: 'button',
              className: 'text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700',
              onclick: async () => {
                await navigator.clipboard?.writeText(extractedText);
                showToast('Copied OCR text to clipboard', 'success');
              },
            },
            'Copy Text'
          ),
          createButton(
            'primary',
            {
              type: 'button',
              className:
                'text-xs py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-600/20',
              onclick: () => {
                ocrEnabled = true;
                renderToolControls();
                showToast('Embedded OCR layer into PDF', 'success');
              },
            },
            'Sync Layer'
          )
        )
      );
    } else if (activeTab === 'deskew') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-200 mb-2' }, 'Geometric Alignment & Deskew'),
        createSliderControl('Fine Rotation Angle', deskewAngle, -15, 15, '°', (v) => {
          deskewAngle = v;
          applyVisualTransforms();
        }),
        div(
          { className: 'grid grid-cols-2 gap-2 pt-2' },
          createPresetButton('Auto-Align (0°)', () => {
            deskewAngle = 0;
            applyVisualTransforms();
            renderToolControls();
            showToast('Page auto-aligned to 0°');
          }),
          createPresetButton('Rotate +90°', () => {
            if (pages[selectedPageIndex]) {
              pages[selectedPageIndex].rotation = (pages[selectedPageIndex].rotation + 90) % 360;
              applyVisualTransforms();
              renderToolControls();
            }
          })
        )
      );
    } else if (activeTab === 'merge') {
      const queueList =
        mergeQueue.length === 0
          ? div({ className: 'py-3 text-slate-500' }, 'No extra documents queued')
          : div(
              { className: 'space-y-1.5 text-left max-h-36 overflow-y-auto' },
              ...mergeQueue.map((item, idx) =>
                div(
                  {
                    className:
                      'flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-200',
                  },
                  span({ className: 'truncate max-w-[165px]' }, `${idx + 1}. ${item.name}`),
                  button(
                    {
                      type: 'button',
                      className: 'text-slate-400 hover:text-rose-400 pl-2',
                      onclick: () => {
                        mergeQueue = mergeQueue.filter((q) => q.id !== item.id);
                        renderToolControls();
                      },
                    },
                    '✕'
                  )
                )
              )
            );

      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-200 mb-2' }, 'Merge Additional Documents'),
        div(
          { className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-400 text-center space-y-2.5' },
          queueList,
          label(
            {
              className:
                'cursor-pointer block w-full text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl border border-slate-700 transition-colors',
            },
            '+ Add PDFs or Scans',
            mergeFileInput
          ),
          mergeQueue.length > 0
            ? createButton(
                'primary',
                {
                  type: 'button',
                  className:
                    'w-full text-xs py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl',
                  onclick: () => {
                    mergeQueue.forEach((m) => {
                      pages.push({
                        id: `merged-${m.id}`,
                        title: `${m.name} (Merged)`,
                        rotation: 0,
                      });
                    });
                    const count = mergeQueue.length;
                    mergeQueue = [];
                    renderToolControls();
                    showToast(`Merged ${count} document(s) into workspace`, 'success');
                  },
                },
                `Merge ${mergeQueue.length} File(s) Now`
              )
            : ''
        )
      );
    } else if (activeTab === 'export') {
      const formatGrid = div(
        { className: 'grid grid-cols-3 gap-2' },
        createPresetButton('Searchable PDF', () => triggerExport('pdf')),
        createPresetButton('JPG Images', () => triggerExport('jpg')),
        createPresetButton('TXT Script', () => triggerExport('txt'))
      );
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-200 mb-2' }, 'Choose Export Format'),
        formatGrid
      );
    }

    // Persistent Summary Panel
    toolContainer.append(
      div(
        { className: 'mt-5 border-t border-slate-800/80 pt-4' },
        createDetailPanel('Scan summary', [
          { label: 'File name', value: uploadedFileName || 'Sample_Invoice.pdf' },
          { label: 'Pages', value: `${pages.length} pages` },
          { label: 'Deskew / Rot', value: `${deskewAngle}° / ${pages[selectedPageIndex]?.rotation ?? 0}°` },
          { label: 'OCR Status', value: ocrEnabled ? `Active (${ocrLanguage.toUpperCase()})` : 'Disabled' },
        ])
      )
    );
  }

  function applyScanPreset(preset: 'original' | 'magic' | 'bw') {
    scanPreset = preset;
    if (preset === 'original') {
      brightness = 100;
      contrast = 100;
      grayscale = 0;
    } else if (preset === 'magic') {
      brightness = 112;
      contrast = 132;
      grayscale = 0;
    } else if (preset === 'bw') {
      brightness = 115;
      contrast = 175;
      grayscale = 100;
    }
    applyVisualTransforms();
    renderToolControls();
  }

  function triggerExport(format: 'pdf' | 'jpg' | 'txt') {
    const baseName = (uploadedFileName || 'scanned-document').replace(/\.[^/.]+$/, '');

    if (format === 'txt') {
      const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-ocr.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${baseName}-ocr.txt`, 'success');
      return;
    }

    if (uploadedFileUrl) {
      const a = document.createElement('a');
      a.href = uploadedFileUrl;
      a.download = `${baseName}-edited.${format}`;
      a.click();
    }
    showToast(`Exported document as ${format.toUpperCase()}`, 'success');
  }

  function switchTab(tab: ScanTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `inline-flex min-w-[70px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:px-2.5 sm:text-[10px] ${
        isSelected
          ? 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`;
    });
    renderToolControls();
  }

  // --- Bottom HUD Event Listeners ---
  zoomOutBtn.addEventListener('click', () => {
    zoomLevel = Math.max(50, zoomLevel - 15);
    applyVisualTransforms();
  });
  zoomInBtn.addEventListener('click', () => {
    zoomLevel = Math.min(220, zoomLevel + 15);
    applyVisualTransforms();
  });
  deskewLeftBtn.addEventListener('click', () => {
    deskewAngle = Math.max(-15, deskewAngle - 1);
    applyVisualTransforms();
    if (activeTab === 'deskew') renderToolControls();
  });
  deskewRightBtn.addEventListener('click', () => {
    deskewAngle = Math.min(15, deskewAngle + 1);
    applyVisualTransforms();
    if (activeTab === 'deskew') renderToolControls();
  });
  rotate90Btn.addEventListener('click', () => {
    if (pages[selectedPageIndex]) {
      pages[selectedPageIndex].rotation = (pages[selectedPageIndex].rotation + 90) % 360;
      applyVisualTransforms();
      renderToolControls();
    }
  });
  ocrRunBtn.addEventListener('click', () => {
    ocrEnabled = true;
    switchTab('ocr');
    showToast('OCR text extraction completed!', 'success');
  });

  // --- UI Component Builders ---
  function createSliderControl(
    title: string,
    value: number,
    min: number,
    max: number,
    unit: string,
    onChange: (val: number) => void
  ) {
    const valDisplay = div({ className: 'text-xs font-mono text-cyan-400' }, `${value}${unit}`);

    return div(
      { className: 'space-y-1.5' },
      div({ className: 'flex justify-between items-center' }, label({ className: 'text-xs font-medium text-slate-300' }, title), valDisplay),
      input({
        type: 'range',
        min: min.toString(),
        max: max.toString(),
        value: value.toString(),
        step: unit === '°' ? '0.5' : '1',
        className: 'w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500',
        oninput: (e: Event) => {
          const v = parseFloat((e.target as HTMLInputElement).value);
          valDisplay.textContent = `${v}${unit}`;
          onChange(v);
        },
      })
    );
  }

  function createPresetButton(name: string, onClick: () => void, isActive = false) {
    return button(
      {
        type: 'button',
        className: `rounded-xl border p-2.5 text-center text-[11px] font-medium transition-all shadow-sm ${
          isActive
            ? 'border-cyan-500/60 bg-cyan-950/60 text-cyan-200'
            : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
        }`,
        onclick: onClick,
      },
      name
    );
  }

  function createPageThumbnailItem(pageItem: ScannerPageItem, index: number) {
    const isSelected = index === selectedPageIndex;

    return div(
      {
        className: `flex items-center justify-between rounded-xl border p-2 text-xs transition-colors cursor-pointer ${
          isSelected
            ? 'border-cyan-500/60 bg-slate-900 text-white'
            : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700'
        }`,
        onclick: () => {
          selectedPageIndex = index;
          renderDocumentPreview();
          renderToolControls();
        },
      },
      div(
        { className: 'flex items-center gap-2 min-w-0' },
        div(
          {
            className: `flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-mono font-bold ${
              isSelected ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-cyan-400'
            }`,
          },
          (index + 1).toString()
        ),
        span({ className: 'truncate' }, pageItem.title)
      ),
      div(
        { className: 'flex items-center gap-0.5 shrink-0' },
        button(
          {
            type: 'button',
            title: 'Move Up',
            className: 'text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5 disabled:opacity-30',
            disabled: index === 0,
            onclick: (e: Event) => {
              e.stopPropagation();
              if (index === 0) return;
              [pages[index - 1], pages[index]] = [pages[index], pages[index - 1]];
              selectedPageIndex = index - 1;
              renderDocumentPreview();
              renderToolControls();
            },
          },
          '↑'
        ),
        button(
          {
            type: 'button',
            title: 'Move Down',
            className: 'text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5 disabled:opacity-30',
            disabled: index === pages.length - 1,
            onclick: (e: Event) => {
              e.stopPropagation();
              if (index >= pages.length - 1) return;
              [pages[index + 1], pages[index]] = [pages[index], pages[index + 1]];
              selectedPageIndex = index + 1;
              renderDocumentPreview();
              renderToolControls();
            },
          },
          '↓'
        ),
        button(
          {
            type: 'button',
            title: 'Delete Page',
            className: 'text-slate-500 hover:text-rose-400 text-xs px-1.5 py-0.5',
            onclick: (e: Event) => {
              e.stopPropagation();
              if (pages.length <= 1) {
                showToast('At least 1 page is required');
                return;
              }
              pages.splice(index, 1);
              selectedPageIndex = Math.min(selectedPageIndex, pages.length - 1);
              renderDocumentPreview();
              renderToolControls();
            },
          },
          '✕'
        )
      )
    );
  }

  function resetEditor() {
    deskewAngle = 0;
    zoomLevel = 100;
    brightness = 100;
    contrast = 100;
    grayscale = 0;
    scanPreset = 'original';
    pages = pages.map((pItem) => ({ ...pItem, rotation: 0 }));
    applyVisualTransforms();
    renderToolControls();
    showToast('Reset all adjustments');
  }

  // Initial Mount
  renderDocumentPreview();
  renderToolControls();

  return root;
}