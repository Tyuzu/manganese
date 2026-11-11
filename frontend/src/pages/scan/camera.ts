import { canvas, div, img, video } from '../../components/ui/dom';
import type { ScanMode } from './controls';

export interface ScanCameraControllerOptions {
  previewFrame: HTMLDivElement;
  getMode: () => ScanMode;
  setStatus: (message: string) => void;
}

function createLiveVideo(): HTMLVideoElement {
  return video({
    autoplay: true,
    playsInline: true,
    muted: true,
    style: 'width: 100%; height: 420px; object-fit: cover; border-radius: 12px; background: #0f172a;'
  });
}

function createCameraOverlay(): HTMLDivElement {
  return div({
    style: 'position: absolute; inset: 0; border: 2px solid rgba(255,255,255,0.8); border-radius: 12px; pointer-events: none;'
  });
}

function createDocumentPreview(fileName: string, src: string): HTMLImageElement {
  return img({
    src,
    alt: fileName,
    style: 'max-width: 100%; max-height: 420px; border-radius: 12px; object-fit: contain;'
  });
}

function createCaptureCanvas(width: number, height: number): HTMLCanvasElement {
  return canvas({ width, height });
}

export function createScanCameraController({
  previewFrame,
  getMode,
  setStatus,
}: ScanCameraControllerOptions) {
  let stream: MediaStream | null = null;
  let cameraReady = false;

  const videoEl = createLiveVideo();
  const cameraOverlay = createCameraOverlay();

  const showLivePreview = () => {
    const wrapper = div({ style: 'position: relative; width: 100%; height: 420px;' });
    wrapper.append(videoEl, cameraOverlay);
    previewFrame.replaceChildren(wrapper);
    setStatus('Live camera preview active');
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Camera access is not supported on this browser');
      return;
    }

    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      cameraReady = true;
      showLivePreview();
    } catch (_err) {
      setStatus('Unable to access camera. Please upload a file instead.');
    }
  };

  const setPreviewFromFile = (file: File) => {
    stopCamera();
    cameraReady = false;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const previewImage = createDocumentPreview(
      file.name,
      isPdf
        ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
            <rect width="100%" height="100%" fill="#e5e7eb"/>
            <text x="50%" y="50%" text-anchor="middle" fill="#111827" font-size="28" font-family="Arial">${file.name}</text>
          </svg>
        `)
        : URL.createObjectURL(file)
    );

    previewFrame.replaceChildren(previewImage);

    const modeLabel = getMode() === 'pdf' ? 'PDF' : 'photo';
    setStatus(`${file.name} ready for ${modeLabel} export`);
  };

  const capturePhoto = () => {
    if (!cameraReady || !stream) {
      setStatus('Start the camera before capturing');
      return;
    }

    const width = videoEl.videoWidth || 1280;
    const height = videoEl.videoHeight || 720;
    const canvasEl = createCaptureCanvas(width, height);
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.drawImage(videoEl, 0, 0, width, height);

    const image = createDocumentPreview('Captured document', canvasEl.toDataURL('image/png'));
    previewFrame.replaceChildren(image);
    const modeLabel = getMode() === 'pdf' ? 'PDF export' : 'photo export';
    setStatus(`Photo captured for ${modeLabel}`);
    stopCamera();
    cameraReady = false;
  };

  return {
    startCamera,
    stopCamera,
    setPreviewFromFile,
    capturePhoto,
  };
}
