import { createEditorTabNav } from '../shared';
import type { VideoTab } from './types';

export type VideoEditorTabConfig = {
  id: VideoTab;
  label: string;
};

export function createVideoFileInput(onFileSelected: (event: Event) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.className = 'sr-only';
  input.onchange = onFileSelected;
  return input;
}

export function createVideoUploadDropzone({
  videoContainer,
  onFileSelected,
  onVideoDropped,
}: {
  videoContainer: HTMLElement;
  onFileSelected: (event: Event) => void;
  onVideoDropped: (file: File) => void;
}) {
  const fileInput = createVideoFileInput(onFileSelected);

  const svgNS = 'http://www.w3.org/2000/svg';
  const uploadIcon = document.createElementNS(svgNS, 'svg');
  uploadIcon.setAttribute('class', 'dropzone-icon-svg');
  uploadIcon.setAttribute('fill', 'none');
  uploadIcon.setAttribute('stroke', 'currentColor');
  uploadIcon.setAttribute('viewBox', '0 0 24 24');

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute(
    'd',
    'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
  );
  uploadIcon.append(path);

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'dropzone-icon-wrapper';
  iconWrapper.append(uploadIcon);

  const titleP = document.createElement('p');
  titleP.className = 'dropzone-title';
  titleP.textContent = 'Drop video clip here or click to import';

  const subtitleP = document.createElement('p');
  subtitleP.className = 'dropzone-subtitle';
  subtitleP.textContent = 'Supports MP4, WebM, MOV and browser-compatible video formats';

  const emptyState = document.createElement('div');
  emptyState.className = 'video-dropzone';
  emptyState.append(iconWrapper, titleP, subtitleP);

  emptyState.onclick = () => fileInput.click();
  videoContainer.append(emptyState);

  videoContainer.ondragover = (event: DragEvent) => {
    event.preventDefault();
    videoContainer.classList.add('video-dropzone-drag-over');
  };

  videoContainer.ondragleave = () => {
    videoContainer.classList.remove('video-dropzone-drag-over');
  };

  videoContainer.ondrop = (event: DragEvent) => {
    event.preventDefault();
    videoContainer.classList.remove('video-dropzone-drag-over');

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please drop a valid video file.');
      return;
    }

    onVideoDropped(file);
  };

  return { fileInput };
}

export function createVideoEditorTabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: VideoEditorTabConfig[];
  activeTab: VideoTab;
  onTabChange: (tabId: VideoTab) => void;
}) {
  return createEditorTabNav(tabs, activeTab, onTabChange, {
    activeClassName: 'tab-item active',
    inactiveClassName: 'tab-item inactive',
    containerClassName: 'editor-tablist',
  });
}

export function createTimelineTrackShell({
  timelineRuler,
  timelineTrackArea,
}: {
  timelineRuler: HTMLElement;
  timelineTrackArea: HTMLElement;
}) {
  const shell = document.createElement('div');
  shell.className = 'timeline-track-shell';
  shell.append(timelineRuler, timelineTrackArea);
  return shell;
}