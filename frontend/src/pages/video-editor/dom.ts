export function createVideoStageElements(): {
  videoElement: HTMLVideoElement;
  videoContainer: HTMLDivElement;
  maskOverlay: HTMLDivElement;
  captionOverlay: HTMLDivElement;
  interactionToggleButton: HTMLButtonElement;
} {
  const videoElement = document.createElement('video');
  videoElement.className = 'video-stage-element';
  videoElement.playsInline = true;
  videoElement.preload = 'metadata';

  const videoContainer = document.createElement('div');
  videoContainer.className = 'video-stage-container';

  const maskOverlay = document.createElement('div');
  maskOverlay.className = 'video-stage-mask';

  const captionOverlay = document.createElement('div');
  captionOverlay.className = 'video-stage-caption';

  const interactionToggleButton = document.createElement('button');
  interactionToggleButton.type = 'button';
  interactionToggleButton.className = 'video-stage-toggle-btn';
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