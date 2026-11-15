import '../../css/videoeditor.css';

import {
  button,
  div,
  input,
  p,
  span,
  svgElement,
} from '../components/ui/dom';

import { appStore } from '../appState';
import { downloadVideoFromServer, exportVideoWithFFmpeg } from '../api';

import {
  createDetailPanel,
  createEditorTabNav,
} from './shared';
import {
  DEFAULT_CAPTION_STYLE,
  DEFAULT_FILTERS,
  DEFAULT_PLAYBACK_CURVE,
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
  type VideoEditorState,
  type VideoFilters,
  type VideoTab,
} from './video-editor/types';
import { createVideoStageElements } from './video-editor/dom';
import { buildSrtFromSegments, parseSrtText } from './video-editor/captions';
import { fileToDataUrl } from './video-editor/storage';
import {
  drawExportFrame,
  getExportDimensions,
  getSupportedRecorderMimeType,
} from './video-editor/rendering';
import {
  clampValue,
  cloneCaptionSegments,
  cloneMasks,
  cubicBezierValue,
  formatTime,
} from './video-editor/utils';
import {
  stepVideoFrame,
  syncPlaybackButton,
  togglePlayback,
} from './video-editor/transport';
import { createTimelinePanel } from './video-editor/timeline';
import { createExportPanel } from './video-editor/export';
import { createEditorControls } from './video-editor/controls';
import { createVideoEditorPanels } from './video-editor/panels';
import { createVideoEditorLayout } from './video-editor/layout';
import { bindEditorShortcuts } from './video-editor/shortcuts';
import { bindVideoPreviewInteraction } from './video-editor/interaction';
import {
  serializeEditorState as serializeProjectState,
} from './video-editor/project-state';
import {
  createProjectDownloadBlob,
  importEditorProjectFile,
  loadEditorProject,
  saveEditorProject,
} from './video-editor/project-io';
import { createProjectHistory } from './video-editor/history';
import {
  cancelVideoExport as cancelVideoExportController,
  flushVideoSession as flushVideoSessionController,
  resetEditor as resetEditorController,
  seekVideoTo as seekVideoToController,
} from './video-editor/media';

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

  const { zoomViewport, clampViewportZoom } = bindVideoPreviewInteraction({
    videoElement,
    videoContainer: videoContainer as HTMLDivElement,
    captionOverlay,
    interactionToggleButton,
    viewportZoom,
    getInteractionMode: () => interactionModeEnabled,
    setInteractionMode: (enabled: boolean) => {
      interactionModeEnabled = enabled;
    },
    getCaptionX: () => captionX,
    setCaptionX: (value: number) => {
      captionX = value;
    },
    getCaptionY: () => captionY,
    setCaptionY: (value: number) => {
      captionY = value;
    },
    pushState,
    applyVideoFilters,
  });

  // ============================================================
  // 3. VIDEO PREVIEW INTERACTION
  // ============================================================

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

  let projectDb: IDBDatabase | null = null;

  const projectHistory = createProjectHistory({
    createSnapshot: serializeEditorState,
    restoreSnapshot: (state: Partial<VideoEditorState>) => {
      restoreState(state);
    },
    onSnapshot: () => {
      void persistProjectState();
    },
  });

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
    return serializeProjectState({
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
      captionSegments,
      audioTracks,
      captionTracks,
      activeCaptionTrackId,
      activeTransition,
      clipSegments,
      activeBlendMode,
      masks,
      playbackCurve,
      cubeLut,
      captionSize,
      captionWeight,
      captionBg,
      captionShadow,
      captionX,
      captionY,
      filters,
    });
  }

  function pushState() {
    projectHistory.pushState();
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
    try {
      const result = await saveEditorProject({
        projectDb,
        videoFile,
        cachedVideoFile,
        cachedVideoDataUrl,
        serializer: () => serializeEditorState(),
      });

      projectDb = result.projectDb;
      cachedVideoFile = result.cachedVideoFile;
      cachedVideoDataUrl = result.cachedVideoDataUrl;
    } catch (error) {
      console.warn('Unable to save editor state:', error);
    }
  }

  async function hydrateProjectState() {
    try {
      const result = await loadEditorProject({
        projectDb,
        restoreState,
        setVideoFile,
      });

      projectDb = result.projectDb;

      if (!result.restoredState) return;

      if (result.restoredFile && result.restoredVideoDataUrl) {
        cachedVideoFile = result.restoredFile;
        cachedVideoDataUrl = result.restoredVideoDataUrl;

        setVideoFile(result.restoredFile, result.restoredState);
        return;
      }

      restoreState(result.restoredState);
    } catch (error) {
      console.warn('Unable to restore editor state:', error);
    }
  }

  function exportProjectFile() {
    const blob = createProjectDownloadBlob({
      videoFile,
      serializer: () => serializeEditorState(),
    });

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
        const state = await importEditorProjectFile(file);

        restoreState(state);

        projectHistory.resetHistory();
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
    if (projectHistory.historyIndex <= 0) return;

    projectHistory.undo();
    renderToolControls();
  }

  function redo() {
    if (projectHistory.historyIndex >= projectHistory.history.length - 1) return;

    projectHistory.redo();
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
    syncPlaybackButton(playPauseBtn, videoElement, isPlaying);
  }

  function togglePlay() {
    togglePlayback(videoElement, syncPlaybackUI);
  }

  function stepFrames(delta: number) {
    stepVideoFrame(videoElement, duration, delta);
    syncPlaybackUI();
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
    flushVideoSessionController({
      videoElement,
      videoContainer,
      videoUrl,
      setVideoUrl: (next) => {
        videoUrl = next;
      },
      setVideoFile: (next) => {
        videoFile = next;
      },
      getVideoFile: () => videoFile,
      getDuration: () => duration,
      setDuration: (next) => {
        duration = next;
      },
      setTrimStart: (next) => {
        trimStart = next;
      },
      setTrimEnd: (next) => {
        trimEnd = next;
      },
      setCurrentTime: (next) => {
        currentTime = next;
      },
      setCaptionText: (next) => {
        captionText = next;
      },
      setCaptionSegments: (next) => {
        captionSegments = next;
      },
      setAudioTracks: (next) => {
        audioTracks = next;
      },
      setCaptionTracks: (next) => {
        captionTracks = next;
      },
      setMasks: (next) => {
        masks = next;
      },
      setPendingMask: (next) => {
        pendingMask = next;
      },
      setClipSegments: (next) => {
        clipSegments = next;
      },
      setPlaybackCurve: (next) => {
        playbackCurve = next;
      },
      setCubeLut: (next) => {
        cubeLut = next;
      },
      setAspectRatio,
      setVolume: (next) => {
        volume = next;
      },
      setRenderAnimationFrame: (next) => {
        renderAnimationFrame = next;
      },
      getRenderAnimationFrame: () => renderAnimationFrame,
      setMediaRecorder: (next) => {
        mediaRecorder = next;
      },
      getMediaRecorder: () => mediaRecorder,
      setExportCancelled: (next) => {
        exportCancelled = next;
      },
      setIsRendering: (next) => {
        isRendering = next;
      },
      setRenderChunks: (next) => {
        renderChunks = next;
      },
      setRenderProgress: (next) => {
        renderProgress = next;
      },
      resetHistory: () => projectHistory.resetHistory(),
      renderToolControls,
      updateCaptions,
      updateTrimMarkers,
      applyMaskOverlay,
      applyVideoFilters,
      volumeSlider,
      getFilters: () => filters,
      setFilters: (next) => {
        Object.assign(filters, next);
      },
    });
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

      if (projectHistory.history.length === 0) {
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

  // ============================================================
  // 16. LUT IMPORT
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
    return seekVideoToController({
      videoElement,
      duration,
      seconds,
    });
  }

  function cancelVideoExport() {
    cancelVideoExportController({
      videoElement,
      getIsRendering: () => isRendering,
      setExportCancelled: (next) => {
        exportCancelled = next;
      },
      setIsRendering: (next) => {
        isRendering = next;
      },
      getRenderAnimationFrame: () => renderAnimationFrame,
      setRenderAnimationFrame: (next) => {
        renderAnimationFrame = next;
      },
      getMediaRecorder: () => mediaRecorder,
      setRenderChunks: (next) => {
        renderChunks = next;
      },
      setRenderProgress: (next) => {
        renderProgress = next;
      },
      renderToolControls,
      syncPlaybackUI,
    });
  }

  // ============================================================
  // 21. EDITOR RESET
  // ============================================================

  function resetEditor() {
    resetEditorController({
      videoElement,
      duration,
      setTrimStart: (next) => {
        trimStart = next;
      },
      setTrimEnd: (next) => {
        trimEnd = next;
      },
      setPlaybackRate: (next) => {
        playbackRate = next;
      },
      setVolume: (next) => {
        volume = next;
      },
      setAspectRatio,
      setRotation: (next) => {
        rotation = next;
      },
      setFlipH: (next) => {
        flipH = next;
      },
      setFlipV: (next) => {
        flipV = next;
      },
      setPreviewQuality: (next) => {
        previewQuality = next;
      },
      setCaptionText: (next) => {
        captionText = next;
      },
      setCaptionSegments: (next) => {
        captionSegments = next;
      },
      setAudioTracks: (next) => {
        audioTracks = next;
      },
      setCaptionTracks: (next) => {
        captionTracks = next;
      },
      setActiveCaptionTrackId: (next) => {
        activeCaptionTrackId = next;
      },
      setCaptionSize: (next) => {
        captionSize = next;
      },
      setCaptionWeight: (next) => {
        captionWeight = next;
      },
      setCaptionBg: (next) => {
        captionBg = next;
      },
      setCaptionShadow: (next) => {
        captionShadow = next;
      },
      setCaptionX: (next) => {
        captionX = next;
      },
      setCaptionY: (next) => {
        captionY = next;
      },
      setActiveTransition: (next) => {
        activeTransition = next;
      },
      setActiveBlendMode: (next) => {
        activeBlendMode = next;
      },
      setMasks: (next) => {
        masks = next;
      },
      setPendingMask: (next) => {
        pendingMask = next;
      },
      setPlaybackCurve: (next) => {
        playbackCurve = next;
      },
      setCubeLut: (next) => {
        cubeLut = next;
      },
      setFilters: (next) => {
        Object.assign(filters, next);
      },
      setClipSegments: (next) => {
        clipSegments = next;
      },
      setViewportZoom: (next) => {
        viewportZoom.zoomLevel = next.zoomLevel;
        viewportZoom.panX = next.panX;
        viewportZoom.panY = next.panY;
        viewportZoom.isDragging = next.isDragging;
        viewportZoom.startX = next.startX;
        viewportZoom.startY = next.startY;
      },
      pushState,
      renderToolControls,
      updateTransforms,
      updateCaptions,
      updateTrimMarkers,
      applyMaskOverlay,
      applyVideoFilters,
      volumeSlider,
    });
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

    projectHistory.resetHistory();

    setVideoFile(file);
  };

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

  const timelineContainer = div(
    {
      className:
        've-h-48 ve-shrink-0 ve-flex ve-flex-col ve-border-t ve-border-slate-700/50 ve-bg-slate-900/80 ve-overflow-hidden ve-rounded-xl',
    },

    timelineRuler,

    timelineTrackArea,
  );

  const { root } = createVideoEditorLayout({
    fileInput,
    interactionToggleButton,
    toolContainer,
    videoContainer,
    playerHud,
    timelineContainer,
    sidePanelNav,
    onUndo: undo,
    onRedo: redo,
    onFlushVideo: flushVideoSession,
    onRenderVideo: () => switchTab('export'),
    zoomIn: () => zoomViewport(1.15),
    zoomOut: () => zoomViewport(1 / 1.15),
    resetZoom: () => {
      viewportZoom.zoomLevel = 1;
      viewportZoom.panX = 0;
      viewportZoom.panY = 0;
      applyVideoFilters();
    },
    resetEditor,
    startVideoExport,
  });

  // ============================================================
  // 23. EDITOR SHELL AND FULLSCREEN
  // ============================================================


  // ============================================================
  // 24. KEYBOARD SHORTCUTS
  // ============================================================

  bindEditorShortcuts({
    undo,
    redo,
    togglePlay,
    zoomViewport,
    updateTransforms,
    pushState,
    duration: () => duration,
    interactionModeEnabled: () => interactionModeEnabled,
    videoElement,
    setRotation: (next) => {
      rotation = next;
    },
    rotationValue: () => rotation,
    flipHValue: () => flipH,
    setFlipH: (next) => {
      flipH = next;
    },
  });

  // ============================================================
  // 25. REUSABLE UI CONTROLS
  // ============================================================

  const {
    createSliderControl,
    createSelectDropdown,
    createPresetButton,
    createThumbnailPresetCard,
  } = createEditorControls({
    pushState,
    renderToolControls,
    applyVideoFilters,
    filters,
  });

  const editorPanels = createVideoEditorPanels({
    toolContainer,
    filters,
    volume,
    setVolume: (next) => {
      volume = next;
      videoElement.volume = volume;
      if (volumeSlider) {
        volumeSlider.value = String(volume);
      }
    },
    audioTracks,
    setAudioTracks: (next) => {
      audioTracks = next;
    },
    captionTracks,
    setCaptionTracks: (next) => {
      captionTracks = next;
    },
    captionSegments,
    setCaptionSegments: (next) => {
      captionSegments = next;
    },
    captionText,
    setCaptionText: (next) => {
      captionText = next;
    },
    activeCaptionTrackId,
    setActiveCaptionTrackId: (next) => {
      activeCaptionTrackId = next;
    },
    captionSize,
    setCaptionSize: (next) => {
      captionSize = next;
    },
    captionWeight,
    setCaptionWeight: (next) => {
      captionWeight = next;
    },
    captionBg,
    setCaptionBg: (next) => {
      captionBg = next;
    },
    captionShadow,
    setCaptionShadow: (next) => {
      captionShadow = next;
    },
    setCaptionX: (next) => {
      captionX = next;
    },
    setCaptionY: (next) => {
      captionY = next;
    },
    currentTime,
    duration,
    rotation,
    setRotation: (next) => {
      rotation = next;
    },
    flipH,
    setFlipH: (next) => {
      flipH = next;
    },
    flipV,
    setFlipV: (next) => {
      flipV = next;
    },
    setPreviewQuality: (next) => {
      previewQuality = next;
    },
    activeMaskTool,
    setActiveMaskTool: (next) => {
      activeMaskTool = next;
    },
    masks,
    setMasks: (next) => {
      masks = next;
    },
    setPendingMask: (next) => {
      pendingMask = next;
    },
    cubeLut,
    setCubeLut: (next) => {
      cubeLut = next;
    },
    setAspectRatio,
    updateTransforms,
    getCurrentCaptionStyle,
    ensureCaptionTrack,
    syncCurrentCaptionTrack,
    importSubtitleFile,
    exportSubtitleFile,
    pushState,
    renderToolControls,
    applyVideoFilters,
    applyMaskOverlay,
    updateCaptions,
    videoElement,
    volumeSlider,
    activeTransition,
    setActiveTransition: (next) => {
      activeTransition = next;
    },
    activeBlendMode,
    setActiveBlendMode: (next) => {
      activeBlendMode = next;
    },
    exportResolution,
    exportFps,
    exportFormat,
    exportBitrate,
    setExportResolution: (next) => {
      exportResolution = next;
    },
    setExportFps: (next) => {
      exportFps = next;
    },
    setExportFormat: (next) => {
      exportFormat = next;
    },
    setExportBitrate: (next) => {
      exportBitrate = next;
    },
    createSliderControl,
    createSelectDropdown,
    createPresetButton,
    createThumbnailPresetCard,
  });

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
    const timelinePanel = createTimelinePanel({
      state: {
        trimStart,
        trimEnd,
        duration,
        playbackRate,
        activeTransition,
        currentTime,
        clipSegments,
        playbackCurve,
        videoElement,
      },
      toolContainer,
      createSliderControl,
      createSelectDropdown,
      createPresetButton,
      setTrimStart: (value) => {
        trimStart = value;
      },
      setTrimEnd: (value) => {
        trimEnd = value;
      },
      setActiveTransition: (value) => {
        activeTransition = value;
      },
      setPlaybackCurve: (curve) => {
        playbackCurve = curve;
      },
      setPlaybackRate: (value) => {
        playbackRate = value;
      },
      getPlaybackRateAtTime,
      updatePlaybackRateFromCurve,
      renderToolControls,
      pushState,
      updateTrimMarkers,
      updateCaptions,
      applyVideoFilters,
      renderTimelineRows,
    });

    timelinePanel.renderTimelineTab();
  }

  function renderFiltersTab() {
    editorPanels.renderFiltersTab();
  }

  function renderTransformTab() {
    editorPanels.renderTransformTab();
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
      editorPanels.renderAudioTab();
    }

    // ----------------------------------------------------------
    // CAPTIONS
    // ----------------------------------------------------------

    else if (activeTab === 'captions') {
      editorPanels.renderCaptionsTab();
    }

    // ----------------------------------------------------------
    // EXPORT
    // ----------------------------------------------------------

    else if (activeTab === 'export') {
      const exportPanel = createExportPanel({
        toolContainer,
        renderProgress,
        isRendering,
        trimStart,
        trimEnd,
        duration,
        exportResolution,
        exportFps,
        exportFormat,
        exportBitrate,
        activeTransition,
        activeBlendMode,
        renderProgressLabel,
        renderProgressFill,
        renderToolControls,
        setExportResolution: (value) => {
          exportResolution = value;
        },
        setExportFps: (value) => {
          exportFps = value;
        },
        setExportFormat: (value) => {
          exportFormat = value;
        },
        setExportBitrate: (value) => {
          exportBitrate = value;
        },
        setActiveTransition: (value) => {
          activeTransition = value;
        },
        setActiveBlendMode: (value) => {
          activeBlendMode = value;
        },
        createSelectDropdown,
        createPresetButton,
        pushState,
        startVideoExport,
        cancelVideoExport,
        exportProjectFile,
        importProjectFile,
        aspectRatio,
      });

      renderProgressLabel = exportPanel.progressLabel;
      renderProgressFill = exportPanel.progressFill;
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
              value: `${projectHistory.historyIndex + 1} / ${projectHistory.history.length}`,
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
