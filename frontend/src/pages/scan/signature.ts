import { div, p } from '../../components/ui/dom';
import type { ScannedPage } from './types';

export interface ScanSignatureModalOptions {
  getPage: () => ScannedPage | null;
  setStatus: (message: string) => void;
  renderStagePreview: () => void;
  renderToolControls: () => void;
  persistState: () => void;
  makeButton: (
    text: string,
    className: string,
    onClick: () => void,
    disabled?: boolean
  ) => HTMLButtonElement;
}

export function createScanSignatureModal({
  getPage,
  setStatus,
  renderStagePreview,
  renderToolControls,
  persistState,
  makeButton,
}: ScanSignatureModalOptions) {
  return function openSignaturePadModal() {
    const page = getPage();

    if (!page) {
      setStatus('Select a page first');
      return;
    }

    const overlay = div({ className: 'scan-modal-overlay' });
    const modal = div({ className: 'scan-signature-modal' });

    const heading = div(
      { className: 'scan-modal-heading' },
      p({}, 'Draw your signature'),
      makeButton('×', 'scan-modal-close', () => closeModal())
    );

    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 400;
    canvas.className = 'scan-signature-canvas';

    const canvasWrapper = div(
      { className: 'scan-signature-canvas-wrapper' },
      canvas
    );

    const context = canvas.getContext('2d');

    if (context) {
      context.strokeStyle = '#111827';
      context.lineWidth = 5;
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }

    let drawing = false;

    const getPosition = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();

      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);

      const point = getPosition(event);

      context?.beginPath();
      context?.moveTo(point.x, point.y);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drawing) return;

      const point = getPosition(event);

      context?.lineTo(point.x, point.y);
      context?.stroke();
    };

    const onPointerUp = () => {
      drawing = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    const clearButton = makeButton(
      'Clear',
      'scan-button scan-button-muted',
      () => context?.clearRect(0, 0, canvas.width, canvas.height)
    );

    const saveButton = makeButton(
      'Apply signature',
      'scan-button scan-button-primary',
      () => {
        page.signatureDataUrl = canvas.toDataURL('image/png');

        renderStagePreview();
        renderToolControls();
        persistState();

        setStatus('Signature attached');
        closeModal();
      }
    );

    const actions = div(
      { className: 'scan-modal-actions' },
      clearButton,
      saveButton
    );

    modal.append(heading, canvasWrapper, actions);
    overlay.append(modal);
    document.body.append(overlay);

    function closeModal() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);

      overlay.remove();
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
  };
}
