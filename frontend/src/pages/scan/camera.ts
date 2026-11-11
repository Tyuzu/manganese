import { div } from '../../components/ui/dom';
import type { ScanMode } from './controls';

export interface ScanCameraControllerOptions {
  previewFrame: HTMLDivElement;
  getMode: () => ScanMode;
  setStatus: (message: string) => void;
}

export function createScanCameraController({
  previewFrame,
  getMode,
  setStatus,
}: ScanCameraControllerOptions) {
  let stream: MediaStream | null = null;
  let cameraReady = false;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.style.width = '100%';
  video.style.height = '420px';
  video.style.objectFit = 'cover';
  video.style.borderRadius = '12px';
  video.style.background = '#0f172a';

  const cameraOverlay = div({
    style: 'position: absolute; inset: 0; border: 2px solid rgba(255,255,255,0.8); border-radius: 12px; pointer-events: none;'
  });

  const showLivePreview = () => {
    const wrapper = div({ style: 'position: relative; width: 100%; height: 420px;' });
    wrapper.append(video, cameraOverlay);
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
      video.srcObject = stream;
      await video.play();
      cameraReady = true;
      showLivePreview();
    } catch (_err) {
      setStatus('Unable to access camera. Please upload a file instead.');
    }
  };

  const setPreviewFromFile = (file: File) => {
    stopCamera();
    cameraReady = false;

    const previewImage = document.createElement('img');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      previewImage.alt = file.name;
      previewImage.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
          <rect width="100%" height="100%" fill="#e5e7eb"/>
          <text x="50%" y="50%" text-anchor="middle" fill="#111827" font-size="28" font-family="Arial">${file.name}</text>
        </svg>
      `);
    } else {
      previewImage.src = URL.createObjectURL(file);
      previewImage.alt = file.name;
    }

    previewImage.style.maxWidth = '100%';
    previewImage.style.maxHeight = '420px';
    previewImage.style.borderRadius = '12px';
    previewImage.style.objectFit = 'contain';
    previewFrame.replaceChildren(previewImage);

    const modeLabel = getMode() === 'pdf' ? 'PDF' : 'photo';
    setStatus(`${file.name} ready for ${modeLabel} export`);
  };

  const capturePhoto = () => {
    if (!cameraReady || !stream) {
      setStatus('Start the camera before capturing');
      return;
    }

    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);

    const image = document.createElement('img');
    image.src = canvas.toDataURL('image/png');
    image.alt = 'Captured document';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '420px';
    image.style.borderRadius = '12px';
    image.style.objectFit = 'contain';

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
