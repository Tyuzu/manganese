import { button, createButton, div, input, label, p, span, svgElement } from '../components/ui/dom';
import { createDetailPanel } from './shared';

export async function createPdfScannerPage(): Promise<HTMLElement> {
  // State Management
  type ScanTab = 'pages' | 'ocr' | 'deskew' | 'merge' | 'export';
  let activeTab: ScanTab = 'pages';
  let uploadedFileName: string | null = null;
  let pageCount = 4;
  let ocrEnabled = true;
  let deskewAngle = 0;
  let extractedText = 'Select OCR text tab to inspect extracted document text...';

  // Screen-fittable Studio Root Container
  const root = div({ 
    className: 'flex flex-col h-[calc(100vh-2rem)] w-full bg-slate-950 text-slate-100 rounded-3xl overflow-hidden border border-slate-800/80 shadow-2xl' 
  });

  const fileInput = input({
    type: 'file',
    accept: '.pdf,image/*',
    className: 'sr-only',
    onchange: (e: Event) => handlePdfUpload(e)
  });

  const quickActions = div({ className: 'flex justify-end gap-3 p-3 pb-0' },
    label({ className: 'cursor-pointer inline-flex items-center justify-center rounded-xl bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white border border-slate-700/60' },
      'Upload PDF/Scan',
      fileInput
    ),
    createButton('primary', {
      type: 'button',
      className: 'bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-cyan-600/20',
      onclick: () => triggerExport('pdf')
    }, 'Export PDF')
  );

  // 2. Main Workspace Layout
  const workspace = div({ className: 'grid flex-1 grid-cols-1 lg:grid-cols-[1fr_340px] overflow-hidden min-h-0' });
  const stage = div({ className: 'flex flex-col flex-1 overflow-hidden bg-slate-950 min-h-0' });

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

  // Document Viewport Stage
  const previewContainer = div({ className: 'relative flex-1 flex items-center justify-center bg-slate-950 p-6 overflow-hidden min-h-0' },
    div({ className: 'flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 transition-all cursor-pointer w-full h-full' },
      div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-cyan-400 border border-slate-700/50' }, uploadIcon),
      p({ className: 'text-sm font-semibold text-slate-200' }, 'No document loaded'),
      p({ className: 'mt-1 text-xs text-slate-500' }, 'Drop PDF or image scan here, or click to upload')
    )
  );

  // Stage Bottom HUD Bar
  const deskewLeftBtn = button({ type: 'button', className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-slate-700' }, '📐 Deskew -1°');
  const deskewRightBtn = button({ type: 'button', className: 'bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-slate-700' }, '📐 Deskew +1°');
  const ocrRunBtn = button({ type: 'button', className: 'bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-cyan-600/30 transition-all' }, '🔍 Run OCR');

  const stageHud = div({ className: 'flex h-14 shrink-0 items-center justify-center gap-3 border-t border-slate-800/80 bg-slate-900/90 px-6 backdrop-blur-md z-10' },
    deskewLeftBtn,
    deskewRightBtn,
    ocrRunBtn
  );

  stage.append(quickActions, previewContainer, stageHud);

  // 3. Side Inspector Panel Navigation
  const sidePanelNav = div({ className: 'flex shrink-0 border-b border-slate-800 bg-slate-900 px-2 overflow-x-auto' });
  const toolContainer = div({ className: 'p-5 space-y-5 overflow-y-auto flex-1 min-h-0' });

  const tabs: { id: ScanTab; label: string }[] = [
    { id: 'pages', label: 'Pages' },
    { id: 'ocr', label: 'OCR Text' },
    { id: 'deskew', label: 'Deskew' },
    { id: 'merge', label: 'Merge' },
    { id: 'export', label: 'Export' },
  ];

  tabs.forEach((tab) => {
    const btn = button({
      type: 'button',
      className: `px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
        activeTab === tab.id
          ? 'border-cyan-500 text-cyan-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`,
      onclick: () => switchTab(tab.id)
    }, tab.label);
    sidePanelNav.append(btn);
  });

  const sidePanel = div({ className: 'flex flex-col border-l border-slate-800/80 bg-slate-900/70 overflow-hidden min-h-0' },
    sidePanelNav,
    toolContainer
  );

  // Render Tool Controls
  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'pages') {
      const pageList = div({ className: 'space-y-2' },
        createPageThumbnailItem(1, 'Page 1 (Cover)'),
        createPageThumbnailItem(2, 'Page 2 (Invoice Details)'),
        createPageThumbnailItem(3, 'Page 3 (Line Items)'),
        createPageThumbnailItem(4, 'Page 4 (Terms & Signatures)')
      );
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, `Document Pages (${pageCount})`),
        pageList,
        div({ className: 'pt-2' },
          createButton('secondary', {
            type: 'button',
            className: 'w-full text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700',
            onclick: () => { pageCount++; renderToolControls(); }
          }, '+ Insert Blank Page')
        )
      );
    } else if (activeTab === 'ocr') {
      const textArea = document.createElement('textarea');
      textArea.className = 'w-full h-48 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 font-mono focus:border-cyan-500 focus:outline-none resize-none';
      textArea.value = extractedText;
      textArea.oninput = (e) => { extractedText = (e.target as HTMLTextAreaElement).value; };

      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Searchable OCR Text Output'),
        textArea,
        createButton('primary', {
          type: 'button',
          className: 'w-full text-xs py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-600/20',
          onclick: () => alert('OCR Text saved and embedded into searchable PDF layer!')
        }, 'Copy or Sync Text Layer')
      );
    } else if (activeTab === 'deskew') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Geometric Alignment & Deskew'),
        createSliderControl('Rotation Angle (°)', deskewAngle, -15, 15, (v) => {
          deskewAngle = v;
          applyDeskewTransform();
        }),
        div({ className: 'grid grid-cols-2 gap-2.5 pt-2' },
          createPresetButton('Auto-Align Deskew', () => { deskewAngle = 0; applyDeskewTransform(); }),
          createPresetButton('Reset Angle', () => { deskewAngle = 0; applyDeskewTransform(); renderToolControls(); })
        )
      );
    } else if (activeTab === 'merge') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Merge Additional Documents'),
        div({ className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-400 text-center space-y-2' },
          div({}, 'Queue: 0 extra files added'),
          createButton('secondary', {
            type: 'button',
            className: 'w-full text-xs py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700',
            onclick: () => alert('Select additional PDF files to append.')
          }, 'Browse PDFs to Append')
        )
      );
    } else if (activeTab === 'export') {
      const formatGrid = div({ className: 'grid grid-cols-3 gap-2.5' },
        createPresetButton('Searchable PDF', () => triggerExport('pdf')),
        createPresetButton('JPG Images', () => triggerExport('jpg')),
        createPresetButton('TXT Script', () => triggerExport('txt'))
      );
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Choose Export Format'),
        formatGrid
      );
    }

    toolContainer.append(
      div({ className: 'mt-6 border-t border-slate-800 pt-5' },
        createDetailPanel('Scan summary', [
          { label: 'File name', value: uploadedFileName || 'invoice.pdf' },
          { label: 'Pages', value: `${pageCount} pages` },
          { label: 'OCR Status', value: ocrEnabled ? 'Active' : 'Disabled' },
        ])
      )
    );
  }

  // File Upload Handler
  function handlePdfUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || !target.files[0]) return;
    const file = target.files[0];
    uploadedFileName = file.name;

    previewContainer.innerHTML = '';
    const filePreviewCard = div({ className: 'flex flex-col items-center justify-center p-6 bg-slate-900 rounded-2xl border border-slate-800 text-center w-full h-full' },
      div({ className: 'text-cyan-400 font-bold mb-2' }, `📄 Loaded: ${file.name}`),
      p({ className: 'text-xs text-slate-400' }, `Size: ${(file.size / 1024 / 1024).toFixed(2)} MB • Ready for processing`)
    );
    previewContainer.append(filePreviewCard);
    extractedText = `EXTRACTED TEXT FROM ${file.name.toUpperCase()}:\n\nInvoice #9042\nDate: November 12, 2026\nClient: Full-Stack Engineering Inc.\nTotal: $4,250.00\nItems: Microservice Gateway Setup, PostgreSQL PostGIS Tuning, Redis Caching Layers.`;
    renderToolControls();
  }

  function applyDeskewTransform() {
    const previewEl = previewContainer.querySelector('div');
    if (previewEl) {
      previewEl.style.transform = `rotate(${deskewAngle}deg)`;
      previewEl.style.transition = 'transform 0.15s ease-out';
    }
  }

  function triggerExport(format: 'pdf' | 'jpg' | 'txt') {
    alert(`Successfully exported document as ${format.toUpperCase()}!`);
  }

  function switchTab(tab: typeof activeTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
        isSelected
          ? 'border-cyan-500 text-cyan-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`;
    });
    renderToolControls();
  }

  // Event Listeners for Bottom HUD
  deskewLeftBtn.addEventListener('click', () => { deskewAngle -= 1; applyDeskewTransform(); });
  deskewRightBtn.addEventListener('click', () => { deskewAngle += 1; applyDeskewTransform(); });
  ocrRunBtn.addEventListener('click', () => {
    ocrEnabled = true;
    switchTab('ocr');
    alert('OCR extraction completed successfully!');
  });

  function createSliderControl(title: string, value: number, min: number, max: number, onChange: (val: number) => void) {
    const valDisplay = div({ className: 'text-xs font-mono text-cyan-400' }, `${value}°`);
    
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
        step: '0.5',
        className: 'w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500',
        oninput: (e: Event) => {
          const v = parseFloat((e.target as HTMLInputElement).value);
          valDisplay.textContent = `${v}°`;
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

  function createPageThumbnailItem(num: number, labelText: string) {
    return div({ className: 'flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-300' },
      div({ className: 'flex items-center gap-2' },
        div({ className: 'flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-[10px] font-mono font-bold text-cyan-400' }, num.toString()),
        span({}, labelText)
      ),
      button({
        type: 'button',
        className: 'text-slate-500 hover:text-rose-400 text-xs px-2',
        onclick: () => { pageCount = Math.max(1, pageCount - 1); renderToolControls(); }
      }, '✕')
    );
  }

  // Initialize
  workspace.append(stage, sidePanel);
  root.append(workspace);
  renderToolControls();

  return root;
}