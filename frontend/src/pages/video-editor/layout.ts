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

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'editor-action-btn';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.onclick = onUndo;
  undoBtn.textContent = '↶';

  const redoBtn = document.createElement('button');
  redoBtn.type = 'button';
  redoBtn.className = 'editor-action-btn';
  redoBtn.title = 'Redo (Ctrl+Y)';
  redoBtn.onclick = onRedo;
  redoBtn.textContent = '↷';

  const historyGroup = document.createElement('div');
  historyGroup.className = 'editor-history-group';
  historyGroup.append(undoBtn, redoBtn);

  const importLabel = document.createElement('label');
  importLabel.className = 'editor-import-label';
  importLabel.textContent = 'Import Video';
  importLabel.append(fileInput);

  const flushBtn = document.createElement('button');
  flushBtn.type = 'button';
  flushBtn.className = 'editor-flush-btn';
  flushBtn.onclick = onFlushVideo;
  flushBtn.textContent = 'Flush All';

  const renderVideoBtn = document.createElement('button');
  renderVideoBtn.type = 'button';
  renderVideoBtn.className = 'editor-render-btn';
  renderVideoBtn.onclick = () => onRenderVideo();
  renderVideoBtn.textContent = 'Render Video';

  const quickActions = document.createElement('div');
  quickActions.className = 'editor-quick-actions';
  quickActions.append(
    historyGroup,
    interactionToggleButton,
    importLabel,
    flushBtn,
    renderVideoBtn,
  );

  const editorTopBar = document.createElement('div');
  editorTopBar.className = 'editor-top-bar';
  editorTopBar.append(
    sidePanelNav,
    createMediaProcessingModeSelector({
      label: 'Edit location',
      className: 'editor-processing-selector',
    }),
  );

  const sidePanel = document.createElement('div');
  sidePanel.className = 'editor-side-panel';
  sidePanel.append(toolContainer);

  const zoomInButton = document.createElement('button');
  zoomInButton.type = 'button';
  zoomInButton.className = 'editor-zoom-btn';
  zoomInButton.title = 'Zoom in';
  zoomInButton.onclick = zoomIn;
  zoomInButton.textContent = '+';

  const zoomOutButton = document.createElement('button');
  zoomOutButton.type = 'button';
  zoomOutButton.className = 'editor-zoom-btn';
  zoomOutButton.title = 'Zoom out';
  zoomOutButton.onclick = zoomOut;
  zoomOutButton.textContent = '−';

  const resetZoomButton = document.createElement('button');
  resetZoomButton.type = 'button';
  resetZoomButton.className = 'editor-zoom-btn editor-zoom-reset';
  resetZoomButton.title = 'Reset zoom';
  resetZoomButton.onclick = resetZoom;
  resetZoomButton.textContent = '1:1';

  const zoomControls = document.createElement('div');
  zoomControls.className = 'editor-zoom-controls';
  zoomControls.append(zoomInButton, zoomOutButton, resetZoomButton);

  const quickActionsWrapper = document.createElement('div');
  quickActionsWrapper.className = 'editor-quick-actions-wrapper';
  quickActionsWrapper.append(quickActions);

  const stage = document.createElement('div');
  stage.className = 'editor-stage';
  stage.append(
    quickActionsWrapper,
    videoContainer,
    zoomControls,
    playerHud,
    timelineContainer,
  );

  const workspace = document.createElement('div');
  workspace.className = 'editor-workspace';
  workspace.append(sidePanel, stage);

  const modalFooter = createEditorFooter(resetEditor, startVideoExport);

  const { root, modal, fullscreenButton } = createEditorShell({
    title: 'Video Studio Pro',
    nav: editorTopBar,
    workspace,
    footer: modalFooter,
    onReset: resetEditor,
    onToggleFullscreen: () => undefined,
    rootClassName: 'editor-root-container',
    modalClassName: 'editor-modal-surface',
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
    sidePanel.style.overflowX = 'hidden';

    stage.style.minHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.height = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.maxHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.overflowY = 'auto';
    stage.style.overflowX = 'hidden';

    videoContainer.style.minHeight = isFullscreen ? 'min(68vh, 70vh)' : '';
    videoContainer.style.height = isFullscreen ? 'calc(100vh - 235px)' : '';
    videoContainer.style.maxHeight = isFullscreen ? '100%' : '';
    videoContainer.style.width = isFullscreen ? '100%' : '';
    videoContainer.style.overflow = 'hidden';

    const videoElement = videoContainer.querySelector('video');
    if (videoElement instanceof HTMLVideoElement) {
      if (isFullscreen) {
        videoElement.style.maxWidth = '100%';
        videoElement.style.maxHeight = '100%';
        videoElement.style.width = 'auto';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'contain';
        videoElement.style.margin = '0 auto';
        videoElement.style.display = 'block';
      } else {
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