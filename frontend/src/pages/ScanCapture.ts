import { button, createButton, div, input, label, p, span, svgElement } from '../components/ui/dom';
import { createDetailPanel, createEditorFooter, createEditorTitleRow } from './shared';
import { createScanCameraController } from './scan/camera';
import type { ScanMode } from './scan/controls';

export async function createScanPage(): Promise<HTMLElement> {
  // State Management
  let currentMode: ScanMode = 'pdf';
  type ScanTab = 'mode' | 'filters' | 'batch' | 'export';
  let activeTab: ScanTab = 'mode';
  let flashEnabled = false;
  let activeFilter: 'magic' | 'gray' | 'bw' | 'original' = 'magic';
  let scanName = `Scan_${new Date().toISOString().slice(0, 10)}`;
  let controller!: ReturnType<typeof createScanCameraController>;

  const handleFileUpload = (event: Event) => {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    controller.setPreviewFromFile(file);
    setStatus('Document loaded successfully');
  };

  const root = div({
    className: 'min-h-screen bg-[#edf0f1] p-4 sm:p-8 lg:p-10 flex items-center justify-center'
  });

  const modal = div({
    className: 'w-full max-w-[980px] rounded-[28px] border border-slate-700/70 bg-[#536d7b] shadow-[0_25px_60px_rgba(15,23,42,0.2)] overflow-hidden'
  });

  const fileInput = input({
    type: 'file',
    accept: 'image/*,.pdf',
    className: 'sr-only',
    onchange: handleFileUpload
  });

  const quickActions = div({ className: 'flex justify-end gap-3' },
    label({ className: 'cursor-pointer inline-flex items-center justify-center rounded-xl bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white border border-slate-700/60' },
      'Upload File',
      fileInput
    ),
    createButton('primary', {
      type: 'button',
      className: 'bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20',
      onclick: () => triggerExport()
    }, 'Export PDF')
  );

  const { titleRow, fullscreenButton } = createEditorTitleRow(
    'Edit your scan',
    () => resetEditor(),
    () => toggleEditorFullscreen()
  );

  const sidePanelNav = div({ className: 'flex gap-3 px-5 pb-2' });
  const toolContainer = div({ className: 'space-y-4' });

  const tabs: { id: ScanTab; label: string }[] = [
    { id: 'mode', label: 'MODE' },
    { id: 'filters', label: 'FILTERS' },
    { id: 'batch', label: 'BATCH' },
    { id: 'export', label: 'EXPORT' },
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

  const sidePanel = div({ className: 'w-[270px] shrink-0 rounded-[18px] border border-white/5 bg-[#49677a]/60 p-3' },
    toolContainer
  );

  const stage = div({ className: 'relative flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-800/50 bg-[#4f6675] p-4 min-h-0' },
    div({ className: 'mb-3 flex justify-end' }, quickActions)
  );

  // Document Preview Stage
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
      d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    })
  );

  const previewFrame = div({ className: 'relative flex-1 flex items-center justify-center bg-slate-950 p-6 overflow-hidden min-h-0' },
    div({ className: 'flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 transition-all cursor-pointer w-full h-full' },
      div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-emerald-400 border border-slate-700/50' }, uploadIcon),
      p({ className: 'text-sm font-semibold text-slate-200' }, 'No document selected yet'),
      p({ className: 'mt-1 text-xs text-slate-500' }, 'Drop files here, open camera, or click to upload')
    )
  );

  const setStatus = (message: string) => {
    const statusText = statusBox.querySelector('#status-msg');
    if (statusText) statusText.textContent = message;
  };

  controller = createScanCameraController({
    previewFrame,
    getMode: () => currentMode,
    setStatus,
  });

  // Stage Bottom Live HUD Bar
  const captureButton = button({ type: 'button', className: 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition-all' }, '📷 Capture');
  const flashButton = button({ type: 'button', className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-slate-700' }, '⚡ Flash Off');
  const retakeButton = button({ type: 'button', className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-slate-700' }, '🔄 Retake');
  
  const stageHud = div({ className: 'flex h-14 shrink-0 items-center justify-center gap-3 border-t border-slate-800/80 bg-slate-900/90 px-6 backdrop-blur-md z-10' },
    captureButton,
    flashButton,
    retakeButton
  );

  stage.append(quickActions, previewFrame, stageHud);

  // 3. Side Inspector Panel Navigation
  const workspace = div({ className: 'flex gap-5 px-5 pb-5' }, sidePanel, stage);
  const modalFooter = createEditorFooter(() => resetEditor(), () => triggerExport());

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

  const statusBox = div({ className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs space-y-1.5' },
    div({ className: 'flex justify-between' }, span({ className: 'text-slate-400' }, 'Mode'), span({ className: 'font-semibold text-emerald-400' }, 'PDF Document')),
    div({ className: 'flex justify-between' }, span({ className: 'text-slate-400' }, 'Status'), span({ id: 'status-msg', className: 'text-slate-200 font-mono' }, 'Waiting for upload')),
    div({ className: 'flex justify-between' }, span({ className: 'text-slate-400' }, 'Quality'), span({ className: 'text-slate-200' }, 'HD Auto-Crop'))
  );

  // Render Tool Controls
  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'mode') {
      const modeGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('📄 PDF Document', () => { currentMode = 'pdf'; setStatus('PDF Mode active'); }),
        createPresetButton('🪪 ID Card / Passport', () => { currentMode = 'pdf'; setStatus('ID Card mode'); }),
        createPresetButton('🔍 OCR Text Scan', () => { currentMode = 'pdf'; setStatus('OCR Extraction ready'); }),
        createPresetButton('🖼️ HD Photo Mode', () => { currentMode = 'photo'; setStatus('Photo mode active'); })
      );
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Document Type'),
        modeGrid
      );
    } else if (activeTab === 'filters') {
      const filterGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('✨ Magic Color', () => { activeFilter = 'magic'; applyFilterEffect(); }),
        createPresetButton('⬛ Grayscale', () => { activeFilter = 'gray'; applyFilterEffect(); }),
        createPresetButton('🖋️ B&W High Contrast', () => { activeFilter = 'bw'; applyFilterEffect(); }),
        createPresetButton('📷 Original', () => { activeFilter = 'original'; applyFilterEffect(); })
      );
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'CamScanner Enhancement Filters'),
        filterGrid
      );
    } else if (activeTab === 'batch') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Multi-Page Batch Stack'),
        div({ className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-400 text-center' }, 'No additional pages in batch stack'),
        createButton('secondary', {
          type: 'button',
          className: 'w-full text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700',
          onclick: () => void controller.startCamera()
        }, '+ Add Page to Stack')
      );
    } else if (activeTab === 'export') {
      const nameInput = input({
        type: 'text',
        value: scanName,
        className: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none',
        oninput: (e: Event) => {
          scanName = (e.target as HTMLInputElement).value;
        }
      });

      toolContainer.append(
        div({ className: 'space-y-4' },
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Document File Name'),
            nameInput
          ),
          createButton('primary', {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20',
            onclick: () => triggerExport()
          }, 'Download PDF / Package')
        )
      );
    }

    toolContainer.append(
      div({ className: 'mt-6 border-t border-slate-800 pt-5' },
        statusBox,
        div({ className: 'mt-4' },
          createDetailPanel('Scan info', [
            { label: 'Engine', value: 'Edge-detect v2' },
            { label: 'Output', value: currentMode.toUpperCase() },
            { label: 'Status', value: 'Ready' },
          ])
        )
      )
    );
  }

  // Event Listeners
  captureButton.addEventListener('click', () => controller.capturePhoto());
  retakeButton.addEventListener('click', () => void controller.startCamera());
  flashButton.addEventListener('click', () => {
    flashEnabled = !flashEnabled;
    flashButton.textContent = flashEnabled ? '⚡ Flash On' : '⚡ Flash Off';
    setStatus(flashEnabled ? 'Flash enabled for next capture' : 'Flash disabled');
  });

  fileInput.addEventListener('change', handleFileUpload);

  function applyFilterEffect() {
    const imgEl = previewFrame.querySelector('img');
    if (imgEl) {
      if (activeFilter === 'magic') imgEl.style.filter = 'contrast(130%) brightness(105%) saturate(120%)';
      if (activeFilter === 'gray') imgEl.style.filter = 'grayscale(100%) contrast(120%)';
      if (activeFilter === 'bw') imgEl.style.filter = 'grayscale(100%) contrast(200%) brightness(110%)';
      if (activeFilter === 'original') imgEl.style.filter = 'none';
      setStatus(`Applied ${activeFilter} filter`);
    }
  }

  function triggerExport() {
    setStatus(`${currentMode === 'pdf' ? 'PDF Document' : 'Photo'} exported successfully as "${scanName}.pdf"`);
    alert(`Document "${scanName}" successfully exported!`);
  }

  function switchTab(tab: typeof activeTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `inline-flex min-w-[90px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[120px] sm:px-3 sm:text-[11px] ${
        isSelected
          ? 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`;
    });
    renderToolControls();
  }

  function createPresetButton(name: string, onClick: () => void) {
    return button({
      type: 'button',
      className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-left text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-all shadow-sm',
      onclick: onClick
    }, name);
  }

  function resetEditor() {
    flashEnabled = false;
    flashButton.textContent = '⚡ Flash Off';
    setStatus('Waiting for upload');
    activeFilter = 'original';
    applyFilterEffect();
    renderToolControls();
  }

  renderToolControls();

  return root;
}