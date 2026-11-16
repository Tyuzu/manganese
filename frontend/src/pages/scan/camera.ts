import { canvas, div, img, video } from '../../components/ui/dom';
import type { ScanMode } from './controls';

export interface ScanCameraControllerOptions {
  previewFrame: HTMLDivElement;
  getMode: () => ScanMode;
  setStatus: (message: string) => void;
}

function createLiveVideo(): HTMLVideoElement {
  const v = video({
    autoplay: true,
    playsInline: true,
    muted: true,
    style: 'width: 100%; height: 100%; object-fit: cover; background: #0f172a;'
  });
  v.setAttribute('playsinline', 'true');
  v.setAttribute('webkit-playsinline', 'true');
  return v;
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
  let currentObjectUrl: string | null = null;
  
  // Track current camera facing mode ('environment' = rear, 'user' = front)
  let currentFacingMode: 'environment' | 'user' = 'environment';

  const videoEl = createLiveVideo();
  const cameraOverlay = createCameraOverlay();

  const showLivePreview = () => {
    const wrapper = div({ style: 'position: relative; width: 100%; height: 420px; border-radius: 12px; overflow: hidden;' });
    wrapper.append(videoEl, cameraOverlay);
    previewFrame.replaceChildren(wrapper);
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    cameraReady = false;
  };

  const requestCameraStream = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires a secure context (HTTPS or localhost).');
    }

    // Robust candidate constraints with graceful fallbacks for Mobile Firefox & Android
    const candidates: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { exact: currentFacingMode },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: currentFacingMode },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: currentFacingMode === 'environment' ? 'user' : 'environment' },
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let lastError: unknown;

    for (const constraints of candidates) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Camera access was denied or unavailable.');
  };

  const startCamera = async () => {
    try {
      stopCamera();
      setStatus(`Opening ${currentFacingMode === 'environment' ? 'rear' : 'front'} camera...`);

      showLivePreview();

      stream = await requestCameraStream();
      videoEl.srcObject = stream;
      videoEl.muted = true;

      await videoEl.play();
      cameraReady = true;
      setStatus(`Live camera preview active (${currentFacingMode === 'environment' ? 'Rear' : 'Front'})`);
    } catch (error: any) {
      stopCamera();
      cameraReady = false;
      console.error('Camera initialization failed:', error);

      let errorMsg = 'Unable to access camera.';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission denied. Please allow camera access in your mobile browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera device found.';
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        errorMsg = 'Camera resolution constraints not supported by mobile browser.';
      }
      setStatus(errorMsg);
    }
  };

  const toggleCamera = async () => {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    if (cameraReady || stream) {
      await startCamera();
    } else {
      setStatus(`Default camera switched to ${currentFacingMode === 'environment' ? 'rear' : 'front'}`);
    }
  };

  const setPreviewFromFile = (file: File) => {
    stopCamera();

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const src = isPdf
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
            <rect width="100%" height="100%" fill="#e5e7eb"/>
            <text x="50%" y="50%" text-anchor="middle" fill="#111827" font-size="28" font-family="Arial">${file.name}</text>
          </svg>
        `)
      : (currentObjectUrl = URL.createObjectURL(file));

    const previewImage = createDocumentPreview(file.name, src);
    previewFrame.replaceChildren(previewImage);

    const modeLabel = getMode() === 'pdf' ? 'PDF' : 'photo';
    setStatus(`${file.name} ready for ${modeLabel} export`);
  };

  const capturePhoto = () => {
    if (!cameraReady || !stream || !videoEl.videoWidth) {
      setStatus('Camera is not active. Start the camera before capturing.');
      return;
    }

    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    const canvasEl = createCaptureCanvas(width, height);
    const ctx = canvasEl.getContext('2d');
    if (!ctx) {
      setStatus('Failed to process image capture context.');
      return;
    }

    ctx.drawImage(videoEl, 0, 0, width, height);

    const image = createDocumentPreview('Captured document', canvasEl.toDataURL('image/png'));
    previewFrame.replaceChildren(image);
    const modeLabel = getMode() === 'pdf' ? 'PDF export' : 'photo export';
    setStatus(`Photo captured for ${modeLabel}`);
    stopCamera();
  };

  return {
    startCamera,
    stopCamera,
    toggleCamera,
    setPreviewFromFile,
    capturePhoto,
  };
}