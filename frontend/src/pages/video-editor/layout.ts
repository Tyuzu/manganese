import { button, createButton, div, label } from '../../components/ui/dom';
import {
  bindEditorFullscreenButton,
  createEditorFooter,
  createEditorShell,
  createMediaProcessingModeSelector,
} from '../shared';

export type VideoEditorLayoutDeps = {
  fileInput: HTMLInputElement;
  interactionToggleButton: HTMLButtonElement;
  toolContainer: HTMLElement;
  videoContainer: HTMLElement;
  playerHud: HTMLElement;
  timelineContainer: HTMLElement;
  sidePanelNav: HTMLElement;
  onUndo: () => void;
  onRedo: () => void;
  onFlushVideo: () => void;
  onRenderVideo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  resetEditor: () => void;
  startVideoExport: () => void;
};

export function createVideoEditorLayout(deps: VideoEditorLayoutDeps) {
  const {
    fileInput,
    interactionToggleButton,
    toolContainer,
    videoContainer,
    playerHud,
    timelineContainer,
    sidePanelNav,
    onUndo,
    onRedo,
    onFlushVideo,
    onRenderVideo,
    zoomIn,
    zoomOut,
    resetZoom,
    resetEditor,
    startVideoExport,
  } = deps;

  const quickActions = div(
    {
      className: 've-flex ve-flex-wrap ve-justify-end ve-gap-2 ve-sm:gap-3 ve-items-center',
    },
    div(
      {
        className: 've-flex ve-items-center ve-gap-1.5 ve-mr-2',
      },
      button(
        {
          type: 'button',
          className: 've-p-2 ve-rounded-xl ve-bg-slate-800/80 ve-hover:bg-slate-700 ve-text-slate-300 ve-hover:text-white ve-border ve-border-slate-700 ve-text-xs ve-font-bold ve-transition-all',
          title: 'Undo (Ctrl+Z)',
          onclick: onUndo,
        },
        '↶',
      ),
      button(
        {
          type: 'button',
          className: 've-p-2 ve-rounded-xl ve-bg-slate-800/80 ve-hover:bg-slate-700 ve-text-slate-300 ve-hover:text-white ve-border ve-border-slate-700 ve-text-xs ve-font-bold ve-transition-all',
          title: 'Redo (Ctrl+Y)',
          onclick: onRedo,
        },
        '↷',
      ),
    ),
    interactionToggleButton,
    label(
      {
        className: 've-cursor-pointer ve-inline-flex ve-items-center ve-justify-center ve-rounded-xl ve-bg-slate-800/80 ve-px-4 ve-py-2 ve-text-xs ve-font-semibold ve-text-slate-200 ve-transition-all ve-hover:bg-slate-700 ve-hover:text-white ve-border ve-border-slate-700/60',
      },
      'Import Video',
      fileInput,
    ),
    button(
      {
        type: 'button',
        className: 've-rounded-xl ve-border ve-border-amber-500/40 ve-bg-amber-500/10 ve-px-3 ve-py-2 ve-text-[10px] ve-font-bold ve-uppercase ve-tracking-[0.18em] ve-text-amber-200 ve-transition ve-hover:border-amber-400 ve-hover:bg-amber-500/20',
        onclick: onFlushVideo,
      },
      'Flush All',
    ),
    createButton(
      'primary',
      {
        type: 'button',
        className: 've-bg-violet-600 ve-hover:bg-violet-500 ve-text-white ve-font-semibold ve-text-xs ve-px-4 ve-py-2 ve-rounded-xl ve-shadow-lg ve-shadow-violet-600/20',
        onclick: () => onRenderVideo(),
      },
      'Render Video',
    ),
  );

  const editorTopBar = div(
    {
      className: 've-flex ve-flex-col ve-gap-3',
    },
    sidePanelNav,
    createMediaProcessingModeSelector({
      label: 'Edit location',
      className: 've-w-full',
    }),
  );

  const sidePanel = div(
    {
      className: 've-w-full ve-shrink-0 ve-rounded-[18px] ve-border ve-border-white/5 ve-bg-[#2c3e50]/70 ve-p-4 ve-md:w-[310px] ve-flex ve-flex-col ve-justify-between ve-overflow-y-auto ve-max-h-[540px]',
    },
    toolContainer,
  );

  const zoomInButton = button(
    {
      type: 'button',
      className: 've-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/90 ve-text-lg ve-font-bold ve-text-slate-100 ve-shadow-lg ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300',
      title: 'Zoom in',
      onclick: zoomIn,
    },
    '+',
  );

  const zoomOutButton = button(
    {
      type: 'button',
      className: 've-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/90 ve-text-lg ve-font-bold ve-text-slate-100 ve-shadow-lg ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300',
      title: 'Zoom out',
      onclick: zoomOut,
    },
    '−',
  );

  const resetZoomButton = button(
    {
      type: 'button',
      className: 've-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/90 ve-text-xs ve-font-bold ve-uppercase ve-tracking-wider ve-text-slate-200 ve-shadow-lg ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300',
      title: 'Reset zoom',
      onclick: resetZoom,
    },
    '1:1',
  );

  const zoomControls = div(
    {
      className: 've-absolute ve-bottom-4 ve-right-4 ve-z-30 ve-flex ve-flex-col ve-gap-2',
    },
    zoomInButton,
    zoomOutButton,
    resetZoomButton,
  );

  const stage = div(
    {
      className: 've-relative ve-flex ve-flex-1 ve-flex-col ve-overflow-y-auto ve-overflow-x-hidden ve-rounded-[18px] ve-border ve-border-slate-700/40 ve-bg-[#2c3e50] ve-p-3 ve-min-h-0 ve-sm:p-4',
    },
    div(
      {
        className: 've-mb-2 ve-flex ve-justify-end ve-sm:mb-3',
      },
      quickActions,
    ),
    videoContainer,
    zoomControls,
    playerHud,
    timelineContainer,
  );

  const workspace = div(
    {
      className: 've-flex ve-flex-col ve-gap-4 ve-p-4 ve-sm:flex-row ve-sm:gap-5',
    },
    sidePanel,
    stage,
  );

  const modalFooter = createEditorFooter(resetEditor, startVideoExport);

  const { root, modal, fullscreenButton } = createEditorShell({
    title: 'Video Studio Pro',
    nav: editorTopBar,
    workspace,
    footer: modalFooter,
    onReset: resetEditor,
    onToggleFullscreen: () => undefined,
    rootClassName: 've-min-h-screen ve-p-2 ve-sm:p-8 ve-lg:p-10 ve-flex ve-items-center ve-justify-center',
    modalClassName: 've-editor-surface ve-w-full ve-max-w-[1020px] ve-rounded-[28px] ve-border ve-border-slate-700/70 ve-bg-[#34495e] ve-shadow-[0_25px_60px_rgba(15,23,42,0.3)] ve-overflow-x-hidden ve-overflow-y-auto ve-flex ve-flex-col',
  });

  const { toggleFullscreen, refreshFullscreenButton } = bindEditorFullscreenButton({
    modal,
    fullscreenButton,
  });

  fullscreenButton.onclick = toggleFullscreen;

  const syncFullscreenLayout = () => {
    const isFullscreen = document.fullscreenElement === modal;

    modal.style.maxWidth = isFullscreen ? '100vw' : '';
    modal.style.width = isFullscreen ? '100vw' : '';
    modal.style.height = isFullscreen ? '100vh' : '';
    modal.style.borderRadius = isFullscreen ? '0' : '';

    sidePanel.style.minHeight = isFullscreen ? '0' : '';
    sidePanel.style.height = isFullscreen ? 'calc(100vh - 180px)' : '';
    sidePanel.style.maxHeight = isFullscreen ? 'calc(100vh - 180px)' : '540px';
    sidePanel.style.overflowY = 'auto';
    sidePanel.style.overflowX = 've-hidden';

    stage.style.minHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.height = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.maxHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.overflowY = 'auto';
    stage.style.overflowX = 've-hidden';

    videoContainer.style.minHeight = isFullscreen ? 'min(68vh, 70vh)' : '';
    videoContainer.style.height = isFullscreen ? 'calc(100vh - 235px)' : '';
    videoContainer.style.maxHeight = isFullscreen ? '100%' : '';
    videoContainer.style.width = isFullscreen ? '100%' : '';
    videoContainer.style.overflow = 've-hidden';

    if (isFullscreen) {
      // compatible with the existing editor sizing behavior
      const videoElement = videoContainer.querySelector('video');
      if (videoElement instanceof HTMLVideoElement) {
        videoElement.style.maxWidth = '100%';
        videoElement.style.maxHeight = '100%';
        videoElement.style.width = 'auto';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'contain';
        videoElement.style.margin = '0 auto';
        videoElement.style.display = 've-block';
      }
    } else {
      const videoElement = videoContainer.querySelector('video');
      if (videoElement instanceof HTMLVideoElement) {
        videoElement.style.maxWidth = '';
        videoElement.style.maxHeight = '';
        videoElement.style.width = '';
        videoElement.style.height = '';
        videoElement.style.objectFit = '';
        videoElement.style.margin = '';
        videoElement.style.display = '';
      }
    }
  };

  const updateFullscreenButton = () => {
    refreshFullscreenButton();
    syncFullscreenLayout();
  };

  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

  return {
    root,
    modal,
    fullscreenButton,
    sidePanel,
    stage,
    workspace,
    editorTopBar,
    updateFullscreenButton,
    syncFullscreenLayout,
    modalFooter,
  };
}
