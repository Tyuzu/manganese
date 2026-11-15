import '../../css/videoeditor.css';

import {
  button,
  createButton,
  div,
  input,
  label,
  p,
  span,
  svgElement,
} from '../components/ui/dom';

import { appStore } from '../appState';
import { downloadVideoFromServer, exportVideoWithFFmpeg } from '../api';

import {
  bindEditorFullscreenButton,
  createDetailPanel,
  createEditorFooter,
  createEditorShell,
  createEditorTabNav,
  createMediaProcessingModeSelector,
} from './shared';
import {
  DEFAULT_CAPTION_STYLE,
  DEFAULT_FILTERS,
  DEFAULT_PLAYBACK_CURVE,
  PROJECT_DATABASE,
  PROJECT_ID,
  PROJECT_STORE,
  type AudioTrack,
  type BlendMode,
  type CaptionStyle,
  type CaptionTrack,
  type ClipTransition,
  type MaskItem,
  type MaskType,
  type PlaybackCurve,
  type TimedCaption,
  type TimelineClipSegment,
  type StoredProject,
  type VideoEditorState,
  type VideoFilters,
  type VideoTab,
} from './video-editor/types';
import { createVideoStageElements } from './video-editor/dom';
import { buildSrtFromSegments, parseSrtText } from './video-editor/captions';
import {
  dataUrlToFile,
  fileToDataUrl,
  openProjectDatabase,
} from './video-editor/storage';
import {
  drawExportFrame,
  getExportDimensions,
  getSupportedRecorderMimeType,
  parseCubeLut,
} from './video-editor/rendering';
import {
  clampValue,
  cloneCaptionSegments,
  cloneMasks,
  cubicBezierValue,
  formatTime,
} from './video-editor/utils';

export async function createVideoEditorPage(): Promise<HTMLElement> {
  // ============================================================
  // 1. EDITOR STATE
  // ============================================================

  let videoFile: File | null = null;
  let videoUrl: string | null = null;

  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;

  let activeTab: VideoTab = 'timeline';

  let trimStart = 0;
  let trimEnd = 0;

  let playbackRate = 1;

  let aspectRatio: VideoEditorState['aspectRatio'] = '16:9';

  let rotation = 0;
  let flipH = false;
  let flipV = false;

  let previewQuality: VideoEditorState['previewQuality'] = '1';

  let captionText = '';
  let captionSegments: TimedCaption[] = [];
  let audioTracks: AudioTrack[] = [];
  let captionTracks: CaptionTrack[] = [];
  let activeCaptionTrackId: number | null = null;

  let captionSize = DEFAULT_CAPTION_STYLE.size;
  let captionWeight = DEFAULT_CAPTION_STYLE.weight;
  let captionBg = DEFAULT_CAPTION_STYLE.background;
  let captionShadow = DEFAULT_CAPTION_STYLE.shadow;
  let captionX = DEFAULT_CAPTION_STYLE.x;
  let captionY = DEFAULT_CAPTION_STYLE.y;

  let activeTransition: ClipTransition = 'crossfade';

  let clipSegments: TimelineClipSegment[] = [];

  let activeBlendMode: BlendMode = 'screen';

  let masks: MaskItem[] = [];
  let activeMaskTool: MaskType = 'rect';

  let pendingMask: MaskItem | null = null;

  let playbackCurve: PlaybackCurve = structuredClone(
    DEFAULT_PLAYBACK_CURVE,
  );

  let cubeLut: VideoEditorState['cubeLut'] = null;

  let exportResolution: '720p' | '1080p' | '4k' = '1080p';
  let exportFps: 24 | 30 | 60 = 30;
  let exportFormat: 'webm' | 'mp4' = 'webm';
  let exportBitrate = 5_000_000;

  let isRendering = false;
  let exportCancelled = false;
  let renderProgress = 0;

  let mediaRecorder: MediaRecorder | null = null;
  let renderChunks: Blob[] = [];
  let renderAnimationFrame = 0;

  const filters: VideoFilters = { ...DEFAULT_FILTERS };

  const viewportZoom = {
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
  };

  let interactionModeEnabled = false;

  // ============================================================
  // 2. VIDEO ELEMENT AND PREVIEW CONTAINERS
  // ============================================================

  const {
    videoElement,
    videoContainer,
    maskOverlay,
    captionOverlay,
    interactionToggleButton,
  } = createVideoStageElements();

  videoElement.volume = volume;
  interactionToggleButton.onclick = () => setInteractionMode(!interactionModeEnabled);

  // ============================================================
  // 3. VIDEO PREVIEW INTERACTION
  // ============================================================

  function setInteractionMode(enabled: boolean) {
    interactionModeEnabled = enabled;

    interactionToggleButton.textContent = enabled
      ? 'Preview Controls: ON'
      : 'Preview Controls: OFF';

    interactionToggleButton.className = enabled
      ? 've-rounded-xl ve-border ve-border-violet-500/70 ve-bg-violet-600/20 ve-px-3 ve-py-2 ve-text-[10px] ve-font-bold ve-uppercase ve-tracking-[0.12em] ve-text-violet-100 ve-transition ve-hover:bg-violet-500/20'
      : 've-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-800/80 ve-px-3 ve-py-2 ve-text-[10px] ve-font-bold ve-uppercase ve-tracking-[0.12em] ve-text-slate-300 ve-transition ve-hover:border-slate-500 ve-hover:text-white';

    if (!enabled) {
      viewportZoom.isDragging = false;
    }
  }

  let isDraggingCaption = false;
  let captionDragOffsetX = 0;
  let captionDragOffsetY = 0;

  captionOverlay.onmousedown = (event: MouseEvent) => {
    if (interactionModeEnabled) return;

    isDraggingCaption = true;

    const rect = captionOverlay.getBoundingClientRect();

    captionDragOffsetX = event.clientX - rect.left;
    captionDragOffsetY = event.clientY - rect.top;

    event.stopPropagation();
  };

  window.addEventListener('mousemove', (event: MouseEvent) => {
    if (!isDraggingCaption) return;

    const parentRect = videoContainer.getBoundingClientRect();

    captionX = clampValue(
      ((event.clientX - captionDragOffsetX - parentRect.left) /
        parentRect.width) *
        100,
      0,
      100,
    );

    captionY = clampValue(
      ((event.clientY - captionDragOffsetY - parentRect.top) /
        parentRect.height) *
        100,
      0,
      100,
    );

    captionOverlay.style.left = `${captionX}%`;
    captionOverlay.style.top = `${captionY}%`;

    captionOverlay.style.transform = 'translate(-50%, -50%)';
  });

  window.addEventListener('mouseup', () => {
    if (!isDraggingCaption) return;

    isDraggingCaption = false;
    pushState();
  });

  videoContainer.onwheel = (event: WheelEvent) => {
    if (!videoElement.src || !interactionModeEnabled) return;

    event.preventDefault();

    zoomViewport(event.deltaY < 0 ? 1.12 : 0.88, event.clientX, event.clientY);
  };

  videoContainer.onmousedown = (event: MouseEvent) => {
    if (
      !videoElement.src ||
      !interactionModeEnabled ||
      viewportZoom.zoomLevel <= 1
    ) {
      return;
    }

    event.preventDefault();

    viewportZoom.isDragging = true;

    viewportZoom.startX = event.clientX - viewportZoom.panX;
    viewportZoom.startY = event.clientY - viewportZoom.panY;
  };

  window.addEventListener('mousemove', (event: MouseEvent) => {
    if (
      !interactionModeEnabled ||
      !viewportZoom.isDragging ||
      !videoElement.src ||
      viewportZoom.zoomLevel <= 1
    ) {
      return;
    }

    viewportZoom.panX = event.clientX - viewportZoom.startX;
    viewportZoom.panY = event.clientY - viewportZoom.startY;

    clampViewportZoom();
    applyVideoFilters();
  });

  window.addEventListener('mouseup', () => {
    viewportZoom.isDragging = false;
  });

  function clampViewportZoom() {
    const baseWidth = videoElement.offsetWidth || videoContainer.clientWidth || 1;
    const baseHeight = videoElement.offsetHeight || videoContainer.clientHeight || 1;

    const zoomWidth = baseWidth * viewportZoom.zoomLevel;
    const zoomHeight = baseHeight * viewportZoom.zoomLevel;

    const maxPanX = Math.max(
      0,
      (zoomWidth - videoContainer.clientWidth) / 2,
    );

    const maxPanY = Math.max(
      0,
      (zoomHeight - videoContainer.clientHeight) / 2,
    );

    viewportZoom.panX = clampValue(
      viewportZoom.panX,
      -maxPanX,
      maxPanX,
    );

    viewportZoom.panY = clampValue(
      viewportZoom.panY,
      -maxPanY,
      maxPanY,
    );
  }

  function zoomViewport(
    factor: number,
    x?: number,
    y?: number,
  ) {
    if (!videoElement.src) return;

    const rect = videoContainer.getBoundingClientRect();

    const centerX =
      typeof x === 'number' ? x : rect.left + rect.width / 2;

    const centerY =
      typeof y === 'number' ? y : rect.top + rect.height / 2;

    const previousZoom = viewportZoom.zoomLevel;

    const nextZoom = clampValue(
      previousZoom * factor,
      1,
      4,
    );

    if (nextZoom === previousZoom) return;

    const offsetX = centerX - (rect.left + rect.width / 2);
    const offsetY = centerY - (rect.top + rect.height / 2);

    viewportZoom.zoomLevel = nextZoom;

    viewportZoom.panX +=
      offsetX * (1 - previousZoom / nextZoom);

    viewportZoom.panY +=
      offsetY * (1 - previousZoom / nextZoom);

    clampViewportZoom();
    applyVideoFilters();
  }

  // ============================================================
  // 4. VIDEO TIMELINE AND PLAYBACK UI
  // ============================================================

  const playheadLine = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-w-0.5 ve-bg-white ve-z-30 ve-pointer-events-none shadow-md',
    style: 'left:0%',
  });

  const trimStartMarker = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-w-2.5 bg-violet-400 ve-border-r-2 ve-border-white ve-cursor-ew-resize ve-z-20 hover:bg-violet-300 ve-transition-colors ve-shadow-lg',
    style: 'left:0%',
  });

  const trimEndMarker = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-w-2.5 bg-violet-400 ve-border-l-2 ve-border-white ve-cursor-ew-resize ve-z-20 hover:bg-violet-300 ve-transition-colors ve-shadow-lg',
    style: 'left:100%',
  });

  const trimActiveZone = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-bg-violet-500/30 ve-border-t ve-border-b ve-border-violet-400/60 ve-pointer-events-none ve-z-10',
    style: 'left:0%;right:0%;',
  });

  const thumbnailStrip = div({
    className:
      've-absolute ve-inset-0 ve-flex ve-opacity-40 ve-pointer-events-none ve-overflow-hidden',
  });

  const videoTrackSegment = div(
    {
      className:
        've-relative ve-h-10 ve-rounded-lg ve-bg-slate-800/90 ve-border ve-border-slate-700 ve-flex ve-items-center ve-px-3 ve-text-xs ve-text-slate-300 ve-font-medium ve-overflow-hidden ve-shadow-inner ve-select-none',
    },
    thumbnailStrip,
    trimStartMarker,
    trimActiveZone,
    trimEndMarker,
    div(
      {
        className:
          've-truncate ve-relative ve-z-0 ve-text-slate-200 ve-text-[11px] ve-font-semibold ve-drop-shadow-md',
      },
      'Video Track ve-1 • Main Source Clip',
    ),
  );

  const audioTrackSegment = div(
    {
      className:
        've-relative ve-h-8 ve-rounded-lg ve-bg-cyan-950/50 ve-border ve-border-cyan-800/50 ve-flex ve-items-center ve-px-3 ve-text-xs ve-text-cyan-300 ve-font-medium ve-overflow-hidden ve-shadow-inner ve-select-none',
    },
    div(
      { className: 've-truncate ve-text-[11px]' },
      'Audio Track ve-1 • Source Audio',
    ),
  );

  const timelineRuler = div(
    {
      className:
        've-h-6 ve-border-b ve-border-slate-800/80 ve-bg-slate-950 ve-flex ve-items-center ve-justify-between ve-gap-2 ve-px-3 ve-text-[10px] ve-font-mono ve-text-slate-500 ve-select-none ve-sm:px-4',
    },
    div({}, '00:00'),
    div({}, '00:15'),
    div({}, '00:30'),
    div({}, '00:45'),
    div({}, '01:00'),
  );

  let isScrubbingTimeline = false;

  const timelineTrackArea = div({
    className:
      've-relative ve-flex-1 ve-p-3 ve-space-y-2 ve-overflow-y-auto ve-cursor-pointer ve-bg-slate-900/50',
    onmousedown: (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('.no-timeline-scrub')) return;

      isScrubbingTimeline = true;
      updatePlayheadFromMouseEvent(event);
    },
  });

  timelineTrackArea.append(
    playheadLine,
    videoTrackSegment,
    audioTrackSegment,
  );

  window.addEventListener('mousemove', (event: MouseEvent) => {
    if (!isScrubbingTimeline) return;

    updatePlayheadFromMouseEvent(event);
  });

  window.addEventListener('mouseup', () => {
    isScrubbingTimeline = false;
  });

  function updatePlayheadFromMouseEvent(event: MouseEvent) {
    const rect = timelineTrackArea.getBoundingClientRect();

    if (!rect.width || !duration) return;

    const clickX = event.clientX - rect.left;

    const ratio = clampValue(clickX / rect.width, 0, 1);

    videoElement.currentTime = ratio * duration;
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

  // ============================================================
  // 5. PROJECT STATE, HISTORY AND SERIALIZATION
  // ============================================================

  let history: VideoEditorState[] = [];
  let historyIndex = -1;

  let projectDb: IDBDatabase | null = null;

  let cachedVideoFile: File | null = null;
  let cachedVideoDataUrl: string | null = null;

  function ensureCaptionTrack(): CaptionTrack {
    if (!captionTracks.length) {
      const defaultTrack: CaptionTrack = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        label: 'Primary Captions',
        color: '#a78bfa',
        enabled: true,
        segments: cloneCaptionSegments(captionSegments),
      };

      captionTracks = [defaultTrack];
    }

    const activeTrack =
      captionTracks.find((track) => track.id === activeCaptionTrackId) ??
      captionTracks[0];

    if (!activeTrack) {
      const fallbackTrack: CaptionTrack = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        label: 'Primary Captions',
        color: '#a78bfa',
        enabled: true,
        segments: cloneCaptionSegments(captionSegments),
      };

      captionTracks = [fallbackTrack];
      activeCaptionTrackId = fallbackTrack.id;
      return fallbackTrack;
    }

    activeCaptionTrackId = activeTrack.id;
    return activeTrack;
  }

  function syncCurrentCaptionTrack() {
    const currentTrack = ensureCaptionTrack();
    currentTrack.segments = cloneCaptionSegments(captionSegments);
    currentTrack.label = currentTrack.label || 'Captions';
  }

  function renderTimelineRows() {
    const rows: HTMLElement[] = [videoTrackSegment];

    for (const track of audioTracks) {
      rows.push(
        div(
          {
            className:
              've-relative ve-h-8 ve-rounded-lg ve-border ve-border-sky-700/50 ve-bg-sky-950/40 ve-flex ve-items-center ve-justify-between ve-px-3 ve-text-[11px] ve-text-sky-200 ve-font-medium ve-overflow-hidden ve-shadow-inner ve-select-none',
          },
          div(
            {
              className: 've-truncate ve-max-w-[70%]',
            },
            `${track.label || 'Audio'} ${track.enabled ? '• Live' : '• Muted'}`,
          ),
          div(
            {
              className: 've-text-[10px] ve-text-sky-300/80',
            },
            `${(track.volume * 100).toFixed(0)}%`,
          ),
        ),
      );
    }

    for (const track of captionTracks) {
      rows.push(
        div(
          {
            className:
              've-relative ve-h-8 ve-rounded-lg ve-border ve-border-violet-700/50 ve-bg-violet-950/35 ve-flex ve-items-center ve-justify-between ve-px-3 ve-text-[11px] ve-text-violet-100 ve-font-medium ve-overflow-hidden ve-shadow-inner ve-select-none',
          },
          div(
            {
              className: 've-truncate ve-max-w-[70%]',
            },
            `${track.label || 'Captions'} ${track.enabled ? '• Visible' : '• Hidden'}`,
          ),
          div(
            {
              className: 've-text-[10px] ve-text-violet-200/80',
            },
            `${track.segments.length} cues`,
          ),
        ),
      );
    }

    timelineTrackArea.replaceChildren(playheadLine, ...rows);
  }

  function serializeEditorState(): VideoEditorState {
    return {
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
      captionSegments: cloneCaptionSegments(captionSegments),
      audioTracks: audioTracks.map((track) => ({
        ...track,
        dataUrl: track.dataUrl,
      })),
      captionTracks: captionTracks.map((track) => ({
        ...track,
        segments: cloneCaptionSegments(track.segments),
      })),
      activeCaptionTrackId,

      transitionType: activeTransition,
      clipSegments: clipSegments.map((segment) => ({ ...segment })),

      blendMode: activeBlendMode,

      masks: cloneMasks(masks),

      playbackCurve: {
        p0: { ...playbackCurve.p0 },
        p1: { ...playbackCurve.p1 },
        p2: { ...playbackCurve.p2 },
        p3: { ...playbackCurve.p3 },
      },

      cubeLut: cubeLut
        ? {
            size: cubeLut.size,
            values: [...cubeLut.values],
          }
        : null,

      captionSize,
      captionWeight,
      captionBg,
      captionShadow,
      captionX,
      captionY,

      filters: { ...filters },
    };
  }

  function cloneEditorState(
    state: VideoEditorState,
  ): VideoEditorState {
    return {
      ...state,
      captionSegments: cloneCaptionSegments(state.captionSegments),
      clipSegments: state.clipSegments.map((segment) => ({ ...segment })),
      masks: cloneMasks(state.masks),
      playbackCurve: {
        p0: { ...state.playbackCurve.p0 },
        p1: { ...state.playbackCurve.p1 },
        p2: { ...state.playbackCurve.p2 },
        p3: { ...state.playbackCurve.p3 },
      },
      cubeLut: state.cubeLut
        ? {
            size: state.cubeLut.size,
            values: [...state.cubeLut.values],
          }
        : null,
      filters: { ...state.filters },
    };
  }

  function pushState() {
    const currentState = serializeEditorState();

    history = history.slice(0, historyIndex + 1);

    history.push(cloneEditorState(currentState));

    const MAX_HISTORY = 100;

    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    historyIndex = history.length - 1;

    void persistProjectState();
  }

  function restoreState(
    state: Partial<VideoEditorState>,
  ) {
    if (Number.isFinite(state.trimStart)) {
      trimStart = Math.max(0, Number(state.trimStart));
    }

    if (Number.isFinite(state.trimEnd)) {
      trimEnd = Math.max(0, Number(state.trimEnd));
    }

    if (Number.isFinite(state.playbackRate)) {
      playbackRate = clampValue(Number(state.playbackRate), 0.25, 4);
    }

    if (Number.isFinite(state.volume)) {
      volume = clampValue(Number(state.volume), 0, 1);
    }

    if (state.aspectRatio) {
      aspectRatio = state.aspectRatio;
    }

    rotation = Number.isFinite(state.rotation)
      ? Number(state.rotation)
      : 0;

    flipH = Boolean(state.flipH);
    flipV = Boolean(state.flipV);

    previewQuality =
      state.previewQuality === '0.5' ||
      state.previewQuality === '0.25'
        ? state.previewQuality
        : '1';

    captionText = state.captionText ?? '';

    captionSegments = Array.isArray(state.captionSegments)
      ? cloneCaptionSegments(state.captionSegments)
      : [];

    audioTracks = Array.isArray(state.audioTracks)
      ? state.audioTracks.map((track) => ({
          id: Number.isFinite(track.id)
            ? Number(track.id)
            : Date.now() + Math.random(),
          label: typeof track.label === 'string'
            ? track.label
            : `Audio Track ${audioTracks.length + 1}`,
          fileName: typeof track.fileName === 'string'
            ? track.fileName
            : 'audio-track.mp3',
          dataUrl: typeof track.dataUrl === 'string' ? track.dataUrl : null,
          volume: Number.isFinite(track.volume)
            ? clampValue(Number(track.volume), 0, 2)
            : 1,
          trimStart: Number.isFinite(track.trimStart)
            ? Number(track.trimStart)
            : 0,
          trimEnd: Number.isFinite(track.trimEnd)
            ? Number(track.trimEnd)
            : duration || 0,
          enabled:
            typeof track.enabled === 'boolean'
              ? track.enabled
              : true,
        }))
      : [];

    captionTracks = Array.isArray(state.captionTracks)
      ? state.captionTracks.map((track) => ({
          id: Number.isFinite(track.id)
            ? Number(track.id)
            : Date.now() + Math.random(),
          label: typeof track.label === 'string'
            ? track.label
            : 'Captions',
          color: typeof track.color === 'string'
            ? track.color
            : '#a78bfa',
          enabled:
            typeof track.enabled === 'boolean'
              ? track.enabled
              : true,
          segments: Array.isArray(track.segments)
            ? cloneCaptionSegments(track.segments)
            : [],
        }))
      : [];

    if (!captionTracks.length) {
      captionTracks = [
        {
          id: 1,
          label: 'Primary Captions',
          color: '#a78bfa',
          enabled: true,
          segments: cloneCaptionSegments(captionSegments),
        },
      ];
    }

    activeCaptionTrackId =
      Number.isFinite(state.activeCaptionTrackId)
        ? Number(state.activeCaptionTrackId)
        : captionTracks[0]?.id ?? null;

    const activeTrack =
      captionTracks.find((track) => track.id === activeCaptionTrackId) ??
      captionTracks[0] ??
      null;

    if (activeTrack) {
      captionSegments = cloneCaptionSegments(activeTrack.segments);
      captionText = captionSegments[0]?.text ?? captionText;
    }

    activeTransition = state.transitionType ?? 'crossfade';

    clipSegments = Array.isArray(state.clipSegments)
      ? state.clipSegments.map((segment) => ({ ...segment }))
      : [];

    activeBlendMode = state.blendMode ?? 'screen';

    masks = Array.isArray(state.masks)
      ? cloneMasks(state.masks)
      : [];

    pendingMask = null;

    if (state.playbackCurve) {
      playbackCurve = {
        p0: { ...state.playbackCurve.p0 },
        p1: { ...state.playbackCurve.p1 },
        p2: { ...state.playbackCurve.p2 },
        p3: { ...state.playbackCurve.p3 },
      };
    } else {
      playbackCurve = structuredClone(DEFAULT_PLAYBACK_CURVE);
    }

    cubeLut = state.cubeLut
      ? {
          size: state.cubeLut.size,
          values: [...state.cubeLut.values],
        }
      : null;

    captionSize = Number.isFinite(state.captionSize)
      ? Number(state.captionSize)
      : DEFAULT_CAPTION_STYLE.size;

    captionWeight = state.captionWeight ?? DEFAULT_CAPTION_STYLE.weight;

    captionBg = state.captionBg ?? DEFAULT_CAPTION_STYLE.background;

    captionShadow =
      typeof state.captionShadow === 'boolean'
        ? state.captionShadow
        : DEFAULT_CAPTION_STYLE.shadow;

    captionX = Number.isFinite(state.captionX)
      ? clampValue(Number(state.captionX), 0, 100)
      : DEFAULT_CAPTION_STYLE.x;

    captionY = Number.isFinite(state.captionY)
      ? clampValue(Number(state.captionY), 0, 100)
      : DEFAULT_CAPTION_STYLE.y;

    if (state.filters) {
      Object.assign(filters, DEFAULT_FILTERS, state.filters);
    }

    if (duration) {
      trimStart = clampValue(trimStart, 0, duration);

      trimEnd = clampValue(
        trimEnd || duration,
        trimStart,
        duration,
      );

      if (trimEnd <= trimStart) {
        trimStart = 0;
        trimEnd = duration;
      }
    }

    videoElement.playbackRate = playbackRate;
    videoElement.volume = volume;

    volumeSlider.value = String(volume);

    setAspectRatio(aspectRatio);

    updateTransforms();
    updateCaptions();
    updateTrimMarkers();
    applyVideoFilters();
    applyMaskOverlay();

    renderToolControls();
  }

  // ============================================================
  // 6. INDEXEDDB PROJECT STORAGE
  // ============================================================

  async function persistProjectState() {
    if (!('indexedDB' in window)) return;

    try {
      const db =
        projectDb ??
        (await openProjectDatabase(
          PROJECT_DATABASE,
          PROJECT_STORE,
        ));

      projectDb = db;

      let videoDataUrl: string | null = null;

      if (videoFile) {
        if (
          cachedVideoFile === videoFile &&
          cachedVideoDataUrl
        ) {
          videoDataUrl = cachedVideoDataUrl;
        } else {
          videoDataUrl = await fileToDataUrl(videoFile);

          cachedVideoFile = videoFile;
          cachedVideoDataUrl = videoDataUrl;
        }
      }

      const payload: StoredProject = {
        id: PROJECT_ID,

        videoDataUrl,

        fileName: videoFile?.name ?? null,
        fileType: videoFile?.type ?? null,

        savedAt: Date.now(),

        state: serializeEditorState(),
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          PROJECT_STORE,
          'readwrite',
        );

        tx.objectStore(PROJECT_STORE).put(payload);

        tx.oncomplete = () => resolve();

        tx.onerror = () => {
          reject(
            tx.error ?? new Error('Project save failed.'),
          );
        };

        tx.onabort = () => {
          reject(
            tx.error ?? new Error('Project save was aborted.'),
          );
        };
      });
    } catch (error) {
      console.warn('Unable to save editor state:', error);
    }
  }

  async function hydrateProjectState() {
    if (!('indexedDB' in window)) return;

    try {
      const db =
        projectDb ??
        (await openProjectDatabase(
          PROJECT_DATABASE,
          PROJECT_STORE,
        ));

      projectDb = db;

      const entry = await new Promise<StoredProject | undefined>(
        (resolve, reject) => {
          const tx = db.transaction(
            PROJECT_STORE,
            'readonly',
          );

          const request = tx
            .objectStore(PROJECT_STORE)
            .get(PROJECT_ID);

          request.onsuccess = () => {
            resolve(request.result as StoredProject | undefined);
          };

          request.onerror = () => {
            reject(
              request.error ?? new Error('Project restore failed.'),
            );
          };
        },
      );

      if (!entry?.state) return;

      if (entry.videoDataUrl && entry.fileName) {
        const restoredFile = await dataUrlToFile(
          entry.videoDataUrl,
          entry.fileName,
          entry.fileType,
        );

        cachedVideoFile = restoredFile;
        cachedVideoDataUrl = entry.videoDataUrl;

        setVideoFile(restoredFile, entry.state);

        return;
      }

      restoreState(entry.state);
    } catch (error) {
      console.warn('Unable to restore editor state:', error);
    }
  }

  function exportProjectFile() {
    const snapshot = {
      version: 2,
      exportedAt: new Date().toISOString(),

      source: videoFile
        ? {
            name: videoFile.name,
            type: videoFile.type,
            size: videoFile.size,
          }
        : null,

      state: serializeEditorState(),
    };

    const blob = new Blob(
      [JSON.stringify(snapshot, null, 2)],
      {
        type: 'application/json;charset=utf-8',
      },
    );

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `dolomite-project-${Date.now()}.json`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  async function importProjectFile() {
    const filePicker = document.createElement('input');

    filePicker.type = 'file';
    filePicker.accept = '.json,application/json';

    filePicker.onchange = async () => {
      const file = filePicker.files?.[0];

      if (!file) return;

      try {
        const parsed = JSON.parse(await file.text());

        const state = parsed.state ?? parsed;

        if (!state || typeof state !== 'object') {
          throw new Error('Invalid project data.');
        }

        restoreState(state as Partial<VideoEditorState>);

        history = [];
        historyIndex = -1;

        pushState();

        activeTab = 'timeline';
        switchTab('timeline');

        if (videoElement.src) {
          updatePlaybackRateFromCurve();
        }

        if (!videoFile) {
          alert(
            'Project settings imported. Import the original source video to preview and render the project.',
          );
        }
      } catch (error) {
        console.error('Project import failed:', error);

        alert(
          'Unable to import this project. Please choose a valid Dolomite JSON project.',
        );
      }
    };

    filePicker.click();
  }

  // ============================================================
  // 7. UNDO AND REDO
  // ============================================================

  function undo() {
    if (historyIndex <= 0) return;

    historyIndex -= 1;

    restoreState(
      cloneEditorState(history[historyIndex]),
    );

    renderToolControls();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;

    historyIndex += 1;

    restoreState(
      cloneEditorState(history[historyIndex]),
    );

    renderToolControls();
  }

  // ============================================================
  // 8. PLAYBACK SPEED CURVE
  // ============================================================

  function getPlaybackRateAtTime(t: number): number {
    const y = cubicBezierValue(
      t,
      playbackCurve.p0.y,
      playbackCurve.p1.y,
      playbackCurve.p2.y,
      playbackCurve.p3.y,
    );

    return 0.25 + y * 3.75;
  }

  function updatePlaybackRateFromCurve() {
    if (!videoElement.src || !duration) return;

    const totalWindow = Math.max(
      0.01,
      (trimEnd || duration) - trimStart,
    );

    const normalized = clampValue(
      (videoElement.currentTime - trimStart) / totalWindow,
      0,
      1,
    );

    playbackRate = Number(
      getPlaybackRateAtTime(normalized).toFixed(2),
    );

    videoElement.playbackRate = getPlaybackRateAtTime(normalized);
  }

  // ============================================================
  // 9. SUBTITLE IMPORT AND EXPORT
  // ============================================================

  function getCurrentCaptionStyle(): CaptionStyle {
    return {
      size: captionSize,
      weight: captionWeight,
      background: captionBg,
      shadow: captionShadow,
      x: captionX,
      y: captionY,
    };
  }

  async function importSubtitleFile(file: File) {
    const rawText = await file.text();

    const segments = parseSrtText(
      rawText,
      getCurrentCaptionStyle,
    );

    if (!segments.length) {
      alert(
        'No valid subtitle cues were found in this file.',
      );
      return;
    }

    const targetTrack = ensureCaptionTrack();

    captionSegments = cloneCaptionSegments(segments);
    targetTrack.segments = cloneCaptionSegments(segments);

    captionText = segments[0].text;

    captionSize = segments[0].style.size;
    captionWeight = segments[0].style.weight;
    captionBg = segments[0].style.background;
    captionShadow = segments[0].style.shadow;

    captionX = segments[0].style.x;
    captionY = segments[0].style.y;

    updateCaptions();
    renderTimelineRows();

    pushState();
    renderToolControls();
  }

  function exportSubtitleFile() {
    if (!captionSegments.length && !captionText.trim()) {
      alert(
        'Add subtitle content before exporting a subtitle file.',
      );
      return;
    }

    const segments =
      captionSegments.length > 0
        ? captionSegments
        : [
            {
              id: 1,
              start: 0,
              end: Math.max(3, duration || 3),
              text: captionText,
              style: getCurrentCaptionStyle(),
            },
          ];

    const subtitleText = buildSrtFromSegments(segments);

    const blob = new Blob(
      [subtitleText],
      {
        type: 'text/plain;charset=utf-8',
      },
    );

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = 'captions.srt';

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  function getActiveCaption(): TimedCaption | null {
    const activeTrack = ensureCaptionTrack();
    const activeSegments = activeTrack.segments.length
      ? activeTrack.segments
      : captionSegments;

    const activeCaption = activeSegments.find(
      (segment) =>
        currentTime >= segment.start &&
        currentTime <= segment.end,
    );

    if (activeCaption) return activeCaption;

    if (!captionText.trim()) return null;

    return {
      id: 0,
      start: 0,
      end: duration || 0,
      text: captionText,
      style: getCurrentCaptionStyle(),
    };
  }

  // ============================================================
  // 10. CAPTION PREVIEW
  // ============================================================

  function updateCaptions() {
    const activeCaption = getActiveCaption();

    const resolvedText = activeCaption?.text ?? captionText;

    if (!resolvedText.trim()) {
      captionOverlay.classList.add('ve-hidden');
      return;
    }

    const styleSource =
      activeCaption?.style ?? getCurrentCaptionStyle();

    captionOverlay.textContent = resolvedText;

    captionOverlay.style.fontSize =
      `${styleSource.size}px`;

    captionOverlay.style.fontWeight =
      styleSource.weight;

    captionOverlay.style.backgroundColor =
      styleSource.background;

    captionOverlay.style.textShadow =
      styleSource.shadow
        ? '0 2px 4px rgba(0,0,0,0.8)'
        : 'none';

    captionOverlay.style.left =
      `${styleSource.x}%`;

    captionOverlay.style.top =
      `${styleSource.y}%`;

    captionOverlay.style.transform =
      'translate(-50%, -50%)';

    captionOverlay.classList.remove('ve-hidden');
  }

  // ============================================================
  // 11. MASKS AND VIDEO FILTERS
  // ============================================================

  function applyMaskOverlay() {
    const visibleMasks = pendingMask
      ? [
          ...masks.filter((mask) => mask.id !== pendingMask?.id),
          pendingMask,
        ]
      : masks;

    maskOverlay.replaceChildren();

    if (!visibleMasks.length) {
      maskOverlay.classList.add('ve-hidden');
      return;
    }

    maskOverlay.classList.remove('ve-hidden');

    for (const mask of visibleMasks) {
      const element = div({
        className: 've-absolute ve-pointer-events-none',

        style: [
          'position:absolute',
          `left:${mask.x}%`,
          `top:${mask.y}%`,
          `width:${Math.max(1, mask.width)}%`,
          `height:${Math.max(1, mask.height)}%`,
          `opacity:${clampValue(mask.opacity, 0, 1)}`,
          `background:${mask.color}22`,
          `border:2px solid ${mask.color}`,
          `border-radius:${mask.type === 'circle' ? '50%' : '12px'}`,
          `box-shadow:0 0 ${Math.max(0, mask.blur)}px ${mask.color}`,
          `filter:blur(${Math.min(Math.max(mask.blur, 0), 12)}px)`,
          'transform:translate(-50%,-50%)',
        ].join(';'),
      });

      if (mask.type === 'freehand' && mask.points.length > 2) {
        const points = mask.points
          .map((point) => `${point.x}% ${point.y}%`)
          .join(',');

        element.style.clipPath = `polygon(${points})`;
      }

      maskOverlay.append(element);
    }
  }

  function applyVideoFilters() {
    const scaleX =
      (flipH ? -1 : 1) * viewportZoom.zoomLevel;

    const scaleY =
      (flipV ? -1 : 1) * viewportZoom.zoomLevel;

    const exposureBoost = filters.exposure / 100;

    const brightness = clampValue(
      filters.brightness * exposureBoost,
      0,
      200,
    );

    const contrast = clampValue(
      filters.contrast,
      0,
      250,
    );

    const saturation = clampValue(
      filters.saturate,
      0,
      250,
    );

    videoElement.style.filter = [
      `brightness(${brightness}%)`,
      `contrast(${contrast}%)`,
      `saturate(${saturation}%)`,
      `hue-rotate(${filters.temperature + filters.tint}deg)`,
      `blur(${clampValue(filters.blur, 0, 20)}px)`,
      `grayscale(${clampValue(filters.grayscale, 0, 100)}%)`,
      `sepia(${clampValue(filters.sepia, 0, 100)}%)`,
    ].join(' ');

    videoElement.style.transform = [
      `translate(${viewportZoom.panX}px, ${viewportZoom.panY}px)`,
      `rotate(${rotation}deg)`,
      `scale(${scaleX}, ${scaleY})`,
    ].join(' ');

    applyMaskOverlay();
  }

  function updateTransforms() {
    clampViewportZoom();
    applyVideoFilters();
  }

  // ============================================================
  // 12. PLAYBACK CONTROLS
  // ============================================================

  const timeDisplay = div(
    {
      className:
        've-min-w-0 ve-flex-shrink-0 ve-font-mono ve-text-[11px] ve-text-slate-300 ve-text-center ve-sm:min-w-[95px]',
    },
    '00:00 / 00:00',
  );

  function syncPlaybackUI() {
    const isActive =
      !!videoElement.src &&
      !videoElement.paused &&
      !videoElement.ended;

    isPlaying = isActive;

    playPauseBtn.textContent = isPlaying ? '❚❚' : '▶';

    playPauseBtn.title = isPlaying
      ? 'Pause playback'
      : 'Play playback';

    playPauseBtn.setAttribute(
      'aria-label',
      isPlaying ? 'Pause video' : 'Play video',
    );
  }

  function togglePlay() {
    if (!videoElement.src) return;

    if (isPlaying) {
      videoElement.pause();
      syncPlaybackUI();
      return;
    }

    void videoElement.play().catch((error) => {
      console.warn('Video playback failed:', error);
      syncPlaybackUI();
    });

    syncPlaybackUI();
  }

  function stepFrames(delta: number) {
    if (!videoElement.src) return;

    videoElement.pause();

    syncPlaybackUI();

    const frameDuration = 1 / 30;

    videoElement.currentTime = clampValue(
      videoElement.currentTime + delta * frameDuration,
      0,
      duration,
    );
  }

  const playPauseBtn = button(
    {
      type: 'button',
      className:
        've-inline-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-800/80 text-base ve-font-bold ve-text-white ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300 ve-focus:outline-none ve-focus:ring-2 ve-focus:ring-violet-500/60',
      title: 'Play playback',
      onclick: togglePlay,
    },
    '▶',
  );

  const stepBackwardBtn = button(
    {
      type: 'button',
      className:
        've-text-slate-400 ve-hover:text-white ve-text-xs ve-px-1.5 ve-py-1',
      title: 'Step backward one frame',
      onclick: () => stepFrames(-1),
    },
    '⏮',
  );

  const stepForwardBtn = button(
    {
      type: 'button',
      className:
        've-text-slate-400 ve-hover:text-white ve-text-xs ve-px-1.5 ve-py-1',
      title: 'Step forward one frame',
      onclick: () => stepFrames(1),
    },
    '⏭',
  );

  const seekSlider = input({
    type: 'range',
    min: '0',
    max: '100',
    value: '0',
    step: '0.1',

    className:
      've-h-1.5 ve-w-full ve-flex-1 ve-bg-slate-800 ve-rounded-lg ve-appearance-none ve-cursor-pointer ve-accent-violet-500',

    oninput: (event: Event) => {
      const target = event.target as HTMLInputElement;

      if (!duration) return;

      videoElement.currentTime =
        (Number(target.value) / 100) * duration;
    },
  });

  const volumeSlider = input({
    type: 'range',
    min: '0',
    max: 've-1',
    step: '0.05',
    value: 've-1',

    className:
      've-h-1.5 ve-w-16 ve-bg-slate-800 ve-rounded-lg ve-appearance-none ve-cursor-pointer ve-accent-violet-500',

    oninput: (event: Event) => {
      const value = Number(
        (event.target as HTMLInputElement).value,
      );

      volume = clampValue(value, 0, 1);

      videoElement.volume = volume;

      pushState();
    },
  });

  const playerHud = div(
    {
      className:
        've-flex ve-flex-col ve-gap-2 ve-rounded-xl ve-border ve-border-slate-700/50 ve-bg-slate-900/90 ve-p-3 ve-backdrop-blur-md ve-z-10 ve-sm:min-h-[56px] ve-sm:flex-row ve-sm:items-center ve-sm:gap-3 ve-sm:px-5',
    },

    div(
      {
        className: 've-flex ve-items-center ve-gap-2',
      },
      stepBackwardBtn,
      playPauseBtn,
      stepForwardBtn,
      timeDisplay,
    ),

    seekSlider,

    div(
      {
        className:
          've-flex ve-items-center ve-gap-2 ve-text-xs ve-text-slate-400 ve-sm:ml-2',
      },
      span(
        {
          className:
            've-inline-flex ve-h-7 ve-w-7 ve-items-center ve-justify-center ve-rounded-lg ve-bg-slate-800/90 ve-text-sm',
        },
        '🔊',
      ),
      volumeSlider,
    ),
  );

  // ============================================================
  // 13. LOAD AND RESTORE SOURCE VIDEO
  // ============================================================

  function flushVideoSession() {
    if (renderAnimationFrame) {
      cancelAnimationFrame(renderAnimationFrame);
      renderAnimationFrame = 0;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    exportCancelled = true;
    isRendering = false;
    renderChunks = [];
    renderProgress = 0;
    history = [];
    historyIndex = -1;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      videoUrl = null;
    }

    videoFile = null;
    currentTime = 0;
    duration = 0;
    trimStart = 0;
    trimEnd = 0;

    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();

    captionText = '';
    captionSegments = [];
    audioTracks = [];
    captionTracks = [
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        label: 'Primary Captions',
        color: '#a78bfa',
        enabled: true,
        segments: [],
      },
    ];
    activeCaptionTrackId = captionTracks[0].id;

    masks = [];
    pendingMask = null;
    clipSegments = [];
    playbackCurve = structuredClone(DEFAULT_PLAYBACK_CURVE);
    cubeLut = null;
    Object.assign(filters, DEFAULT_FILTERS);

    setAspectRatio('16:9');
    videoElement.volume = 1;
    videoElement.playbackRate = 1;
    volume = 1;
    volumeSlider.value = 've-1';

    renderToolControls();
    updateCaptions();
    updateTrimMarkers();
    applyMaskOverlay();
    applyVideoFilters();
  }

  function setVideoFile(
    file: File,
    restoredState?: Partial<VideoEditorState>,
  ) {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      videoUrl = null;
    }

    videoFile = file;

    audioTracks = [];
    captionTracks = [
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        label: 'Primary Captions',
        color: '#a78bfa',
        enabled: true,
        segments: [],
      },
    ];
    activeCaptionTrackId = captionTracks[0].id;
    captionSegments = [];
    captionText = '';

    videoUrl = URL.createObjectURL(file);

    cachedVideoFile = null;
    cachedVideoDataUrl = null;

    viewportZoom.zoomLevel = 1;
    viewportZoom.panX = 0;
    viewportZoom.panY = 0;

    videoContainer.replaceChildren(
      maskOverlay,
      videoElement,
      captionOverlay,
    );

    videoElement.onloadedmetadata = () => {
      duration = Number.isFinite(videoElement.duration)
        ? videoElement.duration
        : 0;

      if (restoredState) {
        restoreState(restoredState);
      } else {
        trimStart = 0;
        trimEnd = duration;

        clipSegments = duration
          ? [
              {
                id: 1,
                start: 0,
                end: duration,
                label: file.name || 'Main Clip',
              },
            ]
          : [];

        videoElement.currentTime = 0;

        updateTrimMarkers();
        applyVideoFilters();
        updateCaptions();
      }

      timeDisplay.textContent =
        `${formatTime(0)} / ${formatTime(duration)}`;

      syncPlaybackUI();

      generateThumbnailStrip();

      renderToolControls();

      if (history.length === 0) {
        pushState();
      }
    };

    videoElement.onplay = syncPlaybackUI;
    videoElement.onpause = syncPlaybackUI;
    videoElement.onended = syncPlaybackUI;

    videoElement.ontimeupdate = () => {
      if (!duration) return;

      currentTime = videoElement.currentTime;

      timeDisplay.textContent =
        `${formatTime(currentTime)} / ${formatTime(duration)}`;

      const percent =
        duration > 0
          ? (currentTime / duration) * 100
          : 0;

      seekSlider.value = String(percent);

      playheadLine.style.left = `${percent}%`;

      updateCaptions();

      if (!isRendering) {
        updatePlaybackRateFromCurve();

        if (
          trimEnd > 0 &&
          currentTime >= trimEnd
        ) {
          videoElement.pause();
          videoElement.currentTime = trimEnd;
          syncPlaybackUI();
        }
      }
    };

    videoElement.src = videoUrl;

    videoElement.load();
  }

  function handleVideoUpload(event: Event) {
    const target = event.target as HTMLInputElement;

    const file = target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file.');
      target.value = '';
      return;
    }

    flushVideoSession();
    setVideoFile(file);

    target.value = '';
  }

  // ============================================================
  // 14. VIDEO THUMBNAIL GENERATION
  // ============================================================

  async function generateThumbnailStrip() {
    thumbnailStrip.replaceChildren();

    if (!videoUrl || !duration) return;

    const frameCount = 10;

    const previewVideo = document.createElement('video');

    previewVideo.src = videoUrl;
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.preload = 'auto';

    const canvases: HTMLCanvasElement[] = [];

    for (let index = 0; index < frameCount; index += 1) {
      const canvas = document.createElement('canvas');

      canvas.width = 160;
      canvas.height = 90;

      canvas.className =
        've-h-full ve-w-full border-r ve-border-slate-700/50 ve-bg-slate-900/80 ve-object-cover';

      thumbnailStrip.append(canvas);

      canvases.push(canvas);
    }

    const waitForEvent = (
      target: EventTarget,
      eventName: string,
    ): Promise<void> =>
      new Promise((resolve) => {
        target.addEventListener(
          eventName,
          () => resolve(),
          { once: true },
        );
      });

    try {
      if (previewVideo.readyState < 1) {
        await waitForEvent(previewVideo, 'loadedmetadata');
      }

      for (let index = 0; index < frameCount; index += 1) {
        const canvas = canvases[index];

        const seekTime =
          (index / Math.max(1, frameCount - 1)) *
          Math.max(0, duration - 0.1);

        if (Math.abs(previewVideo.currentTime - seekTime) > 0.01) {
          const seeked = waitForEvent(previewVideo, 'seeked');

          previewVideo.currentTime = seekTime;

          await seeked;
        }

        const ctx = canvas.getContext('2d');

        if (!ctx) continue;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(
          previewVideo,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }
    } catch (error) {
      console.warn('Thumbnail generation failed:', error);
    } finally {
      previewVideo.pause();
      previewVideo.removeAttribute('src');
      previewVideo.load();
    }
  }

  // ============================================================
  // 15. CLIP OPERATIONS
  // ============================================================

  function splitClipAtPlayhead() {
    if (
      !duration ||
      currentTime <= 0 ||
      currentTime >= duration
    ) {
      return;
    }

    const currentSegment = clipSegments.find(
      (segment) =>
        currentTime > segment.start &&
        currentTime < segment.end,
    );

    if (!currentSegment) {
      alert('Place the playhead inside a timeline clip first.');
      return;
    }

    const left: TimelineClipSegment = {
      ...currentSegment,
      end: currentTime,
    };

    const right: TimelineClipSegment = {
      id: Date.now(),
      start: currentTime,
      end: currentSegment.end,
      label: `${currentSegment.label} B`,
    };

    clipSegments = [
      ...clipSegments.filter(
        (segment) => segment.id !== currentSegment.id,
      ),
      left,
      right,
    ].sort((a, b) => a.start - b.start);

    pushState();
    renderToolControls();
  }

  function deleteCurrentClipSegment() {
    if (clipSegments.length <= 1) {
      alert(
        'The last remaining source segment cannot be deleted.',
      );
      return;
    }

    const targetIndex = clipSegments.findIndex(
      (segment) =>
        currentTime >= segment.start &&
        currentTime < segment.end,
    );

    if (targetIndex < 0) return;

    const removed = clipSegments[targetIndex];

    clipSegments = clipSegments.filter(
      (segment) => segment.id !== removed.id,
    );

    pushState();
    renderToolControls();
  }

  // ============================================================
  // 16. PLAYBACK CURVE UI
  // ============================================================

  function renderPlaybackCurveEditor() {
    const editor = div({
      className:
        've-mt-3 ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-950/80 ve-p-2',
    });

    const canvas = document.createElement('canvas');

    canvas.width = 280;
    canvas.height = 110;

    canvas.className =
      've-w-full ve-rounded-lg ve-border ve-border-slate-800 ve-bg-slate-900';

    const redraw = () => {
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;

      for (let index = 0; index <= 4; index += 1) {
        const x = (index / 4) * width;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let index = 0; index <= 4; index += 1) {
        const y = (index / 4) * height;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.beginPath();

      for (let index = 0; index <= 100; index += 1) {
        const t = index / 100;

        const x =
          cubicBezierValue(
            t,
            playbackCurve.p0.x,
            playbackCurve.p1.x,
            playbackCurve.p2.x,
            playbackCurve.p3.x,
          ) * width;

        const y =
          height -
          cubicBezierValue(
            t,
            playbackCurve.p0.y,
            playbackCurve.p1.y,
            playbackCurve.p2.y,
            playbackCurve.p3.y,
          ) *
            height;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.stroke();

      for (const point of [
        playbackCurve.p1,
        playbackCurve.p2,
      ]) {
        ctx.beginPath();

        ctx.arc(
          point.x * width,
          height - point.y * height,
          5,
          0,
          Math.PI * 2,
        );

        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        ctx.strokeStyle = '#a78bfa';
        ctx.stroke();
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px sans-serif';

      ctx.fillText('0.25x', 6, height - 7);
      ctx.fillText('4x', width - 24, 12);
    };

    let activeHandle: 'p1' | 'p2' | null = null;

    canvas.onpointerdown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();

      const x = clampValue(
        (event.clientX - rect.left) / rect.width,
        0,
        1,
      );

      const y = clampValue(
        1 - (event.clientY - rect.top) / rect.height,
        0,
        1,
      );

      const handles = [
        {
          name: 'p1' as const,
          point: playbackCurve.p1,
        },
        {
          name: 'p2' as const,
          point: playbackCurve.p2,
        },
      ];

      let nearestDistance = 0.15;

      for (const handle of handles) {
        const distance = Math.hypot(
          handle.point.x - x,
          handle.point.y - y,
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          activeHandle = handle.name;
        }
      }

      if (activeHandle) {
        canvas.setPointerCapture(event.pointerId);
      }
    };

    canvas.onpointermove = (event: PointerEvent) => {
      if (!activeHandle) return;

      const rect = canvas.getBoundingClientRect();

      playbackCurve[activeHandle].x = clampValue(
        (event.clientX - rect.left) / rect.width,
        0,
        1,
      );

      playbackCurve[activeHandle].y = clampValue(
        1 - (event.clientY - rect.top) / rect.height,
        0,
        1,
      );

      playbackRate = Number(
        getPlaybackRateAtTime(0.5).toFixed(2),
      );

      updatePlaybackRateFromCurve();

      redraw();
    };

    canvas.onpointerup = () => {
      if (!activeHandle) return;

      activeHandle = null;

      pushState();
      renderToolControls();
    };

    canvas.onpointercancel = () => {
      activeHandle = null;
    };

    redraw();

    editor.append(canvas);

    return editor;
  }

  // ============================================================
  // 17. LUT IMPORT
  // ============================================================

  function updateRenderProgressUI(progress: number) {
    const safeProgress = clampValue(progress, 0, 100);

    renderProgress = safeProgress;

    if (renderProgressLabel) {
      renderProgressLabel.textContent =
        `Rendering Video... ${Math.round(safeProgress)}%`;
    }

    if (renderProgressFill) {
      renderProgressFill.style.width =
        `${safeProgress}%`;
    }
  }

  let renderProgressLabel: HTMLElement | null = null;
  let renderProgressFill: HTMLElement | null = null;

  // ============================================================
  // 20. SERVER AND BROWSER EXPORT
  // ============================================================

  async function pollServerVideoExport(jobId: string, fileName: string): Promise<void> {
    while (isRendering) {
      try {
        const status = await getVideoExportStatus(jobId);

        if (status.status === 'completed') {
          isRendering = false;
          renderToolControls();
          updateRenderProgressUI(100);

          if (status.output) {
            await downloadVideoFromServer(
              status.output,
              status.fileName || fileName || 'dolomite-rendered.mp4',
            );
          }

          alert(
            status.message ||
              'The server render finished successfully.',
          );
          return;
        }

        if (status.status === 'failed' || status.error) {
          isRendering = false;
          renderToolControls();
          updateRenderProgressUI(0);
          alert(status.error || status.message || 'Server render failed.');
          return;
        }

        const nextProgress = typeof status.progress === 'number'
          ? clampValue(status.progress, 0, 100)
          : status.status === 'processing'
            ? 35
            : 10;

        updateRenderProgressUI(nextProgress);
      } catch (error) {
        console.warn('Server export status poll failed:', error);
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  async function fallbackToServerExport(): Promise<boolean> {
    if (!videoFile) {
      return false;
    }

    try {
      const dataUrl = await fileToDataUrl(videoFile);

      const result = await exportVideoWithFFmpeg({
        operation: 'video-export',
        mediaType: 'video',
        fileName:
          videoFile.name ||
          `rendered-video-${Date.now()}.${exportFormat}`,
        mode: 'server',
        dataUrl,
        metadata: {
          resolution: exportResolution,
          fps: exportFps,
          format: exportFormat,
          bitrate: exportBitrate,
          async: true,

          trimStart,
          trimEnd,

          aspectRatio,
          rotation,
          flipH,
          flipV,

          playbackRate,
          volume,

          captionSegments,
          captionText,
          audioTracks: audioTracks.map((track) => ({
            ...track,
            dataUrl: track.dataUrl,
          })),
          captionTracks: captionTracks.map((track) => ({
            ...track,
            segments: cloneCaptionSegments(track.segments),
          })),
          activeCaptionTrackId,

          filters: { ...filters },

          transitionType: activeTransition,
          blendMode: activeBlendMode,
        },
      });

      console.warn(
        'Browser export produced an empty file; server FFmpeg fallback was used.',
        result,
      );

      if (result.jobId) {
        await pollServerVideoExport(
          result.jobId,
          result.fileName || videoFile.name || 'dolomite-rendered.mp4',
        );
        return true;
      }

      if (result.output) {
        await downloadVideoFromServer(
          result.output,
          result.fileName || 'dolomite-rendered.mp4',
        );
      }

      alert(
        result.message ||
          'The browser export was empty, so the FFmpeg server fallback produced the final video.',
      );

      return true;
    } catch (error) {
      console.error('Server fallback export failed:', error);
      return false;
    }
  }

  async function startVideoExport() {
    if (!videoFile || !videoUrl) {
      alert('Please import a video before rendering.');
      return;
    }

    if (isRendering) {
      alert('A video render is already in progress.');
      return;
    }

    if (!duration || trimEnd <= trimStart) {
      alert('Please choose a valid video trim range.');
      return;
    }

    // ----------------------------------------------------------
    // Server rendering
    // ----------------------------------------------------------

    if (
      (appStore.getState().mediaProcessingMode ?? 'browser') ===
      'server'
    ) {
      try {
        const dataUrl = await fileToDataUrl(videoFile);

        isRendering = true;
        renderToolControls();
        updateRenderProgressUI(5);

        const result = await exportVideoWithFFmpeg({
          operation: 'video-export',
          mediaType: 'video',

          fileName:
            videoFile.name ||
            `rendered-video-${Date.now()}.${exportFormat}`,

          mode: 'server',
          dataUrl,

          metadata: {
            resolution: exportResolution,
            fps: exportFps,
            format: exportFormat,
            bitrate: exportBitrate,
            async: true,

            trimStart,
            trimEnd,

            aspectRatio,
            rotation,
            flipH,
            flipV,

            playbackRate,
            volume,

            captionSegments,
            captionText,
            audioTracks: audioTracks.map((track) => ({
              ...track,
              dataUrl: track.dataUrl,
            })),
            captionTracks: captionTracks.map((track) => ({
              ...track,
              segments: cloneCaptionSegments(track.segments),
            })),
            activeCaptionTrackId,

            filters: { ...filters },

            transitionType: activeTransition,
            blendMode: activeBlendMode,
          },
        });

        console.info(
          'Video export request sent to server:',
          result,
        );

        if (result.jobId) {
          await pollServerVideoExport(
            result.jobId,
            result.fileName || videoFile.name || 'dolomite-rendered.mp4',
          );
          return;
        }

        if (result.output) {
          try {
            await downloadVideoFromServer(
              result.output,
              result.fileName || 'dolomite-rendered.mp4',
            );
          } catch (downloadError) {
            console.error('Video download failed:', downloadError);
          }
        }

        alert(
          result.message ||
            'Video processing request was sent to the server.',
        );
      } catch (error) {
        console.error('Server video export failed:', error);

        isRendering = false;
        renderToolControls();

        alert(
          'Server render failed. Check the server connection or use browser rendering.',
        );
      }

      return;
    }

    // ----------------------------------------------------------
    // Browser rendering
    // ----------------------------------------------------------

    if (typeof MediaRecorder === 'undefined') {
      alert(
        'Your browser does not support MediaRecorder. Try a supported modern browser or server rendering.',
      );
      return;
    }

    if (
      typeof HTMLCanvasElement.prototype.captureStream !== 'function'
    ) {
      alert(
        'Your browser does not support canvas video capture.',
      );
      return;
    }

    const mimeType = getSupportedRecorderMimeType(exportFormat);
    const targetRecordingFrameRate = Math.min(exportFps, 30);

    if (!mimeType) {
      if (exportFormat === 'mp4') {
        alert(
          'Your browser does not support MP4 recording. Select WebM or switch to server rendering for genuine MP4/H.264 output.',
        );
      } else {
        alert(
          'Your browser does not support a compatible WebM recording format.',
        );
      }

      return;
    }

    const { width, height } = getExportDimensions(
      exportResolution,
      aspectRatio,
    );

    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      alert('Could not initialize the export canvas.');
      return;
    }

    exportCancelled = false;
    isRendering = true;
    renderProgress = 0;
    renderChunks = [];

    renderToolControls();

    updateRenderProgressUI(0);

    videoElement.pause();
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.defaultPlaybackRate = 1;
    videoElement.playbackRate = 1;
    syncPlaybackUI();

    const canvasStream = canvas.captureStream(exportFps);

    // Capture source audio separately and combine it with
    // the processed canvas video track.
    const captureVideo = videoElement as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };

    let sourceStream: MediaStream | null = null;

    try {
      if (captureVideo.captureStream) {
        sourceStream = captureVideo.captureStream();
      } else if (captureVideo.mozCaptureStream) {
        sourceStream = captureVideo.mozCaptureStream();
      }
    } catch (error) {
      console.warn('Audio capture is unavailable:', error);
    }

    if (sourceStream) {
      for (const track of sourceStream.getAudioTracks()) {
        canvasStream.addTrack(track);
      }
    }

    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: exportBitrate,
      });
    } catch (error) {
      isRendering = false;

      canvasStream.getTracks().forEach((track) => track.stop());

      console.error('Could not initialize MediaRecorder:', error);

      alert('Could not initialize the browser video encoder.');

      renderToolControls();

      return;
    }

    mediaRecorder = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        renderChunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);

      exportCancelled = true;
      isRendering = false;

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    recorder.onstop = async () => {
      const wasCancelled = exportCancelled;

      isRendering = false;

      if (renderAnimationFrame) {
        cancelAnimationFrame(renderAnimationFrame);
        renderAnimationFrame = 0;
      }

      canvasStream.getTracks().forEach((track) => track.stop());

      sourceStream?.getTracks().forEach((track) => track.stop());

      if (wasCancelled) {
        renderChunks = [];

        renderProgress = 0;

        exportCancelled = false;

        renderToolControls();

        return;
      }

      updateRenderProgressUI(100);

      const actualMimeType =
        recorder.mimeType || mimeType;

      const extension = actualMimeType.includes('mp4')
        ? 'mp4'
        : 'webm';

      const blob = new Blob(renderChunks, {
        type: actualMimeType,
      });

      renderChunks = [];

      if (!blob.size) {
        const fallbackSucceeded = await fallbackToServerExport();

        if (fallbackSucceeded) {
          renderChunks = [];
          renderProgress = 0;
          renderToolControls();
          return;
        }

        alert(
          'The render produced an empty video file and the FFmpeg fallback could not complete.',
        );
        renderToolControls();
        return;
      }

      const downloadUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');

      anchor.href = downloadUrl;

      anchor.download =
        `rendered-video-${Date.now()}.${extension}`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 60_000);

      renderToolControls();
    };

    try {
      // Seek before recording so the export does not start
      // with an unintended frame from the previous playhead.
      await seekVideoTo(trimStart);

      if (exportCancelled) {
        return;
      }

      // Render one initial frame before recording begins.
      drawExportFrame(
        ctx,
        canvas,
        videoElement,
        rotation,
        flipH,
        flipV,
        masks,
        getActiveCaption,
      );

      recorder.start(Math.max(50, 1000 / targetRecordingFrameRate));

      await videoElement.play();

      syncPlaybackUI();
    } catch (error) {
      console.error('Could not start video rendering:', error);

      exportCancelled = true;

      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        isRendering = false;

        canvasStream.getTracks().forEach((track) => track.stop());

        renderToolControls();
      }

      alert('Could not start video playback for rendering.');

      return;
    }

    const renderLoop = () => {
      if (!isRendering || exportCancelled) return;

      if (videoElement.readyState >= 2) {
        drawExportFrame(
          ctx,
          canvas,
          videoElement,
          rotation,
          flipH,
          flipV,
          masks,
          getActiveCaption,
        );
      }

      const totalRange = Math.max(
        0.01,
        trimEnd - trimStart,
      );

      const progress =
        ((videoElement.currentTime - trimStart) / totalRange) *
        100;

      updateRenderProgressUI(progress);

      if (
        videoElement.currentTime >= trimEnd ||
        videoElement.ended
      ) {
        videoElement.pause();

        if (recorder.state !== 'inactive') {
          recorder.stop();
        }

        syncPlaybackUI();

        return;
      }

      renderAnimationFrame =
        requestAnimationFrame(renderLoop);
    };

    renderAnimationFrame =
      requestAnimationFrame(renderLoop);
  }

  function seekVideoTo(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const target = clampValue(seconds, 0, duration);

      if (Math.abs(videoElement.currentTime - target) < 0.01) {
        resolve();
        return;
      }

      const handleSeeked = () => resolve();

      videoElement.addEventListener(
        'seeked',
        handleSeeked,
        { once: true },
      );

      videoElement.currentTime = target;
    });
  }

  function cancelVideoExport() {
    if (!isRendering) return;

    exportCancelled = true;

    isRendering = false;

    if (renderAnimationFrame) {
      cancelAnimationFrame(renderAnimationFrame);
      renderAnimationFrame = 0;
    }

    videoElement.pause();

    if (
      mediaRecorder &&
      mediaRecorder.state !== 'inactive'
    ) {
      mediaRecorder.stop();
    } else {
      renderChunks = [];
      renderProgress = 0;
      exportCancelled = false;
      renderToolControls();
    }

    syncPlaybackUI();
  }

  // ============================================================
  // 21. EDITOR RESET
  // ============================================================

  function resetEditor() {
    videoElement.pause();

    syncPlaybackUI();

    trimStart = 0;
    trimEnd = duration || 0;

    playbackRate = 1;
    videoElement.playbackRate = 1;

    volume = 1;
    videoElement.volume = 1;

    volumeSlider.value = 've-1';

    aspectRatio = '16:9';

    rotation = 0;
    flipH = false;
    flipV = false;

    previewQuality = '1';

    viewportZoom.zoomLevel = 1;
    viewportZoom.panX = 0;
    viewportZoom.panY = 0;

    captionText = '';
    captionSegments = [];
    audioTracks = [];
    captionTracks = [
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        label: 'Primary Captions',
        color: '#a78bfa',
        enabled: true,
        segments: [],
      },
    ];
    activeCaptionTrackId = captionTracks[0].id;

    captionSize = DEFAULT_CAPTION_STYLE.size;
    captionWeight = DEFAULT_CAPTION_STYLE.weight;
    captionBg = DEFAULT_CAPTION_STYLE.background;
    captionShadow = DEFAULT_CAPTION_STYLE.shadow;
    captionX = DEFAULT_CAPTION_STYLE.x;
    captionY = DEFAULT_CAPTION_STYLE.y;

    activeTransition = 'crossfade';

    activeBlendMode = 'screen';

    masks = [];
    pendingMask = null;

    playbackCurve = structuredClone(
      DEFAULT_PLAYBACK_CURVE,
    );

    cubeLut = null;

    Object.assign(filters, DEFAULT_FILTERS);

    clipSegments = duration
      ? [
          {
            id: 1,
            start: 0,
            end: duration,
            label: 'Main Clip',
          },
        ]
      : [];

    if (videoElement.src) {
      videoElement.currentTime = 0;
    }

    setAspectRatio('16:9');

    updateTransforms();
    updateCaptions();
    updateTrimMarkers();
    applyMaskOverlay();
    applyVideoFilters();

    pushState();

    renderToolControls();
  }

  // ============================================================
  // 22. MAIN EDITOR UI
  // ============================================================

  const fileInput = input({
    type: 'file',
    accept: 'video/*',
    className: 've-sr-only',
    onchange: handleVideoUpload,
  });

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
        d: 'M15 10l4.553-2.276A1 ve-1 0 0121 8.618v6.764a1 ve-1 0 01-1.447.894L15 14M5 18h8a2 ve-2 0 002-2V8a2 ve-2 0 00-2-2H5a2 ve-2 0 00-2 2v8a2 ve-2 0 002 2z',
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

    history = [];
    historyIndex = -1;

    setVideoFile(file);
  };

  const quickActions = div(
    {
      className:
        've-flex ve-flex-wrap ve-justify-end ve-gap-2 ve-sm:gap-3 ve-items-center',
    },

    div(
      {
        className: 've-flex ve-items-center ve-gap-1.5 ve-mr-2',
      },

      button(
        {
          type: 'button',
          className:
            've-p-2 ve-rounded-xl ve-bg-slate-800/80 ve-hover:bg-slate-700 ve-text-slate-300 ve-hover:text-white ve-border ve-border-slate-700 ve-text-xs ve-font-bold ve-transition-all',
          title: 'Undo (Ctrl+Z)',
          onclick: undo,
        },
        '↶',
      ),

      button(
        {
          type: 'button',
          className:
            've-p-2 ve-rounded-xl ve-bg-slate-800/80 ve-hover:bg-slate-700 ve-text-slate-300 ve-hover:text-white ve-border ve-border-slate-700 ve-text-xs ve-font-bold ve-transition-all',
          title: 'Redo (Ctrl+Y)',
          onclick: redo,
        },
        '↷',
      ),
    ),

    interactionToggleButton,

    label(
      {
        className:
          've-cursor-pointer ve-inline-flex ve-items-center ve-justify-center ve-rounded-xl ve-bg-slate-800/80 ve-px-4 ve-py-2 ve-text-xs ve-font-semibold ve-text-slate-200 ve-transition-all ve-hover:bg-slate-700 ve-hover:text-white ve-border ve-border-slate-700/60',
      },

      'Import Video',

      fileInput,
    ),

    button(
      {
        type: 'button',
        className:
          've-rounded-xl ve-border ve-border-amber-500/40 ve-bg-amber-500/10 ve-px-3 ve-py-2 ve-text-[10px] ve-font-bold ve-uppercase ve-tracking-[0.18em] ve-text-amber-200 ve-transition ve-hover:border-amber-400 ve-hover:bg-amber-500/20',
        onclick: flushVideoSession,
      },
      'Flush All',
    ),

    createButton(
      'primary',
      {
        type: 'button',
        className:
          've-bg-violet-600 ve-hover:bg-violet-500 ve-text-white ve-font-semibold ve-text-xs ve-px-4 ve-py-2 ve-rounded-xl ve-shadow-lg ve-shadow-violet-600/20',
        onclick: () => switchTab('export'),
      },
      'Render Video',
    ),
  );

  const toolContainer = div({
    className: 've-space-y-4',
  });

  const tabs: { id: VideoTab; label: string }[] = [
    { id: 'timeline', label: 'TRIM' },
    { id: 'filters', label: 'FILTERS' },
    { id: 'transform', label: 'CANVAS' },
    { id: 'audio', label: 'AUDIO' },
    { id: 'captions', label: 'TEXT' },
    { id: 'export', label: 'EXPORT' },
  ];

  const sidePanelNav = createEditorTabNav(
    tabs,
    activeTab,
    (tabId) => switchTab(tabId),
    {
      activeClassName:
        'border-slate-100/20 ve-bg-slate-900/60 ve-text-slate-50 ve-shadow-inner',

      inactiveClassName:
        've-border-transparent ve-bg-transparent ve-text-slate-300 ve-hover:text-white ve-hover:bg-white/5',

      containerClassName:
        've-editor-tablist ve-flex ve-w-full ve-gap-1.5 ve-overflow-x-auto ve-border-b ve-border-slate-700/70 bg-slate-900/25 ve-px-2 ve-pb-2 ve-pt-1 ve-sm:gap-2 ve-sm:px-4',
    },
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
      className:
        've-w-full ve-shrink-0 ve-rounded-[18px] ve-border ve-border-white/5 ve-bg-[#2c3e50]/70 ve-p-4 ve-md:w-[310px] ve-flex ve-flex-col ve-justify-between ve-overflow-y-auto ve-max-h-[540px]',
    },
    toolContainer,
  );

  const timelineContainer = div(
    {
      className:
        've-h-48 ve-shrink-0 ve-flex ve-flex-col ve-border-t ve-border-slate-700/50 ve-bg-slate-900/80 ve-overflow-hidden ve-rounded-xl',
    },

    timelineRuler,

    timelineTrackArea,
  );

  const zoomInButton = button(
    {
      type: 'button',
      className:
        've-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/90 ve-text-lg ve-font-bold ve-text-slate-100 ve-shadow-lg ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300',
      title: 'Zoom in',
      onclick: () => zoomViewport(1.15),
    },
    '+',
  );

  const zoomOutButton = button(
    {
      type: 'button',
      className:
        've-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/90 ve-text-lg ve-font-bold ve-text-slate-100 ve-shadow-lg ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300',
      title: 'Zoom out',
      onclick: () => zoomViewport(1 / 1.15),
    },
    '−',
  );

  const resetZoomButton = button(
    {
      type: 'button',
      className:
        've-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/90 ve-text-xs ve-font-bold ve-uppercase ve-tracking-wider ve-text-slate-200 ve-shadow-lg ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300',
      title: 'Reset zoom',
      onclick: () => {
        viewportZoom.zoomLevel = 1;
        viewportZoom.panX = 0;
        viewportZoom.panY = 0;

        applyVideoFilters();
      },
    },
    '1:1',
  );

  const zoomControls = div(
    {
      className:
        've-absolute ve-bottom-4 ve-right-4 ve-z-30 ve-flex ve-flex-col ve-gap-2',
    },

    zoomInButton,
    zoomOutButton,
    resetZoomButton,
  );

  const stage = div(
    {
      className:
        've-relative ve-flex ve-flex-1 ve-flex-col ve-overflow-y-auto ve-overflow-x-hidden ve-rounded-[18px] ve-border ve-border-slate-700/40 ve-bg-[#2c3e50] ve-p-3 ve-min-h-0 ve-sm:p-4',
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
      className:
        've-flex ve-flex-col ve-gap-4 ve-p-4 ve-sm:flex-row ve-sm:gap-5',
    },

    sidePanel,
    stage,
  );

  // ============================================================
  // 23. EDITOR SHELL AND FULLSCREEN
  // ============================================================

  const modalFooter = createEditorFooter(
    resetEditor,
    startVideoExport,
  );

  const {
    root,
    modal,
    fullscreenButton,
  } = createEditorShell({
    title: 'Video Studio Pro',

    nav: editorTopBar,

    workspace,

    footer: modalFooter,

    onReset: resetEditor,

    onToggleFullscreen: () => undefined,

    rootClassName:
      've-min-h-screen ve-p-2 ve-sm:p-8 ve-lg:p-10 ve-flex ve-items-center ve-justify-center',

    modalClassName:
      've-editor-surface ve-w-full ve-max-w-[1020px] ve-rounded-[28px] ve-border ve-border-slate-700/70 ve-bg-[#34495e] ve-shadow-[0_25px_60px_rgba(15,23,42,0.3)] ve-overflow-x-hidden ve-overflow-y-auto ve-flex ve-flex-col',
  });

  const {
    toggleFullscreen,
    refreshFullscreenButton,
  } = bindEditorFullscreenButton({
    modal,
    fullscreenButton,
  });

  fullscreenButton.onclick = toggleFullscreen;

  const syncFullscreenLayout = () => {
    const isFullscreen =
      document.fullscreenElement === modal;

    modal.style.maxWidth =
      isFullscreen ? '100vw' : '';

    modal.style.width =
      isFullscreen ? '100vw' : '';

    modal.style.height =
      isFullscreen ? '100vh' : '';

    modal.style.borderRadius =
      isFullscreen ? '0' : '';

    sidePanel.style.minHeight =
      isFullscreen ? '0' : '';

    sidePanel.style.height =
      isFullscreen ? 'calc(100vh - 180px)' : '';

    sidePanel.style.maxHeight =
      isFullscreen ? 'calc(100vh - 180px)' : '540px';

    sidePanel.style.overflowY = 'auto';
    sidePanel.style.overflowX = 've-hidden';

    stage.style.minHeight =
      isFullscreen ? 'calc(100vh - 180px)' : '';

    stage.style.height =
      isFullscreen ? 'calc(100vh - 180px)' : '';

    stage.style.maxHeight =
      isFullscreen ? 'calc(100vh - 180px)' : '';

    stage.style.overflowY = 'auto';
    stage.style.overflowX = 've-hidden';

    videoContainer.style.minHeight =
      isFullscreen ? 'min(68vh, 70vh)' : '';

    videoContainer.style.height =
      isFullscreen ? 'calc(100vh - 235px)' : '';

    videoContainer.style.maxHeight =
      isFullscreen ? '100%' : '';

    videoContainer.style.width =
      isFullscreen ? '100%' : '';

    videoContainer.style.overflow = 've-hidden';

    if (isFullscreen) {
      videoElement.style.maxWidth = '100%';
      videoElement.style.maxHeight = '100%';
      videoElement.style.width = 'auto';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'contain';
      videoElement.style.margin = '0 auto';
      videoElement.style.display = 've-block';
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
    refreshFullscreenButton();
    syncFullscreenLayout();
  };

  document.addEventListener(
    'fullscreenchange',
    updateFullscreenButton,
  );

  updateFullscreenButton();

  // ============================================================
  // 24. KEYBOARD SHORTCUTS
  // ============================================================

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;

    const tagName = target?.tagName?.toLowerCase();

    if (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target?.isContentEditable
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if (
      (event.ctrlKey || event.metaKey) &&
      key === 'z'
    ) {
      event.preventDefault();

      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }

      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      key === 'y'
    ) {
      event.preventDefault();
      redo();
      return;
    }

    if (!interactionModeEnabled) return;

    if (event.code === 'Space') {
      event.preventDefault();
      togglePlay();
    } else if (key === '+' || key === '=') {
      event.preventDefault();
      zoomViewport(1.15);
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      zoomViewport(1 / 1.15);
    } else if (key === 'r') {
      event.preventDefault();

      rotation = (rotation + 90) % 360;

      updateTransforms();
      pushState();
    } else if (key === 'h') {
      event.preventDefault();

      flipH = !flipH;

      updateTransforms();
      pushState();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();

      if (duration) {
        videoElement.currentTime = Math.min(
          duration,
          videoElement.currentTime + 5,
        );
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();

      if (duration) {
        videoElement.currentTime = Math.max(
          0,
          videoElement.currentTime - 5,
        );
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  // ============================================================
  // 25. REUSABLE UI CONTROLS
  // ============================================================

  function createSliderControl(
    title: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
  ) {
    const valueDisplay = div(
      {
        className:
          've-text-xs ve-font-mono ve-text-violet-400 ve-font-bold',
      },
      Number(value).toFixed(1),
    );

    const slider = input({
      type: 'range',
      min: String(min),
      max: String(max),
      value: String(value),
      step: '0.1',

      className:
        've-w-full ve-h-1.5 ve-bg-slate-800 ve-rounded-lg ve-appearance-none ve-cursor-pointer ve-accent-violet-500',

      oninput: (event: Event) => {
        const value = Number(
          (event.target as HTMLInputElement).value,
        );

        valueDisplay.textContent = value.toFixed(1);

        onChange(value);
      },

      onchange: () => {
        pushState();
      },
    });

    return div(
      {
        className: 've-space-y-1',
      },

      div(
        {
          className:
            've-flex ve-justify-between ve-items-center',
        },

        label(
          {
            className:
              've-text-xs ve-font-medium ve-text-slate-300',
          },
          title,
        ),

        valueDisplay,
      ),

      slider,
    );
  }

  function createSelectDropdown(
    options: string[],
    selected: string,
    onChange: (value: string) => void,
  ) {
    const select = document.createElement('select');

    select.className =
      've-bg-slate-950 ve-border ve-border-slate-700 ve-text-white ve-rounded-lg ve-px-2 ve-py-1 ve-text-xs ve-focus:outline-none ve-focus:border-violet-500';

    options.forEach((option) => {
      const element = document.createElement('option');

      element.value = option;
      element.textContent = option.toUpperCase();
      element.selected = option === selected;

      select.append(element);
    });

    select.onchange = () => {
      onChange(select.value);
    };

    return select;
  }

  function createPresetButton(
    name: string,
    onClick: () => void,
  ) {
    return button(
      {
        type: 'button',

        className:
          've-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/80 ve-p-3 ve-text-left ve-text-xs ve-font-medium ve-text-slate-200 ve-hover:border-violet-500 ve-hover:text-white ve-transition-all ve-shadow-sm',

        onclick: onClick,
      },

      name,
    );
  }

  function createThumbnailPresetCard(
    name: string,
    presetValues: Partial<VideoFilters>,
    icon: string,
  ) {
    const card = div(
      {
        className:
          've-flex ve-flex-col ve-items-center ve-justify-center ve-p-3 ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/70 ve-hover:border-violet-500 hover:bg-slate-900 ve-cursor-pointer ve-transition-all ve-shadow-sm ve-text-center ve-group',
      },

      div(
        {
          className:
            've-text-2xl ve-mb-1 ve-group-hover:scale-110 ve-transition-transform',
        },
        icon,
      ),

      p(
        {
          className:
            've-text-xs ve-font-semibold ve-text-slate-200',
        },
        name,
      ),
    );

    card.onclick = () => {
      Object.assign(filters, presetValues);

      applyVideoFilters();
      pushState();
      renderToolControls();
    };

    return card;
  }

  function setAspectRatio(
    ratio: VideoEditorState['aspectRatio'],
  ) {
    aspectRatio = ratio;

    const ratios: Record<
      VideoEditorState['aspectRatio'],
      string
    > = {
      '16:9': '16 / ve-9',
      '9:16': 've-9 / 16',
      '1:1': 've-1 / ve-1',
      '4:5': 've-4 / ve-5',
    };

    videoElement.style.aspectRatio = ratios[ratio];
  }

  function switchTab(tab: VideoTab) {
    activeTab = tab;

    sidePanelNav
      .querySelectorAll('button')
      .forEach((element, index) => {
        const isSelected = tabs[index]?.id === tab;

        element.className =
          `inline-flex min-w-[70px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[90px] sm:px-3 sm:text-[11px] ${
            isSelected
              ? 'border-slate-100/20 ve-bg-slate-900/60 ve-text-slate-50 ve-shadow-inner'
              : 've-border-transparent ve-bg-transparent ve-text-slate-300 ve-hover:text-slate-100'
          }`;
      });

    renderToolControls();
  }

  // ============================================================
  // 26. DYNAMIC INSPECTOR PANELS
  // ============================================================

  function renderTimelineTab() {
    toolContainer.append(
      p(
        {
          className:
            've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
        },
        'Timeline Trim & Speed',
      ),

      createSliderControl(
        'Start Marker (s)',
        trimStart,
        0,
        Math.max(1, duration),
        (value) => {
          trimStart = Math.min(value, (trimEnd || duration) - 0.5);
          trimStart = Math.max(0, trimStart);
          updateTrimMarkers();

          if (videoElement.currentTime < trimStart) {
            videoElement.currentTime = trimStart;
          }
        },
      ),

      createSliderControl(
        'End Marker (s)',
        trimEnd || duration,
        0,
        Math.max(1, duration),
        (value) => {
          trimEnd = Math.max(value, trimStart + 0.5);
          trimEnd = Math.min(duration || trimEnd, trimEnd);
          updateTrimMarkers();
        },
      ),

      p(
        {
          className: 've-mt-3 ve-text-xs ve-font-semibold ve-text-slate-300',
        },
        `Playback Speed: ${playbackRate.toFixed(2)}x`,
      ),

      renderPlaybackCurveEditor(),

      div(
        {
          className: 've-pt-2 ve-grid ve-grid-cols-2 ve-gap-2.5',
        },
        createPresetButton('Set Start Here', () => {
          trimStart = clampValue(videoElement.currentTime, 0, duration);

          if (trimStart >= trimEnd) {
            trimStart = Math.max(0, trimEnd - 0.5);
          }

          updateTrimMarkers();
          pushState();
          renderToolControls();
        }),
        createPresetButton('Set End Here', () => {
          trimEnd = clampValue(videoElement.currentTime, trimStart + 0.5, duration);
          updateTrimMarkers();
          pushState();
          renderToolControls();
        }),
      ),

      div(
        {
          className: 've-pt-2 ve-grid ve-grid-cols-2 ve-gap-2.5',
        },
        createPresetButton('Split Clip', splitClipAtPlayhead),
        createPresetButton('Delete Segment', deleteCurrentClipSegment),
      ),

      div({ className: 've-pt-2' },
        div(
          {
            className: 've-flex ve-justify-between ve-items-center ve-text-xs',
          },
          span({ className: 've-text-slate-400' }, 'Transition'),
          createSelectDropdown(
            ['none', 'crossfade', 'dip-to-black', 'wipe', 'slide'],
            activeTransition,
            (value) => {
              activeTransition = value as ClipTransition;
              pushState();
            },
          ),
        ),
      ),

      p(
        {
          className: 've-mt-2 ve-text-[10px] ve-text-slate-500 ve-leading-relaxed',
        },
        'Clip splitting currently stores timeline segment metadata. True multi-clip concatenation and ripple rendering require a multi-source export pipeline.',
      ),
    );
  }

  function renderFiltersTab() {
    const presetGrid = div(
      {
        className: 've-grid ve-grid-cols-2 ve-gap-3 ve-mb-4',
      },
      createThumbnailPresetCard('Normal', DEFAULT_FILTERS, '✨'),
      createThumbnailPresetCard('Cinematic', {
        exposure: 105,
        brightness: 90,
        contrast: 130,
        saturate: 115,
        temperature: -10,
        tint: 5,
        highlights: 90,
        shadows: 110,
        blur: 0,
        sharpen: 10,
        grayscale: 0,
        sepia: 0,
        vignette: 20,
        filmGrain: 15,
        fade: 5,
      }, '🎬'),
      createThumbnailPresetCard('Mono Noir', {
        exposure: 100,
        brightness: 105,
        contrast: 140,
        saturate: 0,
        temperature: 0,
        tint: 0,
        highlights: 100,
        shadows: 90,
        blur: 0,
        sharpen: 15,
        grayscale: 100,
        sepia: 0,
        vignette: 30,
        filmGrain: 25,
        fade: 10,
      }, '🎞️'),
      createThumbnailPresetCard('Warm Vintage', {
        exposure: 100,
        brightness: 105,
        contrast: 105,
        saturate: 120,
        temperature: 25,
        tint: 10,
        highlights: 105,
        shadows: 95,
        blur: 0,
        sharpen: 0,
        grayscale: 0,
        sepia: 25,
        vignette: 25,
        filmGrain: 20,
        fade: 15,
      }, '🌅'),
    );

    toolContainer.append(
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2' }, 'One-Click Filter Presets'),
      presetGrid,
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2 ve-mt-4' }, 'Basic Adjustments'),
      createSliderControl('Exposure', filters.exposure, 0, 200, (value) => { filters.exposure = value; applyVideoFilters(); }),
      createSliderControl('Brightness', filters.brightness, 0, 200, (value) => { filters.brightness = value; applyVideoFilters(); }),
      createSliderControl('Contrast', filters.contrast, 0, 200, (value) => { filters.contrast = value; applyVideoFilters(); }),
      createSliderControl('Saturation', filters.saturate, 0, 200, (value) => { filters.saturate = value; applyVideoFilters(); }),
      createSliderControl('Temperature', filters.temperature, -50, 50, (value) => { filters.temperature = value; applyVideoFilters(); }),
      createSliderControl('Tint', filters.tint, -50, 50, (value) => { filters.tint = value; applyVideoFilters(); }),
      createSliderControl('Highlights', filters.highlights, 0, 200, (value) => { filters.highlights = value; applyVideoFilters(); }),
      createSliderControl('Shadows', filters.shadows, 0, 200, (value) => { filters.shadows = value; applyVideoFilters(); }),
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2 ve-mt-4' }, 'Creative Effects'),
      createSliderControl('Blur (px)', filters.blur, 0, 20, (value) => { filters.blur = value; applyVideoFilters(); }),
      createSliderControl('Sharpen', filters.sharpen, 0, 100, (value) => { filters.sharpen = value; applyVideoFilters(); }),
      createSliderControl('Grayscale (%)', filters.grayscale, 0, 100, (value) => { filters.grayscale = value; applyVideoFilters(); }),
      createSliderControl('Sepia (%)', filters.sepia, 0, 100, (value) => { filters.sepia = value; applyVideoFilters(); }),
      createSliderControl('Vignette', filters.vignette, 0, 100, (value) => { filters.vignette = value; applyVideoFilters(); }),
      createSliderControl('Film Grain', filters.filmGrain, 0, 100, (value) => { filters.filmGrain = value; applyVideoFilters(); }),
      createSliderControl('Fade', filters.fade, 0, 100, (value) => { filters.fade = value; applyVideoFilters(); }),
      p({ className: 've-mt-2 ve-text-[10px] ve-text-slate-500' }, 'Some creative effects are stored as settings but need dedicated shader or canvas implementations for accurate rendering.'),
    );
  }

  function renderTransformTab() {
    const ratioGrid = div(
      { className: 've-grid ve-grid-cols-2 ve-gap-2.5' },
      createPresetButton('16:9 Widescreen', () => { setAspectRatio('16:9'); pushState(); }),
      createPresetButton('9:16 Vertical / Reels', () => { setAspectRatio('9:16'); pushState(); }),
      createPresetButton('1:1 Square', () => { setAspectRatio('1:1'); pushState(); }),
      createPresetButton('4:5 Social Feed', () => { setAspectRatio('4:5'); pushState(); }),
    );

    const transformGrid = div(
      { className: 've-grid ve-grid-cols-2 ve-gap-2.5 ve-mt-3' },
      createPresetButton('Rotate 90°', () => { rotation = (rotation + 90) % 360; updateTransforms(); pushState(); }),
      createPresetButton('Flip Horizontal', () => { flipH = !flipH; updateTransforms(); pushState(); }),
      createPresetButton('Flip Vertical', () => { flipV = !flipV; updateTransforms(); pushState(); }),
      createPresetButton('Reset Transforms', () => { rotation = 0; flipH = false; flipV = false; updateTransforms(); pushState(); }),
    );

    const maskToolGrid = div(
      { className: 've-grid ve-grid-cols-3 ve-gap-2 ve-mt-2' },
      createPresetButton('Circle', () => { activeMaskTool = 'circle'; }),
      createPresetButton('Rectangle', () => { activeMaskTool = 'rect'; }),
      createPresetButton('Freehand', () => { activeMaskTool = 'freehand'; }),
    );

    const lutUploadButton = createPresetButton('Import .cube LUT', () => {
      const filePicker = document.createElement('input');
      filePicker.type = 'file';
      filePicker.accept = '.cube,text/plain';
      filePicker.onchange = async () => {
        const file = filePicker.files?.[0];
        if (!file) return;
        const parsed = parseCubeLut(await file.text());
        if (!parsed) {
          alert('Could not parse a valid 3D LUT. Check the .cube file size and RGB data.');
          return;
        }
        cubeLut = parsed;
        pushState();
        renderToolControls();
      };
      filePicker.click();
    });

    toolContainer.append(
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2' }, 'Aspect Ratio Presets'),
      ratioGrid,
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2 ve-mt-4' }, 'Rotation & Mirroring'),
      transformGrid,
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2 ve-mt-4' }, 'Shape Masks'),
      maskToolGrid,
      div({ className: 've-grid ve-grid-cols-2 ve-gap-2 ve-pt-2' },
        createPresetButton('Add Mask', () => {
          const maskId = Date.now() + Math.floor(Math.random() * 1000);
          const newMask: MaskItem = { id: maskId, type: activeMaskTool, x: 50, y: 50, width: 45, height: 45, radius: 28, feather: 14, opacity: 0.45, blur: 0, color: '#a78bfa', points: [{ x: 25, y: 20 }, { x: 72, y: 20 }, { x: 72, y: 72 }, { x: 25, y: 72 }] };
          masks.push(newMask);
          pendingMask = null;
          applyMaskOverlay();
          pushState();
        }),
        createPresetButton('Clear Masks', () => {
          masks = [];
          pendingMask = null;
          applyMaskOverlay();
          pushState();
        }),
      ),
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2 ve-mt-4' }, '3D LUT Grade'),
      lutUploadButton,
      cubeLut ? div({ className: 've-mt-2 ve-text-[10px] ve-text-slate-300' }, `Loaded LUT: ${cubeLut.size}³`) : div({ className: 've-mt-2 ve-text-[10px] ve-text-slate-500' }, 'No LUT loaded'),
      p({ className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2 ve-mt-4' }, 'Preview Quality'),
      div({ className: 've-grid ve-grid-cols-3 ve-gap-2' },
        createPresetButton('Full 100%', () => { previewQuality = '1'; pushState(); }),
        createPresetButton('Half 50%', () => { previewQuality = '0.5'; pushState(); }),
        createPresetButton('Quarter 25%', () => { previewQuality = '0.25'; pushState(); }),
      ),
      p({ className: 've-text-[10px] ve-text-slate-500 ve-mt-2' }, 'LUTs and preview quality are saved in the project. Actual LUT color processing and reduced-resolution decoding need a dedicated preview renderer.'),
    );
  }

  function renderToolControls() {
    toolContainer.replaceChildren();
    renderTimelineRows();

    renderProgressLabel = null;
    renderProgressFill = null;

    if (activeTab === 'timeline') {
      renderTimelineTab();
    }

    // ----------------------------------------------------------
    // FILTERS
    // ----------------------------------------------------------

    else if (activeTab === 'filters') {
      renderFiltersTab();
    }

    // ----------------------------------------------------------
    // TRANSFORM
    // ----------------------------------------------------------

    else if (activeTab === 'transform') {
      renderTransformTab();
    }

    // ----------------------------------------------------------
    // AUDIO
    // ----------------------------------------------------------

    else if (activeTab === 'audio') {
      const addAudioTrack = () => {
        const input = document.createElement('input');

        input.type = 'file';
        input.accept = 'audio/*,video/*';

        input.onchange = async () => {
          const file = input.files?.[0];

          if (!file) return;

          const dataUrl = await fileToDataUrl(file);

          audioTracks.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            label: file.name.replace(/\.[^.]+$/, ''),
            fileName: file.name,
            dataUrl,
            volume: 1,
            trimStart: 0,
            trimEnd: duration || 0,
            enabled: true,
          });

          pushState();
          renderToolControls();
        };

        input.click();
      };

      const trackList = div(
        {
          className: 've-space-y-2 ve-pt-3',
        },
        ...audioTracks.map((track) => {
          return div(
            {
              className:
                've-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-950/80 ve-p-2 ve-space-y-2',
            },
            div(
              {
                className:
                  've-flex ve-items-center ve-justify-between ve-gap-2 ve-text-[11px] ve-text-slate-200',
              },
              span({ className: 've-truncate ve-max-w-[60%]' }, track.label),
              button(
                {
                  type: 'button',
                  className:
                    've-rounded-lg ve-border ve-border-slate-600 ve-px-2 ve-py-1 ve-text-[10px] ve-uppercase ve-tracking-wide ve-text-slate-300 ve-hover:text-white',
                  onclick: () => {
                    audioTracks = audioTracks.filter(
                      (item) => item.id !== track.id,
                    );
                    pushState();
                    renderToolControls();
                  },
                },
                'Remove',
              ),
            ),
            createSliderControl(
              'Level (%)',
              track.volume * 100,
              0,
              200,
              (value) => {
                track.volume = clampValue(value / 100, 0, 2);
                pushState();
              },
            ),
          );
        }),
      );

      toolContainer.append(
        p(
          {
            className:
              've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
          },
          'Master Audio Controls',
        ),

        createSliderControl(
          'Volume (%)',
          volume * 100,
          0,
          100,

          (value) => {
            volume = value / 100;

            videoElement.volume = volume;

            volumeSlider.value = String(volume);
          },
        ),

        div(
          {
            className:
              've-pt-2 ve-grid ve-grid-cols-2 ve-gap-2.5',
          },

          createPresetButton(
            'Mute Audio',
            () => {
              volume = 0;

              videoElement.volume = 0;

              volumeSlider.value = '0';

              pushState();
              renderToolControls();
            },
          ),

          createPresetButton(
            'Full Volume',
            () => {
              volume = 1;

              videoElement.volume = 1;

              volumeSlider.value = 've-1';

              pushState();
              renderToolControls();
            },
          ),
        ),

        div(
          {
            className:
              've-mt-4 ve-border-t ve-border-slate-700/60 ve-pt-3',
          },
          p(
            {
              className:
                've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
            },
            'Audio Layers',
          ),
          createPresetButton(
            'Add Audio Track',
            addAudioTrack,
          ),
          audioTracks.length ? trackList : null,
        ),
      );
    }

    // ----------------------------------------------------------
    // CAPTIONS
    // ----------------------------------------------------------

    else if (activeTab === 'captions') {
      const captionTrackOptions = captionTracks.map((track) => track.label);
      const selectedCaptionTrack =
        captionTracks.find((track) => track.id === activeCaptionTrackId) ??
        captionTracks[0] ??
        null;

      if (!selectedCaptionTrack) {
        captionTracks = [
          {
            id: Date.now() + Math.floor(Math.random() * 1000),
            label: 'Primary Captions',
            color: '#a78bfa',
            enabled: true,
            segments: cloneCaptionSegments(captionSegments),
          },
        ];
      }

      const activeTrack =
        captionTracks.find((track) => track.id === activeCaptionTrackId) ??
        captionTracks[0];

      if (activeTrack) {
        activeCaptionTrackId = activeTrack.id;
        captionSegments = cloneCaptionSegments(activeTrack.segments);
      }

      const textInput = input({
        type: 'text',

        placeholder: 'Subtitle / caption text...',

        value: captionText,

        className:
          've-w-full ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-950 ve-px-3 ve-py-2 ve-text-sm ve-text-white ve-focus:border-violet-500 ve-focus:outline-none',

        oninput: (event: Event) => {
          captionText = (
            event.target as HTMLInputElement
          ).value;

          updateCaptions();
        },

        onchange: () => {
          syncCurrentCaptionTrack();
          pushState();
        },
      });

      const weightDropdown = createSelectDropdown(
        ['400', '500', '600', '700', '800', '900'],
        captionWeight,

        (value) => {
          captionWeight = value;

          updateCaptions();
          pushState();
        },
      );

      const backgroundDropdown = createSelectDropdown(
        [
          'transparent',
          'rgba(0,0,0,0.4)',
          'rgba(0,0,0,0.6)',
          'rgba(0,0,0,0.8)',
          'rgba(255,255,255,0.6)',
        ],

        captionBg,

        (value) => {
          captionBg = value;

          updateCaptions();
          pushState();
        },
      );

      const trackDropdown = createSelectDropdown(
        captionTrackOptions.length
          ? captionTrackOptions
          : ['Primary Captions'],
        activeTrack?.label ?? 'Primary Captions',
        (value) => {
          const chosenTrack = captionTracks.find(
            (track) => track.label === value,
          );

          if (!chosenTrack) return;

          activeCaptionTrackId = chosenTrack.id;
          captionSegments = cloneCaptionSegments(chosenTrack.segments);
          captionText = chosenTrack.segments[0]?.text ?? captionText;
          updateCaptions();
          renderToolControls();
        },
      );

      toolContainer.append(
        p(
          {
            className:
              've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
          },
          'Timed Subtitles & Overlay Text',
        ),

        div(
          {
            className: 've-space-y-4',
          },

          div(
            {
              className: 've-space-y-1',
            },
            label(
              {
                className:
                  've-block ve-text-xs ve-font-medium ve-text-slate-400 ve-mb-1',
              },
              'Active Caption Track',
            ),
            trackDropdown,
          ),

          div(
            {
              className: 've-grid ve-grid-cols-2 ve-gap-2 ve-pt-2',
            },
            createPresetButton(
              'New Track',
              () => {
                const nextId = Date.now() + Math.floor(Math.random() * 1000);
                const newTrack: CaptionTrack = {
                  id: nextId,
                  label: `Captions ${captionTracks.length + 1}`,
                  color: '#c084fc',
                  enabled: true,
                  segments: [],
                };

                captionTracks.push(newTrack);
                activeCaptionTrackId = nextId;
                captionSegments = [];
                captionText = '';
                updateCaptions();
                pushState();
                renderToolControls();
              },
            ),
            createPresetButton(
              'Remove Track',
              () => {
                if (captionTracks.length <= 1) {
                  captionSegments = [];
                  captionText = '';
                  captionTracks[0].segments = [];
                  updateCaptions();
                  pushState();
                  renderToolControls();
                  return;
                }

                captionTracks = captionTracks.filter(
                  (track) => track.id !== activeCaptionTrackId,
                );

                activeCaptionTrackId = captionTracks[0].id;
                captionSegments = cloneCaptionSegments(captionTracks[0].segments);
                captionText = captionSegments[0]?.text ?? '';
                updateCaptions();
                pushState();
                renderToolControls();
              },
            ),
          ),

          div(
            {},

            label(
              {
                className:
                  've-block ve-text-xs ve-font-medium ve-text-slate-400 ve-mb-1',
              },
              'Caption Content',
            ),

            textInput,
          ),

          createSliderControl(
            'Font Size (px)',
            captionSize,
            12,
            64,

            (value) => {
              captionSize = value;
              updateCaptions();
            },
          ),

          div(
            {
              className:
                've-space-y-1',
            },

            label(
              {
                className:
                  've-text-xs ve-font-medium ve-text-slate-400',
              },
              'Font Weight',
            ),

            weightDropdown,
          ),

          div(
            {
              className:
                've-space-y-1',
            },

            label(
              {
                className:
                  've-text-xs ve-font-medium ve-text-slate-400',
              },
              'Caption Background',
            ),

            backgroundDropdown,
          ),

          div(
            {
              className:
                've-grid ve-grid-cols-2 ve-gap-2 ve-pt-2',
            },

            createPresetButton(
              'Toggle Shadow',
              () => {
                captionShadow = !captionShadow;

                updateCaptions();
                pushState();
              },
            ),

            createPresetButton(
              'Center Position',
              () => {
                captionX = 50;
                captionY = 85;

                updateCaptions();
                pushState();
              },
            ),
          ),

          div(
            {
              className:
                've-grid ve-grid-cols-2 ve-gap-2 ve-pt-2',
            },

            createPresetButton(
              'Add Timed Cue',
              () => {
                const start = Math.max(
                  0,
                  currentTime,
                );

                const end = Math.min(
                  duration || start + 3,
                  start + 3,
                );

                if (end <= start) {
                  alert(
                    'Move the playhead earlier to create a timed cue.',
                  );

                  return;
                }

                const track = ensureCaptionTrack();
                const cue: TimedCaption = {
                  id:
                    Math.max(
                      0,
                      ...track.segments.map(
                        (segment) => segment.id,
                      ),
                    ) + 1,

                  start,
                  end,

                  text: captionText || 'New caption',

                  style: getCurrentCaptionStyle(),
                };

                track.segments.push(cue);
                track.segments.sort((a, b) => a.start - b.start);
                captionSegments = cloneCaptionSegments(track.segments);

                updateCaptions();

                pushState();
                renderToolControls();
              },
            ),

            createPresetButton(
              'Clear Cues',
              () => {
                const track = ensureCaptionTrack();
                track.segments = [];
                captionSegments = [];
                captionText = '';

                updateCaptions();

                pushState();
                renderToolControls();
              },
            ),
          ),

          div(
            {
              className:
                've-grid ve-grid-cols-2 ve-gap-2 ve-pt-2',
            },

            createPresetButton(
              'Import SRT/VTT',
              () => {
                const filePicker =
                  document.createElement('input');

                filePicker.type = 'file';
                filePicker.accept =
                  '.srt,.vtt,text/plain';

                filePicker.onchange = async () => {
                  const file = filePicker.files?.[0];

                  if (file) {
                    await importSubtitleFile(file);
                  }
                };

                filePicker.click();
              },
            ),

            createPresetButton(
              'Export .SRT',
              exportSubtitleFile,
            ),
          ),
        ),
      );
    }

    // ----------------------------------------------------------
    // EXPORT
    // ----------------------------------------------------------

    else if (activeTab === 'export') {
      const progressLabel = p(
        {
          className:
            've-text-xs ve-text-violet-300 ve-font-semibold',
        },
        isRendering
          ? `Rendering Video... ${Math.round(renderProgress)}%`
          : 'Ready to render',
      );

      const progressFill = div({
        className:
          've-bg-violet-500 ve-h-full ve-transition-all',
        style: `width:${renderProgress}%`,
      });

      renderProgressLabel = progressLabel;
      renderProgressFill = progressFill;

      const progressContainer = div(
        {
          className:
            `space-y-2 text-center ${isRendering ? '' : 've-hidden'}`,
        },

        progressLabel,

        div(
          {
            className:
              've-w-full ve-bg-slate-800 ve-h-2 ve-rounded-full ve-overflow-hidden',
          },
          progressFill,
        ),

        createButton(
          'secondary',
          {
            type: 'button',

            className:
              've-w-full ve-text-xs ve-py-2 ve-bg-red-600/80 ve-hover:bg-red-600 ve-text-white ve-font-semibold ve-rounded-xl',

            onclick: cancelVideoExport,
          },
          'Cancel Rendering',
        ),
      );

      const exportSettings = div(
        {
          className:
            've-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/80 ve-p-3 ve-text-xs ve-space-y-2.5',
        },

        div(
          {
            className:
              've-flex ve-justify-between ve-items-center',
          },

          span(
            {
              className: 've-text-slate-400',
            },
            'Resolution',
          ),

          createSelectDropdown(
            ['720p', '1080p', '4k'],
            exportResolution,

            (value) => {
              exportResolution =
                value as typeof exportResolution;

              pushState();
            },
          ),
        ),

        div(
          {
            className:
              've-flex ve-justify-between ve-items-center',
          },

          span(
            {
              className: 've-text-slate-400',
            },
            'Framerate',
          ),

          createSelectDropdown(
            ['24', '30', '60'],
            String(exportFps),

            (value) => {
              exportFps =
                Number(value) as typeof exportFps;

              pushState();
            },
          ),
        ),

        div(
          {
            className:
              've-flex ve-justify-between ve-items-center',
          },

          span(
            {
              className: 've-text-slate-400',
            },
            'Container',
          ),

          createSelectDropdown(
            ['webm', 'mp4'],
            exportFormat,

            (value) => {
              exportFormat =
                value as typeof exportFormat;

              pushState();
            },
          ),
        ),

        div(
          {
            className:
              've-flex ve-justify-between ve-items-center',
          },

          span(
            {
              className: 've-text-slate-400',
            },
            'Quality Preset',
          ),

          createSelectDropdown(
            [
              'Economy (2 Mbps)',
              'Balanced (5 Mbps)',
              'High (10 Mbps)',
            ],

            exportBitrate === 2_000_000
              ? 'Economy (2 Mbps)'
              : exportBitrate === 10_000_000
                ? 'High (10 Mbps)'
                : 'Balanced (5 Mbps)',

            (value) => {
              if (value.includes('Economy')) {
                exportBitrate = 2_000_000;
              } else if (value.includes('High')) {
                exportBitrate = 10_000_000;
              } else {
                exportBitrate = 5_000_000;
              }

              pushState();
            },
          ),
        ),

        div(
          {
            className:
              've-flex ve-justify-between ve-items-center',
          },

          span(
            {
              className: 've-text-slate-400',
            },
            'Transition',
          ),

          createSelectDropdown(
            [
              'none',
              'crossfade',
              'dip-to-black',
              'wipe',
              'slide',
            ],

            activeTransition,

            (value) => {
              activeTransition =
                value as ClipTransition;

              pushState();
            },
          ),
        ),

        div(
          {
            className:
              've-flex ve-justify-between ve-items-center',
          },

          span(
            {
              className: 've-text-slate-400',
            },
            'Blend Mode',
          ),

          createSelectDropdown(
            [
              'normal',
              'screen',
              'multiply',
              'overlay',
              'soft-light',
            ],

            activeBlendMode,

            (value) => {
              activeBlendMode =
                value as BlendMode;

              pushState();
            },
          ),
        ),

        div(
          {
            className:
              've-flex ve-justify-between ve-pt-1 ve-border-t ve-border-slate-800',
          },

          span(
            {
              className: 've-text-slate-400',
            },
            'Trim Length',
          ),

          span(
            {
              className:
                've-font-semibold ve-text-violet-300',
            },
            `${Math.max(
              0,
              (trimEnd || duration) - trimStart,
            ).toFixed(1)}s`,
          ),
        ),
      );

      toolContainer.append(
        p(
          {
            className:
              've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
          },
          'Export Engine',
        ),

        exportSettings,

        div(
          {
            className:
              've-grid ve-grid-cols-2 ve-gap-2 ve-pt-3',
          },

          createPresetButton(
            'Export JSON',
            exportProjectFile,
          ),

          createPresetButton(
            'Import JSON',
            importProjectFile,
          ),
        ),

        progressContainer,

        !isRendering
          ? createButton(
              'primary',
              {
                type: 'button',

                className:
                  've-w-full ve-text-xs ve-py-2.5 ve-bg-violet-600 ve-hover:bg-violet-500 ve-text-white ve-font-semibold ve-rounded-xl ve-transition-all ve-shadow-lg ve-shadow-violet-600/20',

                onclick: startVideoExport,
              },
              'Start Render Pipeline',
            )
          : div({ className: 've-hidden' }),

        p(
          {
            className:
              've-text-[10px] ve-text-slate-500 ve-leading-relaxed ve-mt-2',
          },
          'Browser rendering uses supported MediaRecorder codecs. MP4 is only offered when the browser genuinely supports MP4 recording. Server rendering can use FFmpeg for broader codec support.',
        ),
      );
    }

    // ----------------------------------------------------------
    // PROJECT SUMMARY
    // ----------------------------------------------------------

    toolContainer.append(
      div(
        {
          className:
            've-mt-6 ve-border-t ve-border-slate-700/60 ve-pt-4',
        },

        createDetailPanel(
          'Project Summary',

          [
            {
              label: 'Aspect Ratio',
              value: aspectRatio,
            },

            {
              label: 'Active Region',

              value: duration
                ? `${trimStart.toFixed(1)}s – ${trimEnd.toFixed(1)}s`
                : '—',
            },

            {
              label: 'Clip Segments',
              value: String(clipSegments.length),
            },

            {
              label: 'Caption Cues',
              value: String(captionSegments.length),
            },

            {
              label: 'History Stack',
              value: `${historyIndex + 1} / ${history.length}`,
            },

            {
              label: 'Render Status',
              value: isRendering ? 'Rendering' : 'Ready',
            },
          ],
        ),
      ),
    );
  }

  // ============================================================
  // 27. INITIALIZATION
  // ============================================================

  renderToolControls();

  // Restore saved state after the entire UI and video element
  // have been initialized.
  void hydrateProjectState();

  return root;
}

export interface ExportStatusResponse {
  ok: boolean;
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message: string;
  fileName: string;
  progress: number;
  output?: string;
  error?: string;
}

/**
 * Fetches the current progress and status of a server-side video export job.
 */
async function getVideoExportStatus(jobId: string): Promise<ExportStatusResponse> {
  const response = await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
    throw new Error(errorData.error || `Server returned status ${response.status}`);
  }

  return response.json();
}
