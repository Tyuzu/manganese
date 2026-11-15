import { clampValue } from './utils';

export type ViewportZoom = {
  zoomLevel: number;
  panX: number;
  panY: number;
  isDragging: boolean;
  startX: number;
  startY: number;
};

export function setPreviewInteractionState(
  enabled: boolean,
  button: HTMLButtonElement,
  viewportZoom: ViewportZoom,
): void {
  button.textContent = enabled
    ? 'Preview Controls: ON'
    : 'Preview Controls: OFF';

  button.className = enabled
    ? 've-rounded-xl ve-border ve-border-violet-500/70 ve-bg-violet-600/20 ve-px-3 ve-py-2 ve-text-[10px] ve-font-bold ve-uppercase ve-tracking-[0.12em] ve-text-violet-100 ve-transition ve-hover:bg-violet-500/20'
    : 've-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-800/80 ve-px-3 ve-py-2 ve-text-[10px] ve-font-bold ve-uppercase ve-tracking-[0.12em] ve-text-slate-300 ve-transition ve-hover:border-slate-500 ve-hover:text-white';

  if (!enabled) {
    viewportZoom.isDragging = false;
  }
}

export function clampViewportZoom(
  videoElement: HTMLVideoElement,
  videoContainer: HTMLDivElement,
  viewportZoom: ViewportZoom,
): void {
  const baseWidth = videoElement.offsetWidth || videoContainer.clientWidth || 1;
  const baseHeight = videoElement.offsetHeight || videoContainer.clientHeight || 1;

  const zoomWidth = baseWidth * viewportZoom.zoomLevel;
  const zoomHeight = baseHeight * viewportZoom.zoomLevel;

  const maxPanX = Math.max(0, (zoomWidth - videoContainer.clientWidth) / 2);
  const maxPanY = Math.max(0, (zoomHeight - videoContainer.clientHeight) / 2);

  viewportZoom.panX = clampValue(viewportZoom.panX, -maxPanX, maxPanX);
  viewportZoom.panY = clampValue(viewportZoom.panY, -maxPanY, maxPanY);
}

export function zoomViewport(
  videoElement: HTMLVideoElement,
  videoContainer: HTMLDivElement,
  viewportZoom: ViewportZoom,
  factor: number,
  updatePreview: () => void,
  x?: number,
  y?: number,
): void {
  if (!videoElement.src) return;

  const rect = videoContainer.getBoundingClientRect();
  const centerX = typeof x === 'number' ? x : rect.left + rect.width / 2;
  const centerY = typeof y === 'number' ? y : rect.top + rect.height / 2;

  const previousZoom = viewportZoom.zoomLevel;
  const nextZoom = clampValue(previousZoom * factor, 1, 4);

  if (nextZoom === previousZoom) return;

  const offsetX = centerX - (rect.left + rect.width / 2);
  const offsetY = centerY - (rect.top + rect.height / 2);

  viewportZoom.zoomLevel = nextZoom;
  viewportZoom.panX += offsetX * (1 - previousZoom / nextZoom);
  viewportZoom.panY += offsetY * (1 - previousZoom / nextZoom);

  clampViewportZoom(videoElement, videoContainer, viewportZoom);
  updatePreview();
}
