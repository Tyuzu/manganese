import { clampValue } from './utils';
import {
  clampViewportZoom as constrainViewportZoom,
  setPreviewInteractionState,
  zoomViewport as applyViewportZoom,
} from './preview';

export type VideoPreviewInteractionDeps = {
  videoElement: HTMLVideoElement;
  videoContainer: HTMLDivElement;
  captionOverlay: HTMLElement;
  interactionToggleButton: HTMLButtonElement;
  viewportZoom: {
    zoomLevel: number;
    panX: number;
    panY: number;
    isDragging: boolean;
    startX: number;
    startY: number;
  };
  getInteractionMode: () => boolean;
  setInteractionMode: (enabled: boolean) => void;
  getCaptionX: () => number;
  setCaptionX: (value: number) => void;
  getCaptionY: () => number;
  setCaptionY: (value: number) => void;
  pushState: () => void;
  applyVideoFilters: () => void;
};

export function bindVideoPreviewInteraction(deps: VideoPreviewInteractionDeps) {
  let isDraggingCaption = false;
  let captionDragOffsetX = 0;
  let captionDragOffsetY = 0;

  const updateInteractionMode = (enabled: boolean) => {
    deps.setInteractionMode(enabled);
    setPreviewInteractionState(
      enabled,
      deps.interactionToggleButton,
      deps.viewportZoom,
    );
  };

  const clampViewportZoom = () => {
    constrainViewportZoom(
      deps.videoElement,
      deps.videoContainer,
      deps.viewportZoom,
    );
  };

  const zoomViewport = (factor: number, x?: number, y?: number) => {
    applyViewportZoom(
      deps.videoElement,
      deps.videoContainer,
      deps.viewportZoom,
      factor,
      () => deps.applyVideoFilters(),
      x,
      y,
    );
  };

  deps.interactionToggleButton.onclick = () => {
    updateInteractionMode(!deps.getInteractionMode());
  };

  deps.captionOverlay.onmousedown = (event: MouseEvent) => {
    if (deps.getInteractionMode()) return;

    isDraggingCaption = true;

    const rect = deps.captionOverlay.getBoundingClientRect();

    captionDragOffsetX = event.clientX - rect.left;
    captionDragOffsetY = event.clientY - rect.top;

    event.stopPropagation();
  };

  window.addEventListener('mousemove', (event: MouseEvent) => {
    if (!isDraggingCaption) return;

    const parentRect = deps.videoContainer.getBoundingClientRect();

    deps.setCaptionX(
      clampValue(
        ((event.clientX - captionDragOffsetX - parentRect.left) /
          parentRect.width) *
          100,
        0,
        100,
      ),
    );

    deps.setCaptionY(
      clampValue(
        ((event.clientY - captionDragOffsetY - parentRect.top) /
          parentRect.height) *
          100,
        0,
        100,
      ),
    );

    deps.captionOverlay.style.left = `${deps.getCaptionX()}%`;
    deps.captionOverlay.style.top = `${deps.getCaptionY()}%`;
    deps.captionOverlay.style.transform = 'translate(-50%, -50%)';
  });

  window.addEventListener('mouseup', () => {
    if (!isDraggingCaption) return;

    isDraggingCaption = false;
    deps.pushState();
  });

  deps.videoContainer.onwheel = (event: WheelEvent) => {
    if (!deps.videoElement.src || !deps.getInteractionMode()) return;

    event.preventDefault();

    zoomViewport(
      event.deltaY < 0 ? 1.12 : 0.88,
      event.clientX,
      event.clientY,
    );
  };

  deps.videoContainer.onmousedown = (event: MouseEvent) => {
    if (
      !deps.videoElement.src ||
      !deps.getInteractionMode() ||
      deps.viewportZoom.zoomLevel <= 1
    ) {
      return;
    }

    event.preventDefault();

    deps.viewportZoom.isDragging = true;
    deps.viewportZoom.startX = event.clientX - deps.viewportZoom.panX;
    deps.viewportZoom.startY = event.clientY - deps.viewportZoom.panY;
  };

  window.addEventListener('mousemove', (event: MouseEvent) => {
    if (
      !deps.getInteractionMode() ||
      !deps.viewportZoom.isDragging ||
      !deps.videoElement.src ||
      deps.viewportZoom.zoomLevel <= 1
    ) {
      return;
    }

    deps.viewportZoom.panX = event.clientX - deps.viewportZoom.startX;
    deps.viewportZoom.panY = event.clientY - deps.viewportZoom.startY;

    clampViewportZoom();
    deps.applyVideoFilters();
  });

  window.addEventListener('mouseup', () => {
    deps.viewportZoom.isDragging = false;
  });

  return {
    setInteractionMode: updateInteractionMode,
    zoomViewport,
    clampViewportZoom,
  };
}
