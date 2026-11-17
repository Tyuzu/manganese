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

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  options?: { title?: string; type?: HTMLButtonElement['type']; textContent?: string }
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tagName);
  el.className = className;
  if (options?.title) el.title = options.title;
  if (options?.type && 'type' in el) (el as HTMLButtonElement).type = options.type;
  if (options?.textContent) el.textContent = options.textContent;
  return el;
}

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

  // --- 1. History & Quick Actions ---
  const undoBtn = createElement('button', 'editor-action-btn', { type: 'button', title: 'Undo (Ctrl+Z)', textContent: '↶' });
  undoBtn.onclick = onUndo;

  const redoBtn = createElement('button', 'editor-action-btn', { type: 'button', title: 'Redo (Ctrl+Y)', textContent: '↷' });
  redoBtn.onclick = onRedo;

  const historyGroup = createElement('div', 'editor-history-group');
  historyGroup.append(undoBtn, redoBtn);

  const importLabel = createElement('label', 'editor-import-label');
  importLabel.textContent = 'Import Video';
  importLabel.append(fileInput);

  const flushBtn = createElement('button', 'editor-flush-btn', { type: 'button', textContent: 'Flush All' });
  flushBtn.onclick = onFlushVideo;

  const renderVideoBtn = createElement('button', 'editor-render-btn', { type: 'button', textContent: 'Render Video' });
  renderVideoBtn.onclick = () => onRenderVideo();

  const quickActions = createElement('div', 'editor-quick-actions');
  quickActions.append(historyGroup, interactionToggleButton, importLabel, flushBtn, renderVideoBtn);

  const quickActionsWrapper = createElement('div', 'editor-quick-actions-wrapper');
  quickActionsWrapper.append(quickActions);

  // --- 2. Top Bar & Navigation ---
  const editorTopBar = createElement('div', 'editor-top-bar');
  editorTopBar.append(
    sidePanelNav,
    createMediaProcessingModeSelector({
      label: 'Edit location',
      className: 'editor-processing-selector',
    })
  );

  // --- 3. Side Panel & Tools ---
  const sidePanel = createElement('div', 'editor-side-panel');
  sidePanel.append(toolContainer);

  // --- 4. Zoom Controls ---
  const zoomInButton = createElement('button', 'editor-zoom-btn', { type: 'button', title: 'Zoom in', textContent: '+' });
  zoomInButton.onclick = zoomIn;

  const zoomOutButton = createElement('button', 'editor-zoom-btn', { type: 'button', title: 'Zoom out', textContent: '−' });
  zoomOutButton.onclick = zoomOut;

  const resetZoomButton = createElement('button', 'editor-zoom-btn editor-zoom-reset', { type: 'button', title: 'Reset zoom', textContent: '1:1' });
  resetZoomButton.onclick = resetZoom;

  const zoomControls = createElement('div', 'editor-zoom-controls');
  zoomControls.append(zoomInButton, zoomOutButton, resetZoomButton);

  // --- 5. Main Stage & Workspace ---
  const stage = createElement('div', 'editor-stage');
  stage.append(quickActionsWrapper, videoContainer, zoomControls, playerHud, timelineContainer);

  const workspace = createElement('div', 'editor-workspace');

  // Responsive arrangement: Check mobile viewport vs desktop layout
  const mql = window.matchMedia('(max-width: 768px)');
  const updateWorkspaceLayout = (isMobile: MediaQueryListEvent | MediaQueryList) => {
    workspace.innerHTML = '';
    if (isMobile.matches) {
      // Mobile layout: Stacked sequence (Stage first, then Navigation/Tabs, then Side Panel)
      workspace.append(stage, sidePanelNav, sidePanel);
      workspace.classList.add('is-mobile-layout');
    } else {
      // Desktop layout: Side-by-side workspace
      workspace.append(stage, sidePanel);
      workspace.classList.remove('is-mobile-layout');
    }
  };

  mql.addEventListener('change', updateWorkspaceLayout);
  updateWorkspaceLayout(mql);

  // --- 6. Shell & Fullscreen Binding ---
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
    modal.classList.toggle('is-fullscreen', isFullscreen);
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