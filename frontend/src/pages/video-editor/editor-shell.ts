import { div, input, p, svgElement } from '../../components/ui/dom';
import { createEditorTabNav } from '../shared';
import type { VideoTab } from './types';

export type VideoEditorTabConfig = {
  id: VideoTab;
  label: string;
};

export function createVideoFileInput(onFileSelected: (event: Event) => void) {
  return input({
    type: 'file',
    accept: 'video/*',
    className: 've-sr-only',
    onchange: onFileSelected,
  });
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

  const uploadIcon = svgElement(
    'svg',
    {
      class: 've-w-8 ve-h-8',
      fill: 'none',
      stroke: 'currentColor',
      viewBox: '0 0 24 24',
    },
    svgElement(
      'path',
      {
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: '1.5',
        d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
      },
    ),
  );

  const emptyState = div(
    {
      className:
        've-flex ve-flex-col ve-items-center ve-justify-center ve-text-center ve-p-12 ve-border-2 ve-border-dashed ve-border-slate-700 ve-rounded-2xl ve-bg-slate-900/40 ve-hover:bg-slate-900/70 ve-transition-all ve-cursor-pointer ve-w-full ve-max-w-md',
    },
    div(
      {
        className:
          've-mb-3 ve-rounded-2xl ve-bg-slate-800/80 ve-p-4 ve-text-violet-400 ve-border ve-border-slate-700/50',
      },
      uploadIcon,
    ),
    p(
      {
        className: 've-text-sm ve-font-semibold ve-text-slate-200',
      },
      'Drop video clip here or click to import',
    ),
    p(
      {
        className: 've-mt-1 ve-text-xs ve-text-slate-400',
      },
      'Supports MP4, WebM, MOV and browser-compatible video formats',
    ),
  );

  emptyState.onclick = () => fileInput.click();

  videoContainer.append(emptyState);

  videoContainer.ondragover = (event: DragEvent) => {
    event.preventDefault();
    videoContainer.classList.add('ve-border-violet-500');
  };

  videoContainer.ondragleave = () => {
    videoContainer.classList.remove('ve-border-violet-500');
  };

  videoContainer.ondrop = (event: DragEvent) => {
    event.preventDefault();
    videoContainer.classList.remove('ve-border-violet-500');

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
    activeClassName:
      'border-slate-100/20 ve-bg-slate-900/60 ve-text-slate-50 ve-shadow-inner',

    inactiveClassName:
      've-border-transparent ve-bg-transparent ve-text-slate-300 ve-hover:text-white ve-hover:bg-white/5',

    containerClassName:
      've-editor-tablist ve-flex ve-w-full ve-gap-1.5 ve-overflow-x-auto ve-border-b ve-border-slate-700/70 bg-slate-900/25 ve-px-2 ve-pb-2 ve-pt-1 ve-sm:gap-2 ve-sm:px-4',
  });
}

export function createTimelineTrackShell({
  timelineRuler,
  timelineTrackArea,
}: {
  timelineRuler: HTMLElement;
  timelineTrackArea: HTMLElement;
}) {
  return div(
    {
      className:
        've-h-48 ve-shrink-0 ve-flex ve-flex-col ve-border-t ve-border-slate-700/50 ve-bg-slate-900/80 ve-overflow-hidden ve-rounded-xl',
    },
    timelineRuler,
    timelineTrackArea,
  );
}
