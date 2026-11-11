import { button, cn, div, h1, input, p, span, uiClasses } from '../components/ui/dom';
import { createScanCameraController } from './scan/camera';
import { createActionRow, createModeToggle, createUploadToolbar, type ScanMode } from './scan/controls';

export async function createScanPage(): Promise<HTMLElement> {
  const root = div({ className: uiClasses.card },
    h1({ className: 'm-0 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl' }, 'CamScanner-style Scan'),
    p({ className: 'mt-3 text-sm leading-6 text-slate-600' }, 'Scan documents and convert them into PDF or photo output.')
  );

  const fileInput = input({ type: 'file', accept: 'image/*,.pdf', style: 'display: none;' });
  const previewFrame = div({ className: 'mt-6 min-h-[280px] rounded-[22px] border border-slate-200 bg-slate-100 p-3' },
    div({ className: 'flex min-h-[250px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-lg font-semibold text-slate-500' }, 'No document selected yet')
  );

  const statusBox = div({ className: cn(uiClasses.panel, 'mt-6 flex flex-col gap-3') },
    p({ className: 'm-0 text-sm text-slate-600' }, span({ className: 'font-bold text-slate-800' }, 'Mode: '), 'PDF'),
    p({ className: 'm-0 text-sm text-slate-600' }, span({ className: 'font-bold text-slate-800' }, 'Status: '), 'Waiting for document upload or camera capture'),
    p({ className: 'm-0 text-sm text-slate-600' }, span({ className: 'font-bold text-slate-800' }, 'Quality: '), 'HD mode')
  );

  let currentMode: ScanMode = 'pdf';
  const setStatus = (message: string) => {
    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = `Status: ${message}`;
  };

  const controller = createScanCameraController({
    previewFrame,
    getMode: () => currentMode,
    setStatus,
  });

  const exportButtons = createModeToggle((mode) => {
    currentMode = mode;
    const modeText = statusBox.querySelectorAll('p')[0];
    modeText.textContent = `Mode: ${mode === 'pdf' ? 'PDF' : 'Photo'}`;
    setStatus(mode === 'pdf' ? 'PDF mode ready' : 'Photo mode ready');
  });

  const uploadRow = createUploadToolbar(
    () => fileInput.click(),
    () => {
      void controller.startCamera();
    }
  );

  const flashButton = button({ type: 'button', className: uiClasses.secondaryButton }, 'Flash off');
  const captureButton = button({ type: 'button', className: uiClasses.primaryButton }, 'Capture');
  const retakeButton = button({ type: 'button', className: uiClasses.secondaryButton }, 'Retake');
  const liveControls = div({ className: 'mt-6 flex flex-wrap gap-3' }, captureButton, flashButton, retakeButton);

  let flashEnabled = false;
  captureButton.addEventListener('click', () => controller.capturePhoto());
  retakeButton.addEventListener('click', () => {
    void controller.startCamera();
  });
  flashButton.addEventListener('click', () => {
    flashEnabled = !flashEnabled;
    flashButton.textContent = flashEnabled ? 'Flash on' : 'Flash off';
    setStatus(flashEnabled ? 'Flash enabled for next capture' : 'Flash disabled');
  });

  const actionRow = createActionRow(() => {
    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = `Status: ${currentMode === 'pdf' ? 'Document exported as PDF' : 'Document exported as photo'} successfully`;
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    controller.setPreviewFromFile(file);
  });

  root.append(uploadRow, liveControls, exportButtons, previewFrame, statusBox, actionRow);
  return root;
}
