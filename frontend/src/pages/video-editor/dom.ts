export function createVideoStageElements(): {
  videoElement: HTMLVideoElement;
  videoContainer: HTMLDivElement;
  maskOverlay: HTMLDivElement;
  captionOverlay: HTMLDivElement;
  interactionToggleButton: HTMLButtonElement;
} {
  const videoElement = document.createElement('video');
  videoElement.className =
    'max-h-full max-w-full object-contain rounded-lg shadow-2xl block transition-all duration-75 origin-center';
  videoElement.playsInline = true;
  videoElement.preload = 'metadata';

  const videoContainer = document.createElement('div');
  videoContainer.className =
    'relative flex-1 flex items-center justify-center bg-slate-950 p-2 overflow-hidden min-h-0 sm:p-6 rounded-xl border border-slate-800/60 shadow-inner';

  const maskOverlay = document.createElement('div');
  maskOverlay.className =
    'absolute inset-0 z-10 pointer-events-none hidden overflow-hidden rounded-lg';
  maskOverlay.style.left = '0';
  maskOverlay.style.top = '0';
  maskOverlay.style.right = '0';
  maskOverlay.style.bottom = '0';

  const captionOverlay = document.createElement('div');
  captionOverlay.className =
    'absolute text-center cursor-move select-none transition-all px-4 py-1.5 rounded-lg hidden z-20 shadow-xl whitespace-pre-line';
  captionOverlay.style.left = '50%';
  captionOverlay.style.top = '85%';
  captionOverlay.style.transform = 'translate(-50%, -50%)';

  const interactionToggleButton = document.createElement('button');
  interactionToggleButton.type = 'button';
  interactionToggleButton.className =
    'rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300 transition hover:border-slate-500 hover:text-white';
  interactionToggleButton.title = 'Toggle preview interaction mode';
  interactionToggleButton.textContent = 'Preview Controls: OFF';

  videoContainer.append(maskOverlay, captionOverlay);

  return {
    videoElement,
    videoContainer,
    maskOverlay,
    captionOverlay,
    interactionToggleButton,
  };
}
