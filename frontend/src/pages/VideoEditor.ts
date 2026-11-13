import { button, createButton, div, input, label, p, span, svgElement } from '../components/ui/dom';
import { createDetailPanel, createEditorFooter, createEditorTitleRow } from './shared';

type VideoTab = 'timeline' | 'filters' | 'transform' | 'audio' | 'captions' | 'export';

interface VideoEditorState {
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  previewQuality: '1' | '0.5' | '0.25';
  captionText: string;
  captionSize: number;
  captionWeight: string;
  captionBg: string;
  captionShadow: boolean;
  captionX: number;
  captionY: number;
  filters: {
    exposure: number;
    brightness: number;
    contrast: number;
    saturate: number;
    temperature: number;
    tint: number;
    highlights: number;
    shadows: number;
    blur: number;
    sharpen: number;
    grayscale: number;
    sepia: number;
    vignette: number;
    filmGrain: number;
    fade: number;
  };
}

export async function createVideoEditorPage(): Promise<HTMLElement> {
  // State Management
  let videoFile: File | null = null;
  let videoUrl: string | null = null;
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;
  let activeTab: VideoTab = 'timeline';

  // Clip Edit & Canvas State
  let trimStart = 0;
  let trimEnd = 0;
  let playbackRate = 1;
  let aspectRatio: '16:9' | '9:16' | '1:1' | '4:5' = '16:9';
  let rotation = 0;
  let flipH = false;
  let flipV = false;
  let previewQuality: '1' | '0.5' | '0.25' = '1';

  // Caption State
  let captionText = '';
  let captionSize = 20;
  let captionWeight = '700';
  let captionBg = 'rgba(0,0,0,0.6)';
  let captionShadow = true;
  let captionX = 50; // percentage
  let captionY = 85; // percentage

  // Export State
  let exportResolution: '720p' | '1080p' | '4k' = '1080p';
  let exportFps: 24 | 30 | 60 = 30;
  let exportFormat: 'webm' | 'mp4' = 'webm';
  let exportBitrate = 5000000;
  let isRendering = false;
  let renderProgress = 0;
  let mediaRecorder: MediaRecorder | null = null;
  let renderChunks: Blob[] = [];

  const filters = {
    exposure: 100,
    brightness: 100,
    contrast: 100,
    saturate: 100,
    temperature: 0,
    tint: 0,
    highlights: 100,
    shadows: 100,
    blur: 0,
    sharpen: 0,
    grayscale: 0,
    sepia: 0,
    vignette: 0,
    filmGrain: 0,
    fade: 0,
  };

  const viewportZoom = {
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    velocityX: 0,
    velocityY: 0,
  };

  let interactionModeEnabled = false;

  function setInteractionMode(enabled: boolean) {
    interactionModeEnabled = enabled;
    interactionToggleButton.textContent = enabled ? 'Preview Controls: ON' : 'Preview Controls: OFF';
    interactionToggleButton.className = enabled
      ? 'rounded-xl border border-violet-500/70 bg-violet-600/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-100 transition hover:bg-violet-500/20'
      : 'rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300 transition hover:border-slate-500 hover:text-white';
    if (!enabled) {
      viewportZoom.isDragging = false;
    }
  }

  // Undo / Redo History Stack
  let history: VideoEditorState[] = [];
  let historyIndex = -1;

  function pushState() {
    const currentState: VideoEditorState = {
      trimStart,
      trimEnd,
      playbackRate,
      volume,
      aspectRatio,
      rotation,
      flipH,
      flipV,
      previewQuality,
      captionText,
      captionSize,
      captionWeight,
      captionBg,
      captionShadow,
      captionX,
      captionY,
      filters: { ...filters }
    };
    history = history.slice(0, historyIndex + 1);
    history.push(currentState);
    historyIndex = history.length - 1;
  }

  function restoreState(state: VideoEditorState) {
    trimStart = state.trimStart;
    trimEnd = state.trimEnd;
    playbackRate = state.playbackRate;
    volume = state.volume;
    aspectRatio = state.aspectRatio;
    rotation = state.rotation;
    flipH = state.flipH;
    flipV = state.flipV;
    previewQuality = state.previewQuality;
    captionText = state.captionText;
    captionSize = state.captionSize;
    captionWeight = state.captionWeight;
    captionBg = state.captionBg;
    captionShadow = state.captionShadow;
    captionX = state.captionX;
    captionY = state.captionY;
    Object.assign(filters, state.filters);

    videoElement.playbackRate = playbackRate;
    videoElement.volume = volume;
    volumeSlider.value = volume.toString();
    setAspectRatio(aspectRatio);
    updateTransforms();
    updateCaptions();
    updateTrimMarkers();
    applyVideoFilters();
    renderToolControls();
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      restoreState(history[historyIndex]);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      restoreState(history[historyIndex]);
    }
  }

  const root = div({
    className: 'min-h-screen p-2 sm:p-8 lg:p-10 flex items-center justify-center'
  });

  const modal = div({
    className: 'w-full max-w-[1020px] rounded-[28px] border border-slate-700/70 bg-[#34495e] shadow-[0_25px_60px_rgba(15,23,42,0.3)] overflow-hidden flex flex-col'
  });

  const fileInput = input({
    type: 'file',
    accept: 'video/*',
    className: 'sr-only',
    onchange: (e: Event) => handleVideoUpload(e)
  });

  const interactionToggleButton = button({
    type: 'button',
    className: 'rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300 transition hover:border-slate-500 hover:text-white',
    title: 'Toggle preview interaction mode',
    onclick: () => setInteractionMode(!interactionModeEnabled)
  }, 'Preview Controls: OFF');

  const quickActions = div({ className: 'flex flex-wrap justify-end gap-2 sm:gap-3 items-center' },
    div({ className: 'flex items-center gap-1.5 mr-2' },
      button({
        type: 'button',
        className: 'p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all',
        title: 'Undo (Ctrl+Z)',
        onclick: () => undo()
      }, '↶'),
      button({
        type: 'button',
        className: 'p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all',
        title: 'Redo (Ctrl+Y)',
        onclick: () => redo()
      }, '↷')
    ),
    interactionToggleButton,
    label({ className: 'cursor-pointer inline-flex items-center justify-center rounded-xl bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white border border-slate-700/60' },
      'Import Video',
      fileInput
    ),
    createButton('primary', {
      type: 'button',
      className: 'bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-violet-600/20',
      onclick: () => switchTab('export')
    }, 'Render Video')
  );

  const { titleRow, fullscreenButton } = createEditorTitleRow(
    'Video Studio Pro',
    () => resetEditor(),
    () => toggleEditorFullscreen()
  );

  const sidePanelNav = div({ className: 'flex flex-wrap gap-2 px-3 pb-2 sm:gap-3 sm:px-5 bg-[#2c3e50]/40 pt-3' });
  const toolContainer = div({ className: 'space-y-4' });

  const tabs: { id: VideoTab; label: string }[] = [
    { id: 'timeline', label: 'TRIM' },
    { id: 'filters', label: 'FILTERS' },
    { id: 'transform', label: 'CANVAS' },
    { id: 'audio', label: 'AUDIO' },
    { id: 'captions', label: 'TEXT' },
    { id: 'export', label: 'EXPORT' },
  ];

  tabs.forEach((tab) => {
    const btn = button({
      type: 'button',
      className: `editor-tab inline-flex min-w-[70px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[90px] sm:px-3 sm:text-[11px] ${
        activeTab === tab.id
          ? 'border-slate-100/20 bg-slate-900/60 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`,
      onclick: () => switchTab(tab.id)
    }, tab.label);
    sidePanelNav.append(btn);
  });

  const sidePanel = div({ className: 'w-full shrink-0 rounded-[18px] border border-white/5 bg-[#2c3e50]/70 p-4 md:w-[310px] flex flex-col justify-between overflow-y-auto max-h-[540px]' },
    toolContainer
  );

  const stage = div({ className: 'relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-[18px] border border-slate-700/40 bg-[#2c3e50] p-3 min-h-0 sm:p-4' },
    div({ className: 'mb-2 flex justify-end sm:mb-3' }, quickActions)
  );

  // Video Element & Interactive Overlay Container
  const videoElement = document.createElement('video');
  videoElement.className = 'max-h-full max-w-full object-contain rounded-lg shadow-2xl block transition-all duration-75 origin-center';
  videoElement.playsInline = true;

  const videoContainer = div({ className: 'relative flex-1 flex items-center justify-center bg-slate-950 p-2 overflow-hidden min-h-0 sm:p-6 rounded-xl border border-slate-800/60 shadow-inner' });

  const captionOverlay = div({
    className: 'absolute text-center cursor-move select-none transition-all px-4 py-1.5 rounded-lg hidden z-20 shadow-xl',
    style: 'left: 50%; top: 85%; transform: translate(-50%, -50%);'
  });

  // Make caption overlay draggable
  let isDraggingCaption = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  captionOverlay.onmousedown = (e: MouseEvent) => {
    isDraggingCaption = true;
    const rect = captionOverlay.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.stopPropagation();
  };

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDraggingCaption) return;
    const parentRect = videoContainer.getBoundingClientRect();
    let newX = ((e.clientX - dragOffsetX - parentRect.left) / parentRect.width) * 100;
    let newY = ((e.clientY - dragOffsetY - parentRect.top) / parentRect.height) * 100;
    captionX = Math.max(0, Math.min(100, newX));
    captionY = Math.max(0, Math.min(100, newY));
    captionOverlay.style.left = `${captionX}%`;
    captionOverlay.style.top = `${captionY}%`;
    captionOverlay.style.transform = 'translate(-50%, -50%)';
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingCaption) {
      isDraggingCaption = false;
      pushState();
    }
  });

  videoContainer.onwheel = (e: WheelEvent) => {
    if (!videoElement.src || !interactionModeEnabled) return;
    e.preventDefault();

    const previousZoom = viewportZoom.zoomLevel;
    const zoomStep = e.deltaY < 0 ? 1.12 : 0.88;
    const nextZoom = Math.min(4, Math.max(1, previousZoom * zoomStep));

    if (nextZoom === previousZoom) return;

    const rect = videoContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = e.clientX - centerX;
    const offsetY = e.clientY - centerY;

    viewportZoom.zoomLevel = nextZoom;
    viewportZoom.panX += offsetX * (1 - previousZoom / nextZoom);
    viewportZoom.panY += offsetY * (1 - previousZoom / nextZoom);
    clampViewportZoom();
    applyVideoFilters();
  };

  videoContainer.onmousedown = (e: MouseEvent) => {
    if (!videoElement.src || !interactionModeEnabled || viewportZoom.zoomLevel <= 1) return;
    e.preventDefault();
    viewportZoom.isDragging = true;
    viewportZoom.startX = e.clientX - viewportZoom.panX;
    viewportZoom.startY = e.clientY - viewportZoom.panY;
    viewportZoom.velocityX = 0;
    viewportZoom.velocityY = 0;
  };

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!interactionModeEnabled || !viewportZoom.isDragging || !videoElement.src || viewportZoom.zoomLevel <= 1) return;
    viewportZoom.panX = e.clientX - viewportZoom.startX;
    viewportZoom.panY = e.clientY - viewportZoom.startY;
    clampViewportZoom();
    applyVideoFilters();
  });

  window.addEventListener('mouseup', () => {
    if (viewportZoom.isDragging) {
      viewportZoom.isDragging = false;
      viewportZoom.velocityX = 0;
      viewportZoom.velocityY = 0;
    }
  });

  const uploadIcon = svgElement('svg', {
    class: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
  },
    svgElement('path', {
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      strokeWidth: '1.5',
      d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    })
  );

  const emptyState = div({ className: 'flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/40 hover:bg-slate-900/70 transition-all cursor-pointer w-full max-w-md' },
    div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-violet-400 border border-slate-700/50' },
      uploadIcon
    ),
    p({ className: 'text-sm font-semibold text-slate-200' }, 'Drop video clip here or click to import'),
    p({ className: 'mt-1 text-xs text-slate-400' }, 'Supports MP4, WebM, MOV, AVI')
  );

  emptyState.onclick = () => fileInput.click();

  videoContainer.append(emptyState);

  // Playback HUD Bar
  const syncPlaybackUI = () => {
    const isActive = !!videoElement.src && !videoElement.paused && !videoElement.ended;
    isPlaying = isActive;
    playPauseBtn.textContent = isPlaying ? '❚❚' : '▶';
    playPauseBtn.title = isPlaying ? 'Pause playback' : 'Play playback';
    playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause video' : 'Play video');
  };

  const playPauseBtn = button({
    type: 'button',
    className: 'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-base font-bold text-white transition hover:border-violet-500 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/60',
    title: 'Play playback',
    ariaLabel: 'Play video',
    onclick: togglePlay
  }, '▶');

  const stepBackwardBtn = button({
    type: 'button',
    className: 'text-slate-400 hover:text-white text-xs px-1.5 py-1',
    title: 'Step backward 1 frame',
    onclick: () => stepFrames(-1)
  }, '⏮');

  const stepForwardBtn = button({
    type: 'button',
    className: 'text-slate-400 hover:text-white text-xs px-1.5 py-1',
    title: 'Step forward 1 frame',
    onclick: () => stepFrames(1)
  }, '⏭');

  const timeDisplay = div({ className: 'min-w-0 flex-shrink-0 font-mono text-[11px] text-slate-300 text-center sm:min-w-[95px]' }, '00:00 / 00:00');

  const seekSlider = input({
    type: 'range',
    min: '0',
    max: '100',
    value: '0',
    step: '0.1',
    className: 'h-1.5 w-full flex-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500',
    oninput: (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (videoElement.duration) {
        videoElement.currentTime = (parseFloat(target.value) / 100) * videoElement.duration;
      }
    }
  });

  const volumeSlider = input({
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: '1',
    className: 'h-1.5 w-16 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500',
    oninput: (e: Event) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      volume = val;
      videoElement.volume = val;
      pushState();
    }
  });

  const playerHud = div({ className: 'flex flex-col gap-2 rounded-xl border border-slate-700/50 bg-slate-900/90 p-3 backdrop-blur-md z-10 sm:min-h-[56px] sm:flex-row sm:items-center sm:gap-3 sm:px-5' },
    div({ className: 'flex items-center gap-2' },
      stepBackwardBtn,
      playPauseBtn,
      stepForwardBtn,
      timeDisplay
    ),
    seekSlider,
    div({ className: 'flex items-center gap-2 text-xs text-slate-400 sm:ml-2' },
      span({ className: 'inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/90 text-sm' }, '🔊'),
      volumeSlider
    )
  );

  // Advanced Interactive Timeline with Thumbnail Strip & Draggable Playhead
  const playheadLine = div({ className: 'absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none shadow-md', style: 'left: 0%' });

  const trimStartMarker = div({
    className: 'absolute top-0 bottom-0 w-2.5 bg-violet-400 border-r-2 border-white cursor-ew-resize z-20 hover:bg-violet-300 transition-colors shadow-lg flex items-center justify-center',
    style: 'left: 0%'
  },
    div({ className: 'w-0.5 h-3 bg-slate-900 rounded-full' })
  );

  const trimEndMarker = div({
    className: 'absolute top-0 bottom-0 w-2.5 bg-violet-400 border-l-2 border-white cursor-ew-resize z-20 hover:bg-violet-300 transition-colors shadow-lg flex items-center justify-center',
    style: 'left: 100%'
  },
    div({ className: 'w-0.5 h-3 bg-slate-900 rounded-full' })
  );

  const trimActiveZone = div({
    className: 'absolute top-0 bottom-0 bg-violet-500/30 border-t border-b border-violet-400/60 pointer-events-none z-10',
    style: 'left: 0%; right: 0%'
  });

  const thumbnailStrip = div({ className: 'absolute inset-0 flex opacity-40 pointer-events-none overflow-hidden' });

  const videoTrackSegment = div({ className: 'relative h-10 rounded-lg bg-slate-800/90 border border-slate-700 flex items-center px-3 text-xs text-slate-300 font-medium overflow-hidden shadow-inner select-none' },
    thumbnailStrip,
    trimStartMarker,
    trimActiveZone,
    trimEndMarker,
    div({ className: 'truncate z-0 text-slate-200 text-[11px] font-semibold drop-shadow-md' }, 'Video Track 1 • Main Source Clip')
  );

  const audioTrackSegment = div({ className: 'relative h-8 rounded-lg bg-cyan-950/50 border border-cyan-800/50 flex items-center px-3 text-xs text-cyan-300 font-medium overflow-hidden shadow-inner select-none' },
    div({ className: 'truncate text-[11px]' }, 'Audio Track 1 • Master Stereo Mix')
  );

  const timelineRuler = div({ className: 'h-6 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between gap-2 px-3 text-[10px] font-mono text-slate-500 select-none sm:px-4' },
    div({}, '00:00'),
    div({}, '00:15'),
    div({}, '00:30'),
    div({}, '00:45'),
    div({}, '01:00')
  );

  let isScrubbingTimeline = false;

  const timelineTrackArea = div({
    className: 'relative flex-1 p-3 space-y-2 overflow-y-auto cursor-pointer bg-slate-900/50',
    onmousedown: (e: MouseEvent) => {
      isScrubbingTimeline = true;
      updatePlayheadFromMouseEvent(e);
    }
  });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isScrubbingTimeline) return;
    updatePlayheadFromMouseEvent(e);
  });

  window.addEventListener('mouseup', () => {
    isScrubbingTimeline = false;
  });

  function updatePlayheadFromMouseEvent(e: MouseEvent) {
    const rect = timelineTrackArea.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    if (videoElement.duration) {
      videoElement.currentTime = ratio * videoElement.duration;
    }
  }

  timelineTrackArea.append(playheadLine, videoTrackSegment, audioTrackSegment);

  const timelineContainer = div({ className: 'h-48 shrink-0 flex flex-col border-t border-slate-700/50 bg-slate-900/80 overflow-hidden rounded-xl' },
    timelineRuler,
    timelineTrackArea
  );

  const zoomInButton = button({
    type: 'button',
    className: 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-lg font-bold text-slate-100 shadow-lg shadow-slate-950/40 transition hover:border-violet-500 hover:text-violet-300',
    title: 'Zoom in',
    onclick: () => zoomViewport(1.15)
  }, '+');

  const zoomOutButton = button({
    type: 'button',
    className: 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-lg font-bold text-slate-100 shadow-lg shadow-slate-950/40 transition hover:border-violet-500 hover:text-violet-300',
    title: 'Zoom out',
    onclick: () => zoomViewport(1 / 1.15)
  }, '−');

  const resetZoomButton = button({
    type: 'button',
    className: 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-xs font-bold uppercase tracking-wider text-slate-200 shadow-lg shadow-slate-950/40 transition hover:border-violet-500 hover:text-violet-300',
    title: 'Reset zoom',
    onclick: () => {
      viewportZoom.zoomLevel = 1;
      viewportZoom.panX = 0;
      viewportZoom.panY = 0;
      applyVideoFilters();
    }
  }, '1:1');

  const zoomControls = div({ className: 'absolute bottom-4 right-4 z-30 flex flex-col gap-2' },
    zoomInButton,
    zoomOutButton,
    resetZoomButton
  );

  stage.append(videoContainer, zoomControls, playerHud, timelineContainer);

  const workspace = div({ className: 'flex flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-6' }, sidePanel, stage);
  const modalFooter = createEditorFooter(() => resetEditor(), () => startVideoExport());

  const modalWrap = div({ className: 'w-full' }, titleRow, sidePanelNav, workspace, modalFooter);
  modal.append(modalWrap);
  root.append(modal);

  const syncFullscreenLayout = () => {
    const isFullscreen = document.fullscreenElement === modal;

    modal.style.maxWidth = isFullscreen ? '100vw' : '';
    modal.style.width = isFullscreen ? '100vw' : '';
    modal.style.height = isFullscreen ? '100vh' : '';
    modal.style.borderRadius = isFullscreen ? '0px' : '';

    sidePanel.style.minHeight = isFullscreen ? '0' : '';
    sidePanel.style.height = isFullscreen ? 'calc(100vh - 180px)' : '';
    sidePanel.style.maxHeight = isFullscreen ? 'calc(100vh - 180px)' : '540px';
    sidePanel.style.overflowY = 'auto';
    sidePanel.style.overflowX = 'hidden';
    sidePanel.style.display = 'flex';
    sidePanel.style.flexDirection = 'column';

    stage.style.minHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.height = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.maxHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.overflowY = 'auto';
    stage.style.overflowX = 'hidden';
    stage.style.display = 'flex';
    stage.style.flexDirection = 'column';
    videoContainer.style.minHeight = isFullscreen ? 'min(68vh, 70vh)' : '';
    videoContainer.style.height = isFullscreen ? 'calc(100vh - 235px)' : '';
    videoContainer.style.maxHeight = isFullscreen ? '100%' : '';
    videoContainer.style.width = isFullscreen ? '100%' : '';
    videoContainer.style.overflow = 'hidden';
    videoContainer.style.display = 'flex';
    videoContainer.style.alignItems = 'center';
    videoContainer.style.justifyContent = 'center';

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
  };

  const updateFullscreenButton = () => {
    const isFullscreen = document.fullscreenElement === modal;
    fullscreenButton.textContent = isFullscreen ? '⤡' : '⤢';
    syncFullscreenLayout();
  };

  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

  // Keyboard Shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
      return;
    }

    if (!interactionModeEnabled) {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomViewport(1.15);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomViewport(1 / 1.15);
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      rotation = (rotation + 90) % 360;
      updateTransforms();
      pushState();
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      flipH = !flipH;
      updateTransforms();
      pushState();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (videoElement.duration) {
        videoElement.currentTime = Math.min(videoElement.duration, videoElement.currentTime + 5);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (videoElement.duration) {
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 5);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  function toggleEditorFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement === modal) {
      void document.exitFullscreen();
      return;
    }
    void modal.requestFullscreen().catch(() => {
      // Ignore fullscreen failures and keep the editor usable in standard layout.
    });
  }

  // Dynamic Inspector Panels
  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'timeline') {
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Timeline Trim & Speed'),
        createSliderControl('Start Marker (s)', trimStart, 0, Math.max(1, duration), (v) => {
          trimStart = Math.min(v, (trimEnd || duration) - 0.5);
          updateTrimMarkers();
          if (videoElement.currentTime < trimStart) videoElement.currentTime = trimStart;
        }),
        createSliderControl('End Marker (s)', trimEnd || duration, 0, Math.max(1, duration), (v) => {
          trimEnd = Math.max(v, trimStart + 0.5);
          updateTrimMarkers();
        }),
        createSliderControl('Playback Speed', playbackRate, 0.25, 3, (v) => {
          playbackRate = v;
          videoElement.playbackRate = v;
        }),
        div({ className: 'pt-2 grid grid-cols-2 gap-2.5' },
          createPresetButton('Set Start Here', () => {
            trimStart = videoElement.currentTime;
            updateTrimMarkers();
            pushState();
            renderToolControls();
          }),
          createPresetButton('Set End Here', () => {
            trimEnd = videoElement.currentTime;
            updateTrimMarkers();
            pushState();
            renderToolControls();
          })
        )
      );
    } else if (activeTab === 'filters') {
      const presetGrid = div({ className: 'grid grid-cols-2 gap-3 mb-4' },
        createThumbnailPresetCard('Normal', { exposure: 100, brightness: 100, contrast: 100, saturate: 100, temperature: 0, tint: 0, highlights: 100, shadows: 100, blur: 0, sharpen: 0, grayscale: 0, sepia: 0, vignette: 0, filmGrain: 0, fade: 0 }, '✨'),
        createThumbnailPresetCard('Cinematic', { exposure: 105, brightness: 90, contrast: 130, saturate: 115, temperature: -10, tint: 5, highlights: 90, shadows: 110, blur: 0, sharpen: 10, grayscale: 0, sepia: 0, vignette: 20, filmGrain: 15, fade: 5 }, '🎬'),
        createThumbnailPresetCard('Mono Noir', { exposure: 100, brightness: 105, contrast: 140, saturate: 0, temperature: 0, tint: 0, highlights: 100, shadows: 90, blur: 0, sharpen: 15, grayscale: 100, sepia: 0, vignette: 30, filmGrain: 25, fade: 10 }, '🎞️'),
        createThumbnailPresetCard('Warm Vintage', { exposure: 100, brightness: 105, contrast: 105, saturate: 120, temperature: 25, tint: 10, highlights: 105, shadows: 95, blur: 0, sharpen: 0, grayscale: 0, sepia: 25, vignette: 25, filmGrain: 20, fade: 15 }, '🌅')
      );

      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'One-Click Filter Presets'),
        presetGrid,
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Basic Adjustments'),
        createSliderControl('Exposure', filters.exposure, 0, 200, (v) => { filters.exposure = v; applyVideoFilters(); }),
        createSliderControl('Brightness', filters.brightness, 0, 200, (v) => { filters.brightness = v; applyVideoFilters(); }),
        createSliderControl('Contrast', filters.contrast, 0, 200, (v) => { filters.contrast = v; applyVideoFilters(); }),
        createSliderControl('Saturation', filters.saturate, 0, 200, (v) => { filters.saturate = v; applyVideoFilters(); }),
        createSliderControl('Temperature', filters.temperature, -50, 50, (v) => { filters.temperature = v; applyVideoFilters(); }),
        createSliderControl('Tint', filters.tint, -50, 50, (v) => { filters.tint = v; applyVideoFilters(); }),
        createSliderControl('Highlights', filters.highlights, 0, 200, (v) => { filters.highlights = v; applyVideoFilters(); }),
        createSliderControl('Shadows', filters.shadows, 0, 200, (v) => { filters.shadows = v; applyVideoFilters(); }),
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Creative Effects'),
        createSliderControl('Blur (px)', filters.blur, 0, 20, (v) => { filters.blur = v; applyVideoFilters(); }),
        createSliderControl('Sharpen', filters.sharpen, 0, 100, (v) => { filters.sharpen = v; applyVideoFilters(); }),
        createSliderControl('Grayscale (%)', filters.grayscale, 0, 100, (v) => { filters.grayscale = v; applyVideoFilters(); }),
        createSliderControl('Sepia (%)', filters.sepia, 0, 100, (v) => { filters.sepia = v; applyVideoFilters(); }),
        createSliderControl('Vignette', filters.vignette, 0, 100, (v) => { filters.vignette = v; applyVideoFilters(); }),
        createSliderControl('Film Grain', filters.filmGrain, 0, 100, (v) => { filters.filmGrain = v; applyVideoFilters(); }),
        createSliderControl('Fade', filters.fade, 0, 100, (v) => { filters.fade = v; applyVideoFilters(); })
      );
    } else if (activeTab === 'transform') {
      const ratioGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('16:9 Widescreen', () => { setAspectRatio('16:9'); pushState(); }),
        createPresetButton('9:16 Vertical/Reels', () => { setAspectRatio('9:16'); pushState(); }),
        createPresetButton('1:1 Square', () => { setAspectRatio('1:1'); pushState(); }),
        createPresetButton('4:5 Social Feed', () => { setAspectRatio('4:5'); pushState(); })
      );

      const transformGrid = div({ className: 'grid grid-cols-2 gap-2.5 mt-3' },
        createPresetButton('Rotate 90°', () => { rotation = (rotation + 90) % 360; updateTransforms(); pushState(); }),
        createPresetButton('Flip Horizontal', () => { flipH = !flipH; updateTransforms(); pushState(); }),
        createPresetButton('Flip Vertical', () => { flipV = !flipV; updateTransforms(); pushState(); }),
        createPresetButton('Reset Transforms', () => { rotation = 0; flipH = false; flipV = false; updateTransforms(); pushState(); })
      );

      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Aspect Ratio Presets'),
        ratioGrid,
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Rotation & Mirroring'),
        transformGrid,
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Preview Quality'),
        div({ className: 'grid grid-cols-3 gap-2' },
          createPresetButton('Full (100%)', () => { previewQuality = '1'; pushState(); }),
          createPresetButton('Half (50%)', () => { previewQuality = '0.5'; pushState(); }),
          createPresetButton('Quarter (25%)', () => { previewQuality = '0.25'; pushState(); })
        )
      );
    } else if (activeTab === 'audio') {
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Master Audio Controls'),
        createSliderControl('Volume (%)', volume * 100, 0, 100, (v) => {
          volume = v / 100;
          videoElement.volume = volume;
          volumeSlider.value = volume.toString();
        }),
        div({ className: 'pt-2 grid grid-cols-2 gap-2.5' },
          createPresetButton('Mute Audio', () => {
            volume = 0;
            videoElement.volume = 0;
            volumeSlider.value = '0';
            pushState();
          }),
          createPresetButton('Full Volume', () => {
            volume = 1;
            videoElement.volume = 1;
            volumeSlider.value = '1';
            pushState();
          })
        )
      );
    } else if (activeTab === 'captions') {
      const textInput = input({
        type: 'text',
        placeholder: 'Subtitle / caption text...',
        value: captionText,
        className: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none',
        oninput: (e: Event) => {
          captionText = (e.target as HTMLInputElement).value;
          updateCaptions();
        },
        onchange: () => pushState()
      });

      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Subtitles & Overlay Text'),
        div({ className: 'space-y-4' },
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Caption Content'),
            textInput
          ),
          createSliderControl('Font Size (px)', captionSize, 12, 48, (v) => {
            captionSize = v;
            updateCaptions();
          }),
          div({ className: 'grid grid-cols-2 gap-2 pt-2' },
            createPresetButton('Drop Shadow', () => {
              captionShadow = !captionShadow;
              updateCaptions();
              pushState();
            }),
            createPresetButton('Center Position', () => {
              captionX = 50;
              captionY = 85;
              updateCaptions();
              pushState();
            })
          )
        )
      );
    } else if (activeTab === 'export') {
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Real-time Export Engine'),
        div({ className: 'space-y-3' },
          div({ className: 'rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-xs space-y-2.5' },
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Resolution'),
              createSelectDropdown(['720p', '1080p', '4k'], exportResolution, (val) => { exportResolution = val as any; })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Framerate'),
              createSelectDropdown(['24', '30', '60'], exportFps.toString(), (val) => { exportFps = parseInt(val) as any; })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Container'),
              createSelectDropdown(['webm', 'mp4'], exportFormat, (val) => { exportFormat = val as any; })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Quality Preset'),
              createSelectDropdown(['Economy (2 Mbps)', 'Balanced (5 Mbps)', 'High (10 Mbps)'], exportBitrate === 2000000 ? 'Economy (2 Mbps)' : exportBitrate === 10000000 ? 'High (10 Mbps)' : 'Balanced (5 Mbps)', (val) => {
                if (val.includes('Economy')) exportBitrate = 2000000;
                else if (val.includes('High')) exportBitrate = 10000000;
                else exportBitrate = 5000000;
              })
            ),
            div({ className: 'flex justify-between pt-1 border-t border-slate-800' },
              span({ className: 'text-slate-400' }, 'Trim Length'),
              span({ className: 'font-semibold text-violet-300' }, `${(Math.max(0, (trimEnd || duration) - trimStart)).toFixed(1)}s`)
            )
          ),
          isRendering ? div({ className: 'space-y-2 text-center' },
            p({ className: 'text-xs text-violet-300 font-semibold' }, `Rendering Video... ${Math.round(renderProgress)}%`),
            div({ className: 'w-full bg-slate-800 h-2 rounded-full overflow-hidden' },
              div({ className: 'bg-violet-500 h-full transition-all', style: `width: ${renderProgress}%` })
            ),
            createButton('secondary', {
              type: 'button',
              className: 'w-full text-xs py-2 bg-red-600/80 hover:bg-red-600 text-white font-semibold rounded-xl',
              onclick: () => cancelVideoExport()
            }, 'Cancel Rendering')
          ) : createButton('primary', {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-violet-600/20',
            onclick: () => startVideoExport()
          }, 'Start Render Pipeline')
        )
      );
    }

    toolContainer.append(
      div({ className: 'mt-6 border-t border-slate-700/60 pt-4' },
        createDetailPanel('Project Summary', [
          { label: 'Aspect Ratio', value: aspectRatio },
          { label: 'Active Region', value: duration ? `${trimStart.toFixed(1)}s – ${trimEnd.toFixed(1)}s` : '—' },
          { label: 'History Stack', value: `${historyIndex + 1} / ${history.length}` },
        ])
      )
    );
  }

  function handleVideoUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || !target.files[0]) return;

    videoFile = target.files[0];
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(videoFile);

    viewportZoom.zoomLevel = 1;
    viewportZoom.panX = 0;
    viewportZoom.panY = 0;
    videoElement.src = videoUrl;
    videoElement.onloadedmetadata = () => {
      duration = videoElement.duration;
      trimStart = 0;
      trimEnd = duration;
      timeDisplay.textContent = `00:00 / ${formatTime(duration)}`;

      videoContainer.innerHTML = '';
      videoContainer.append(videoElement, captionOverlay);

      generateThumbnailStrip();

      history = [];
      historyIndex = -1;
      pushState();
      updateTrimMarkers();
      applyVideoFilters();
      renderToolControls();
    };

    videoElement.onplay = () => syncPlaybackUI();
    videoElement.onpause = () => syncPlaybackUI();
    videoElement.onended = () => syncPlaybackUI();

    videoElement.ontimeupdate = () => {
      if (isRendering) return;
      currentTime = videoElement.currentTime;
      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      const percent = duration ? (currentTime / duration) * 100 : 0;
      seekSlider.value = percent.toString();
      playheadLine.style.left = `${percent}%`;

      if (trimEnd > 0 && currentTime >= trimEnd) {
        videoElement.currentTime = trimStart;
      }
    };
  }

  function generateThumbnailStrip() {
    thumbnailStrip.innerHTML = '';
    const numThumbs = 8;
    for (let i = 0; i < numThumbs; i++) {
      const thumb = div({ className: 'flex-1 bg-slate-800 border-r border-slate-700/50 flex items-center justify-center text-[9px] text-slate-500' }, 'img');
      thumbnailStrip.append(thumb);
    }
  }

  function updateTrimMarkers() {
    if (!duration) return;
    const startPct = (trimStart / duration) * 100;
    const endPct = (trimEnd / duration) * 100;

    trimStartMarker.style.left = `${startPct}%`;
    trimEndMarker.style.left = `${endPct}%`;
    trimActiveZone.style.left = `${startPct}%`;
    trimActiveZone.style.right = `${100 - endPct}%`;
  }

  function clampViewportZoom() {
    const baseWidth = videoElement.offsetWidth || videoContainer.clientWidth || 1;
    const baseHeight = videoElement.offsetHeight || videoContainer.clientHeight || 1;
    const zoomWidth = baseWidth * viewportZoom.zoomLevel;
    const zoomHeight = baseHeight * viewportZoom.zoomLevel;
    const maxPanX = Math.max(0, (zoomWidth - videoContainer.clientWidth) / 2);
    const maxPanY = Math.max(0, (zoomHeight - videoContainer.clientHeight) / 2);

    viewportZoom.panX = Math.min(maxPanX, Math.max(-maxPanX, viewportZoom.panX));
    viewportZoom.panY = Math.min(maxPanY, Math.max(-maxPanY, viewportZoom.panY));
  }

  function zoomViewport(factor: number, x?: number, y?: number) {
    if (!videoElement.src) return;

    const rect = videoContainer.getBoundingClientRect();
    const centerX = typeof x === 'number' ? x : rect.left + rect.width / 2;
    const centerY = typeof y === 'number' ? y : rect.top + rect.height / 2;
    const previousZoom = viewportZoom.zoomLevel;
    const nextZoom = Math.min(4, Math.max(1, previousZoom * factor));

    if (nextZoom === previousZoom) return;

    const offsetX = centerX - (rect.left + rect.width / 2);
    const offsetY = centerY - (rect.top + rect.height / 2);

    viewportZoom.zoomLevel = nextZoom;
    viewportZoom.panX += offsetX * (1 - previousZoom / nextZoom);
    viewportZoom.panY += offsetY * (1 - previousZoom / nextZoom);
    clampViewportZoom();
    applyVideoFilters();
  }

  function applyVideoFilters() {
    const scaleX = flipH ? -1 : 1;
    const scaleY = flipV ? -1 : 1;
    const zoomScaleX = scaleX * viewportZoom.zoomLevel;
    const zoomScaleY = scaleY * viewportZoom.zoomLevel;

    videoElement.style.filter = `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturate}%)
      hue-rotate(${filters.temperature}deg)
      blur(${filters.blur}px)
      grayscale(${filters.grayscale}%)
      sepia(${filters.sepia}%)
    `.trim();
    videoElement.style.transform = `translate(${viewportZoom.panX}px, ${viewportZoom.panY}px) rotate(${rotation}deg) scale(${zoomScaleX}, ${zoomScaleY})`;
  }

  function updateTransforms() {
    clampViewportZoom();
    applyVideoFilters();
  }

  function togglePlay() {
    if (!videoElement.src) return;

    if (isPlaying) {
      videoElement.pause();
      syncPlaybackUI();
      return;
    }

    const playPromise = videoElement.play();
    if (playPromise) {
      void playPromise.catch(() => {
        syncPlaybackUI();
      });
    }
    syncPlaybackUI();
  }

  function stepFrames(delta: number) {
    if (!videoElement.src) return;
    videoElement.pause();
    syncPlaybackUI();
    const frameDuration = 1 / 30;
    videoElement.currentTime = Math.max(0, Math.min(duration, videoElement.currentTime + delta * frameDuration));
  }

  function setAspectRatio(ratio: typeof aspectRatio) {
    aspectRatio = ratio;
    if (ratio === '16:9') videoElement.style.aspectRatio = '16/9';
    if (ratio === '9:16') videoElement.style.aspectRatio = '9/16';
    if (ratio === '1:1') videoElement.style.aspectRatio = '1/1';
    if (ratio === '4:5') videoElement.style.aspectRatio = '4/5';
    renderToolControls();
  }

  function updateCaptions() {
    if (!captionText.trim()) {
      captionOverlay.classList.add('hidden');
    } else {
      captionOverlay.textContent = captionText;
      captionOverlay.style.fontSize = `${captionSize}px`;
      captionOverlay.style.fontWeight = captionWeight;
      captionOverlay.style.backgroundColor = captionBg;
      captionOverlay.style.textShadow = captionShadow ? '0 2px 4px rgba(0,0,0,0.8)' : 'none';
      captionOverlay.style.left = `${captionX}%`;
      captionOverlay.style.top = `${captionY}%`;
      captionOverlay.style.transform = 'translate(-50%, -50%)';
      captionOverlay.classList.remove('hidden');
    }
  }

  // Real Export Engine Implementation
  async function startVideoExport() {
    if (!videoFile || !videoUrl) {
      alert('Please import a video before rendering.');
      return;
    }

    isRendering = true;
    renderProgress = 0;
    renderChunks = [];
    renderToolControls();

    if (isPlaying) {
      videoElement.pause();
      isPlaying = false;
      playPauseBtn.textContent = '▶';
    }

    const renderCanvas = document.createElement('canvas');
    let targetWidth = 1920;
    let targetHeight = 1080;

    if (exportResolution === '720p') { targetWidth = 1280; targetHeight = 720; }
    else if (exportResolution === '4k') { targetWidth = 3840; targetHeight = 2160; }

    if (aspectRatio === '9:16') { const temp = targetWidth; targetWidth = targetHeight; targetHeight = temp; }
    else if (aspectRatio === '1:1') { targetWidth = targetHeight; }
    else if (aspectRatio === '4:5') { targetHeight = Math.round(targetWidth * 1.25); }

    renderCanvas.width = targetWidth;
    renderCanvas.height = targetHeight;
    const ctx = renderCanvas.getContext('2d');

    const stream = renderCanvas.captureStream(exportFps);
    
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(videoElement);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);
      dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    } catch (err) {
      console.warn('Audio capture stream initialization skipped:', err);
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: exportBitrate });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        renderChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      isRendering = false;
      renderProgress = 100;
      renderToolControls();

      const blob = new Blob(renderChunks, { type: exportFormat === 'mp4' ? 'video/mp4' : 'video/webm' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `rendered-video-${Date.now()}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    videoElement.currentTime = trimStart;
    mediaRecorder.start();
    videoElement.play();

    const checkRenderProgress = () => {
      if (!isRendering) return;
      const current = videoElement.currentTime;
      const totalRange = (trimEnd || duration) - trimStart;
      const progress = Math.min(100, ((current - trimStart) / totalRange) * 100);
      renderProgress = isNaN(progress) ? 0 : progress;
      renderToolControls();

      if (ctx && videoElement.readyState >= 2) {
        ctx.save();
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.filter = videoElement.style.filter;
        ctx.translate(targetWidth / 2, targetHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(videoElement, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
        ctx.restore();

        if (captionText.trim()) {
          ctx.font = `${captionWeight} ${captionSize * (targetWidth / 1000)}px sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(captionText, (captionX / 100) * targetWidth, (captionY / 100) * targetHeight);
        }
      }

      if (current >= (trimEnd || duration) || videoElement.ended) {
        mediaRecorder?.stop();
        videoElement.pause();
        isRendering = false;
        renderToolControls();
        return;
      }

      requestAnimationFrame(checkRenderProgress);
    };

    requestAnimationFrame(checkRenderProgress);
  }

  function cancelVideoExport() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRendering = false;
    renderProgress = 0;
    renderToolControls();
  }

  function switchTab(tab: VideoTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `inline-flex min-w-[70px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[90px] sm:px-3 sm:text-[11px] ${
        isSelected
          ? 'border-slate-100/20 bg-slate-900/60 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`;
    });
    renderToolControls();
  }

  function createSliderControl(title: string, value: number, min: number, max: number, onChange: (val: number) => void) {
    const valDisplay = div({ className: 'text-xs font-mono text-violet-400 font-bold' }, Math.round(value).toString());
    
    return div({ className: 'space-y-1' },
      div({ className: 'flex justify-between items-center' },
        label({ className: 'text-xs font-medium text-slate-300' }, title),
        valDisplay
      ),
      input({
        type: 'range',
        min: min.toString(),
        max: max.toString(),
        value: value.toString(),
        step: '0.1',
        className: 'w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500',
        oninput: (e: Event) => {
          const v = parseFloat((e.target as HTMLInputElement).value);
          valDisplay.textContent = v.toFixed(1);
          onChange(v);
        },
        onchange: () => pushState()
      })
    );
  }

  function createSelectDropdown(options: string[], selected: string, onChange: (val: string) => void) {
    const select = document.createElement('select');
    select.className = 'bg-slate-950 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-500';
    options.forEach(opt => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt.toUpperCase();
      if (opt === selected) optEl.selected = true;
      select.append(optEl);
    });
    select.onchange = (e) => onChange((e.target as HTMLSelectElement).value);
    return select;
  }

  function createPresetButton(name: string, onClick: () => void) {
    return button({
      type: 'button',
      className: 'rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-left text-xs font-medium text-slate-200 hover:border-violet-500 hover:text-white transition-all shadow-sm',
      onclick: onClick
    }, name);
  }

  function createThumbnailPresetCard(name: string, presetValues: Partial<typeof filters>, icon: string) {
    const card = div({
      className: 'flex flex-col items-center justify-center p-3 rounded-xl border border-slate-700 bg-slate-900/70 hover:border-violet-500 hover:bg-slate-900 cursor-pointer transition-all shadow-sm text-center group'
    },
      div({ className: 'text-2xl mb-1 group-hover:scale-110 transition-transform' }, icon),
      p({ className: 'text-xs font-semibold text-slate-200' }, name)
    );

    card.onclick = () => {
      Object.assign(filters, presetValues);
      applyVideoFilters();
      pushState();
      renderToolControls();
    };

    return card;
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function resetEditor() {
    videoElement.pause();
    syncPlaybackUI();
    trimStart = 0;
    trimEnd = duration || 0;
    playbackRate = 1;
    videoElement.playbackRate = 1;
    volume = 1;
    videoElement.volume = 1;
    volumeSlider.value = '1';
    rotation = 0;
    flipH = false;
    flipV = false;
    viewportZoom.zoomLevel = 1;
    viewportZoom.panX = 0;
    viewportZoom.panY = 0;
    captionText = '';
    updateTransforms();
    updateCaptions();
    if (duration) updateTrimMarkers();
    pushState();
    renderToolControls();
  }

  renderToolControls();

  return root;
}