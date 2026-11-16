import { button, createButton, div, label, uiClasses } from '../../components/ui/dom';

export type ScanMode = 'pdf' | 'photo';

export interface ScanToolbarOptions {
  onUploadClick: () => void;
  onCameraClick: () => void;
  onAutoCropClick?: () => void;
}

export interface ActionRowOptions {
  onExport: () => void;
  onEnhanceClick?: () => void;
  onOcrClick?: () => void;
}

export function createModeToggle(onChange: (mode: ScanMode) => void): HTMLDivElement {
  const activeClass = 'inline-flex items-center justify-center rounded-full border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500';
  const inactiveClass = 'inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50';

  const pdfBtn = button({ type: 'button', className: activeClass }, 'Convert to PDF');
  const photoBtn = button({ type: 'button', className: inactiveClass }, 'Convert to Photo');

  const exportButtons = div({ className: 'mt-6 flex flex-wrap gap-3' }, pdfBtn, photoBtn);

  const setMode = (mode: ScanMode) => {
    const isPdf = mode === 'pdf';
    pdfBtn.className = isPdf ? activeClass : inactiveClass;
    photoBtn.className = !isPdf ? activeClass : inactiveClass;
    onChange(mode);
  };

  pdfBtn.addEventListener('click', () => setMode('pdf'));
  photoBtn.addEventListener('click', () => setMode('photo'));

  return exportButtons;
}

export function createUploadToolbar({
  onUploadClick,
  onCameraClick,
  onAutoCropClick,
}: ScanToolbarOptions): HTMLDivElement {
  return div({ className: 'mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4' },
    label({ className: 'text-sm font-semibold text-slate-700' }, 'Capture or upload a document'),
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onUploadClick }, 'Upload document'),
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onCameraClick }, 'Use camera'),
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onAutoCropClick }, 'Auto-crop & straighten')
  );
}

export function createActionRow({
  onExport,
  onEnhanceClick,
  onOcrClick,
}: ActionRowOptions): HTMLDivElement {
  return div({ className: 'mt-6 flex flex-wrap gap-3' },
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onEnhanceClick }, 'Enhance contrast'),
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onOcrClick }, 'OCR text'),
    createButton('primary', { type: 'button', onClick: onExport }, 'Export file')
  );
}