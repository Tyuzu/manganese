import { button, createButton, div, label, uiClasses } from '../../components/ui/dom';

export type ScanMode = 'pdf' | 'photo';

export function createModeToggle(onChange: (mode: ScanMode) => void): HTMLDivElement {
  const exportButtons = div({ className: 'mt-6 flex flex-wrap gap-3' },
    button({ type: 'button', className: 'inline-flex items-center justify-center rounded-full border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500' }, 'Convert to PDF'),
    button({ type: 'button', className: 'inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50' }, 'Convert to Photo')
  );

  const setMode = (mode: ScanMode) => {
    const [pdfBtn, photoBtn] = exportButtons.children as HTMLCollectionOf<HTMLButtonElement>;
    pdfBtn.classList.toggle('bg-blue-600', mode === 'pdf');
    pdfBtn.classList.toggle('border-blue-600', mode === 'pdf');
    pdfBtn.classList.toggle('text-white', mode === 'pdf');
    pdfBtn.classList.toggle('bg-white', mode === 'photo');
    pdfBtn.classList.toggle('text-slate-700', mode === 'photo');
    pdfBtn.classList.toggle('border-slate-200', mode === 'photo');

    photoBtn.classList.toggle('bg-blue-600', mode === 'photo');
    photoBtn.classList.toggle('border-blue-600', mode === 'photo');
    photoBtn.classList.toggle('text-white', mode === 'photo');
    photoBtn.classList.toggle('bg-white', mode === 'pdf');
    photoBtn.classList.toggle('text-slate-700', mode === 'pdf');
    photoBtn.classList.toggle('border-slate-200', mode === 'pdf');

    onChange(mode);
  };

  exportButtons.children[0].addEventListener('click', () => setMode('pdf'));
  exportButtons.children[1].addEventListener('click', () => setMode('photo'));

  return exportButtons;
}

export function createUploadToolbar(
  onUploadClick: () => void,
  onCameraClick: () => void
): HTMLDivElement {
  return div({ className: 'mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4' },
    label({ className: 'text-sm font-semibold text-slate-700' }, 'Capture or upload a document'),
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onUploadClick }, 'Upload document'),
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onCameraClick }, 'Use camera'),
    button({ type: 'button', className: uiClasses.secondaryButton }, 'Auto-crop & straighten')
  );
}

export function createActionRow(onExport: () => void): HTMLDivElement {
  return div({ className: 'mt-6 flex flex-wrap gap-3' },
    button({ type: 'button', className: uiClasses.secondaryButton }, 'Enhance contrast'),
    button({ type: 'button', className: uiClasses.secondaryButton }, 'OCR text'),
    createButton('primary', { type: 'button', onClick: onExport }, 'Export file')
  );
}
