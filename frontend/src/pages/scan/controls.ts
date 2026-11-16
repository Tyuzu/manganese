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
  const activeClass = 'fluent-mode-toggle-btn is-active';
  const inactiveClass = 'fluent-mode-toggle-btn is-inactive';

  const pdfBtn = button({ type: 'button', className: activeClass }, 'Convert to PDF');
  const photoBtn = button({ type: 'button', className: inactiveClass }, 'Convert to Photo');

  const exportButtons = div({ className: 'fluent-mode-toggle-group' }, pdfBtn, photoBtn);

  const setMode = (mode: ScanMode) => {
    const isPdf = mode === 'pdf';
    pdfBtn.className = isPdf ? activeClass : inactiveClass;
    photoBtn.className = !isPdf ? activeClass : inactiveClass;
    pdfBtn.setAttribute('aria-pressed', String(isPdf));
    photoBtn.setAttribute('aria-pressed', String(!isPdf));
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
  return div({ className: 'fluent-upload-toolbar' },
    label({ className: 'fluent-toolbar-label' }, 'Capture or upload a document'),
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
  return div({ className: 'fluent-action-row' },
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onEnhanceClick }, 'Enhance contrast'),
    button({ type: 'button', className: uiClasses.secondaryButton, onClick: onOcrClick }, 'OCR text'),
    createButton('primary', { type: 'button', onClick: onExport }, 'Export file')
  );
}