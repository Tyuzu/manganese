
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

  // Explicit properties are important for Firefox Android.
  v.autoplay = true;
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');

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

  let currentFacingMode: 'environment' | 'user' = 'environment';

  const videoEl = createLiveVideo();
  const cameraOverlay = createCameraOverlay();

  const showLivePreview = () => {
    const wrapper = div({
      style: 'position: relative; width: 100%; height: 420px; border-radius: 12px; overflow: hidden;'
    });

    wrapper.append(videoEl, cameraOverlay);
    previewFrame.replaceChildren(wrapper);
  };

  const stopCamera = () => {
    cameraReady = false;

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    videoEl.pause();
    videoEl.srcObject = null;
  };

  const requestCameraStream = async (): Promise<MediaStream> => {
    if (!window.isSecureContext) {
      throw new Error('Camera requires HTTPS or localhost.');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API is unavailable in this browser.');
    }

    const candidates: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: currentFacingMode },
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

        // Permission errors will not be fixed by trying another constraint.
        const name = (error as DOMException)?.name;

        if (
          name === 'NotAllowedError' ||
          name === 'SecurityError'
        ) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error('Unable to obtain camera stream.');
  };

  const waitForVideoMetadata = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }

      const cleanup = () => {
        videoEl.removeEventListener('loadedmetadata', onLoaded);
        videoEl.removeEventListener('error', onError);
        clearTimeout(timeout);
      };

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('Video metadata could not be loaded.'));
      };

      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Camera initialization timed out.'));
      }, 10000);

      videoEl.addEventListener('loadedmetadata', onLoaded, { once: true });
      videoEl.addEventListener('error', onError, { once: true });
    });
  };

  const startCamera = async () => {
    stopCamera();

    try {
      setStatus(
        `Opening ${currentFacingMode === 'environment' ? 'rear' : 'front'} camera...`
      );

      showLivePreview();

      stream = await requestCameraStream();

      videoEl.srcObject = stream;

      await waitForVideoMetadata();

      if (!videoEl.videoWidth || !videoEl.videoHeight) {
        throw new Error('Camera returned an invalid video resolution.');
      }

      await videoEl.play();

      cameraReady = true;

      setStatus(
        `Live camera preview active (${currentFacingMode === 'environment' ? 'Rear' : 'Front'})`
      );

    } catch (error) {
      stopCamera();

      console.error('Camera initialization failed:', error);

      const err = error as DOMException;

      let errorMsg = 'Unable to access camera.';

      switch (err.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
        case 'SecurityError':
          errorMsg = 'Camera permission denied. Check Firefox site permissions.';
          break;

        case 'NotFoundError':
        case 'DevicesNotFoundError':
          errorMsg = 'No camera device found.';
          break;

        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
          errorMsg = 'Camera constraints are not supported.';
          break;

        case 'NotReadableError':
        case 'TrackStartError':
          errorMsg = 'Camera is busy or unavailable.';
          break;

        case 'AbortError':
          errorMsg = 'Camera startup was interrupted.';
          break;

        case 'NotSupportedError':
          errorMsg = 'Video playback is not supported.';
          break;
      }

      if (error instanceof Error && !err.name) {
        errorMsg = error.message;
      }

      setStatus(errorMsg);

      // Important: propagate the error to the calling page.
      throw error;
    }
  };

  const toggleCamera = async () => {
    currentFacingMode =
      currentFacingMode === 'environment' ? 'user' : 'environment';

    await startCamera();
  };

  const setPreviewFromFile = (file: File) => {
    stopCamera();

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    const src = isPdf
      ? 'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
            <rect width="100%" height="100%" fill="#e5e7eb"/>
            <text x="50%" y="50%" text-anchor="middle"
              fill="#111827" font-size="28" font-family="Arial">
              ${file.name}
            </text>
          </svg>
        `)
      : (currentObjectUrl = URL.createObjectURL(file));

    const previewImage = createDocumentPreview(file.name, src);

    previewFrame.replaceChildren(previewImage);

    const modeLabel = getMode() === 'pdf' ? 'PDF' : 'photo';

    setStatus(`${file.name} ready for ${modeLabel} export`);
  };

  const capturePhoto = () => {
    if (
      !cameraReady ||
      !stream ||
      !videoEl.videoWidth ||
      videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
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

    const image = createDocumentPreview(
      'Captured document',
      canvasEl.toDataURL('image/png')
    );

    previewFrame.replaceChildren(image);

    const modeLabel = getMode() === 'pdf' ? 'PDF export' : 'photo export';

    setStatus(`Photo captured for ${modeLabel} (${width}x${height})`);

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
