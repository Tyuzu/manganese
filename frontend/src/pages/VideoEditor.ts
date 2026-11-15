import '../../css/videoeditor.css';

import {
  div,
} from '../components/ui/dom';

import {
  createDetailPanel,
} from './shared';
import {
  createTimelineTrackShell,
  createVideoEditorTabBar,
  createVideoUploadDropzone,
} from './video-editor/editor-shell';
import {
  createPlaybackControls,
  createTimelineWidgets,
} from './video-editor/player';
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
import {
  clampValue,
  cloneCaptionSegments,
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
import { createVideoExportController } from './video-editor/export-pipeline';
import { createThumbnailStripGenerator } from './video-editor/thumbnails';
import { createVideoSourceController } from './video-editor/source';
import { createEditorControls } from './video-editor/controls';
import { createVideoEditorPanels } from './video-editor/panels';
import { createVideoEditorLayout } from './video-editor/layout';
import { bindEditorShortcuts } from './video-editor/shortcuts';
import { bindVideoPreviewInteraction } from './video-editor/interaction';
import {
  applyEditorSnapshot,
  serializeEditorSnapshot,
} from './video-editor/editor-state';
import { createProjectHistory } from './video-editor/history';
import { createProjectLifecycleController } from './video-editor/project-lifecycle';
import {
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

  let isScrubbingTimeline = false;

  const {
    playheadLine,
    trimStartMarker,
    trimEndMarker,
    trimActiveZone,
    thumbnailStrip,
    videoTrackSegment,
    timelineRuler,
    timelineTrackArea,
  } = createTimelineWidgets({
    onScrubFromClientX: (clientX: number) => {
      if (!duration) return;

      const rect = timelineTrackArea.getBoundingClientRect();
      if (!rect.width) return;

      const ratio = clampValue((clientX - rect.left) / rect.width, 0, 1);
      videoElement.currentTime = ratio * duration;
      isScrubbingTimeline = true;
    },
  });

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
      void projectLifecycleController.persistProjectState();
    },
  });

  let cachedVideoFile: File | null = null;
  let cachedVideoDataUrl: string | null = null;

  const projectLifecycleController = createProjectLifecycleController({
    getProjectDb: () => projectDb,
    setProjectDb: (next) => {
      projectDb = next;
    },
    getCachedVideoFile: () => cachedVideoFile,
    setCachedVideoFile: (next) => {
      cachedVideoFile = next;
    },
    getCachedVideoDataUrl: () => cachedVideoDataUrl,
    setCachedVideoDataUrl: (next) => {
      cachedVideoDataUrl = next;
    },
    getVideoFile: () => videoFile,
    getSerializer: () => serializeEditorState(),
    restoreState,
    setVideoFile: (file, restoredState) => {
      setVideoFile(file, restoredState);
    },
    getProjectHistory: () => projectHistory,
    setActiveTab: (tab) => {
      activeTab = tab;
    },
    switchTab,
    updatePlaybackRateFromCurve,
    getVideoElementSrc: () => videoElement.src,
    renderToolControls,
  });

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
    return serializeEditorSnapshot({
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
      duration,
    });
  }

  function pushState() {
    projectHistory.pushState();
  }

  function restoreState(
    state: Partial<VideoEditorState>,
  ) {
    const next = applyEditorSnapshot(
      {
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
        duration,
      },
      state,
    );

    trimStart = next.trimStart;
    trimEnd = next.trimEnd;
    playbackRate = next.playbackRate;
    volume = next.volume;
    aspectRatio = next.aspectRatio;
    rotation = next.rotation;
    flipH = next.flipH;
    flipV = next.flipV;
    previewQuality = next.previewQuality;
    captionText = next.captionText;
    captionSegments = next.captionSegments;
    audioTracks = next.audioTracks;
    captionTracks = next.captionTracks;
    activeCaptionTrackId = next.activeCaptionTrackId;
    activeTransition = next.activeTransition;
    clipSegments = next.clipSegments;
    activeBlendMode = next.activeBlendMode;
    masks = next.masks;
    playbackCurve = next.playbackCurve;
    cubeLut = next.cubeLut;
    captionSize = next.captionSize;
    captionWeight = next.captionWeight;
    captionBg = next.captionBg;
    captionShadow = next.captionShadow;
    captionX = next.captionX;
    captionY = next.captionY;
    Object.assign(filters, next.filters);
    pendingMask = null;

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

  // ============================================================
  // 6. INDEXEDDB PROJECT STORAGE
  // ============================================================

  async function hydrateProjectState() {
    await projectLifecycleController.hydrateProjectState();
  }

  function exportProjectFile() {
    projectLifecycleController.exportProjectFile();
  }

  async function importProjectFile() {
    await projectLifecycleController.importProjectFile();
  }

  // ============================================================
  // 7. UNDO AND REDO
  // ============================================================

  function undo() {
    projectLifecycleController.undo();
  }

  function redo() {
    projectLifecycleController.redo();
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

  function seekToPercent(value: number) {
    if (!duration) return;
    videoElement.currentTime = (value / 100) * duration;
  }

  const {
    timeDisplay,
    playPauseBtn,
    seekSlider,
    volumeSlider,
    playerHud,
  } = createPlaybackControls({
    onTogglePlay: togglePlay,
    onStepFrames: stepFrames,
    onSeek: (value) => seekToPercent(value),
    onVolumeChange: (value) => {
      volume = clampValue(value, 0, 1);
      videoElement.volume = volume;
      pushState();
    },
    getVolume: () => volume,
  });

  // ============================================================
  // 13. LOAD AND RESTORE SOURCE VIDEO
  // ============================================================

  const generateThumbnailStrip = createThumbnailStripGenerator({
    thumbnailStrip,
    getVideoUrl: () => videoUrl,
    getDuration: () => duration,
  });

  const videoSourceController = createVideoSourceController({
    videoElement,
    videoContainer,
    maskOverlay,
    captionOverlay,
    seekSlider,
    playheadLine,
    getVideoUrl: () => videoUrl,
    setVideoUrl: (next) => {
      videoUrl = next;
    },
    getVideoFile: () => videoFile,
    setVideoFile: (next) => {
      videoFile = next;
    },
    getDuration: () => duration,
    setDuration: (next) => {
      duration = next;
    },
    getCurrentTime: () => currentTime,
    setCurrentTime: (next) => {
      currentTime = next;
    },
    getTrimStart: () => trimStart,
    setTrimStart: (next) => {
      trimStart = next;
    },
    getTrimEnd: () => trimEnd,
    setTrimEnd: (next) => {
      trimEnd = next;
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
    getIsRendering: () => isRendering,
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
    setViewportZoom: (next) => {
      viewportZoom.zoomLevel = next.zoomLevel;
      viewportZoom.panX = next.panX;
      viewportZoom.panY = next.panY;
      viewportZoom.isDragging = next.isDragging;
      viewportZoom.startX = next.startX;
      viewportZoom.startY = next.startY;
    },
    timeDisplay,
    formatTime,
    generateThumbnailStrip,
    syncPlaybackUI,
    updatePlaybackRateFromCurve,
    getHistoryLength: () => projectHistory.history.length,
    pushState,
    restoreState,
    setCachedVideoFile: (next) => {
      cachedVideoFile = next;
    },
    setCachedVideoDataUrl: (next) => {
      cachedVideoDataUrl = next;
    },
  });

  const flushVideoSession = () => {
    videoSourceController.flushVideoSession();
  };

  const setVideoFile = (
    file: File,
    restoredState?: Partial<VideoEditorState>,
  ) => {
    videoSourceController.setVideoFile(file, restoredState);
  };

  const handleVideoUpload = (event: Event) => {
    videoSourceController.handleVideoUpload(event);
  };

  // ============================================================
  // 14. VIDEO THUMBNAIL GENERATION
  // ============================================================

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

  function seekVideoTo(seconds: number): Promise<void> {
    return seekVideoToController({
      videoElement,
      duration,
      seconds,
    });
  }

  const videoExportController = createVideoExportController({
    videoElement,
    getVideoFile: () => videoFile,
    getVideoUrl: () => videoUrl,
    getDuration: () => duration,
    getTrimStart: () => trimStart,
    getTrimEnd: () => trimEnd,
    getExportResolution: () => exportResolution,
    getExportFps: () => exportFps,
    getExportFormat: () => exportFormat,
    getExportBitrate: () => exportBitrate,
    getAspectRatio: () => aspectRatio,
    getRotation: () => rotation,
    getFlipH: () => flipH,
    getFlipV: () => flipV,
    getPlaybackRate: () => playbackRate,
    getVolume: () => volume,
    getCaptionSegments: () => captionSegments,
    getCaptionText: () => captionText,
    getAudioTracks: () => audioTracks,
    getCaptionTracks: () => captionTracks,
    getActiveCaptionTrackId: () => activeCaptionTrackId,
    getMasks: () => masks,
    getFilters: () => filters,
    getActiveTransition: () => activeTransition,
    getActiveBlendMode: () => activeBlendMode,
    getCurrentCaption: () => getActiveCaption(),
    getIsRendering: () => isRendering,
    setIsRendering: (next) => {
      isRendering = next;
    },
    getRenderProgress: () => renderProgress,
    setRenderProgress: (next) => {
      renderProgress = next;
    },
    setRenderChunks: (next) => {
      renderChunks = next;
    },
    getRenderChunks: () => renderChunks,
    setExportCancelled: (next) => {
      exportCancelled = next;
    },
    getExportCancelled: () => exportCancelled,
    setMediaRecorder: (next) => {
      mediaRecorder = next;
    },
    getMediaRecorder: () => mediaRecorder,
    setRenderAnimationFrame: (next) => {
      renderAnimationFrame = next;
    },
    getRenderAnimationFrame: () => renderAnimationFrame,
    updateRenderProgressUI,
    renderToolControls,
    seekVideoTo,
    syncPlaybackUI,
    updatePlaybackRateFromCurve,
  });

  // ============================================================
  // 20. SERVER AND BROWSER EXPORT
  // ============================================================

  async function startVideoExport() {
    await videoExportController.startVideoExport();
  }

  function cancelVideoExport() {
    videoExportController.cancelVideoExport();
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

  const fileInput = createVideoUploadDropzone({
    videoContainer,
    onFileSelected: handleVideoUpload,
    onVideoDropped: (file) => {
      projectHistory.resetHistory();
      videoSourceController.setVideoFile(file);
    },
  }).fileInput;

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

  const sidePanelNav = createVideoEditorTabBar({
    tabs,
    activeTab,
    onTabChange: (tabId) => switchTab(tabId),
  });

  const timelineContainer = createTimelineTrackShell({
    timelineRuler,
    timelineTrackArea,
  });

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

