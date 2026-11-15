import type {
  TimedCaption,
  VideoEditorState,
  VideoFilters,
} from './types';
import { DEFAULT_FILTERS, DEFAULT_PLAYBACK_CURVE } from './types';
import { clampValue } from './utils';

export function flushVideoSession(params: {
  videoElement: HTMLVideoElement;
  videoContainer: HTMLDivElement;
  videoUrl: string | null;
  setVideoUrl: (next: string | null) => void;
  setVideoFile: (next: File | null) => void;
  getVideoFile: () => File | null;
  getDuration: () => number;
  setDuration: (next: number) => void;
  setTrimStart: (next: number) => void;
  setTrimEnd: (next: number) => void;
  setCurrentTime: (next: number) => void;
  setCaptionText: (next: string) => void;
  setCaptionSegments: (next: TimedCaption[]) => void;
  setAudioTracks: (next: any[]) => void;
  setCaptionTracks: (next: any[]) => void;
  setMasks: (next: any[]) => void;
  setPendingMask: (next: any) => void;
  setClipSegments: (next: any[]) => void;
  setPlaybackCurve: (next: VideoEditorState['playbackCurve']) => void;
  setCubeLut: (next: VideoEditorState['cubeLut']) => void;
  setAspectRatio: (ratio: VideoEditorState['aspectRatio']) => void;
  setVolume: (next: number) => void;
  setRenderAnimationFrame: (next: number) => void;
  getRenderAnimationFrame: () => number;
  setMediaRecorder: (next: MediaRecorder | null) => void;
  getMediaRecorder: () => MediaRecorder | null;
  setExportCancelled: (next: boolean) => void;
  setIsRendering: (next: boolean) => void;
  setRenderChunks: (next: Blob[]) => void;
  setRenderProgress: (next: number) => void;
  resetHistory: () => void;
  renderToolControls: () => void;
  updateCaptions: () => void;
  updateTrimMarkers: () => void;
  applyMaskOverlay: () => void;
  applyVideoFilters: () => void;
  volumeSlider: HTMLInputElement;
  getFilters: () => VideoFilters;
  setFilters: (next: VideoFilters) => void;
}) {
  if (params.getRenderAnimationFrame()) {
    cancelAnimationFrame(params.getRenderAnimationFrame());
    params.setRenderAnimationFrame(0);
  }

  const mediaRecorder = params.getMediaRecorder();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  params.setExportCancelled(true);
  params.setIsRendering(false);
  params.setRenderChunks([]);
  params.setRenderProgress(0);
  params.resetHistory();

  if (params.videoUrl) {
    URL.revokeObjectURL(params.videoUrl);
    params.setVideoUrl(null);
  }

  params.setVideoFile(null);
  params.setCurrentTime(0);
  params.setDuration(0);
  params.setTrimStart(0);
  params.setTrimEnd(0);

  params.videoElement.pause();
  params.videoElement.removeAttribute('src');
  params.videoElement.load();

  params.setCaptionText('');
  params.setCaptionSegments([]);
  params.setAudioTracks([]);
  params.setCaptionTracks([
    {
      id: Date.now() + Math.floor(Math.random() * 1000),
      label: 'Primary Captions',
      color: '#a78bfa',
      enabled: true,
      segments: [],
    },
  ]);

  params.setMasks([]);
  params.setPendingMask(null);
  params.setClipSegments([]);
  params.setPlaybackCurve(structuredClone(DEFAULT_PLAYBACK_CURVE));
  params.setCubeLut(null);
  params.setFilters({ ...DEFAULT_FILTERS });

  params.setAspectRatio('16:9');
  params.videoElement.volume = 1;
  params.videoElement.playbackRate = 1;
  params.setVolume(1);
  params.volumeSlider.value = '1';

  params.renderToolControls();
  params.updateCaptions();
  params.updateTrimMarkers();
  params.applyMaskOverlay();
  params.applyVideoFilters();
}

export function setVideoFile(props: {
  file: File;
  restoredState?: Partial<VideoEditorState>;
  videoElement: HTMLVideoElement;
  videoContainer: HTMLDivElement;
  videoUrl: string | null;
  setVideoUrl: (next: string | null) => void;
  setVideoFile: (next: File | null) => void;
  setAudioTracks: (next: any[]) => void;
  setCaptionTracks: (next: any[]) => void;
  setCaptionSegments: (next: TimedCaption[]) => void;
  setCaptionText: (next: string) => void;
  setActiveCaptionTrackId: (next: number | null) => void;
  setDuration: (next: number) => void;
  setCurrentTime: (next: number) => void;
  setCachedVideoFile: (next: File | null) => void;
  setCachedVideoDataUrl: (next: string | null) => void;
  setViewportZoom: (next: {
    zoomLevel: number;
    panX: number;
    panY: number;
    isDragging: boolean;
    startX: number;
    startY: number;
  }) => void;
  resetHistory: () => void;
  renderToolControls: () => void;
  updateCaptions: () => void;
  updateTrimMarkers: () => void;
  applyVideoFilters: () => void;
  renderTimelineRows: () => void;
  applyMaskOverlay: () => void;
  pushState: () => void;
  restoreState: (state: Partial<VideoEditorState>) => void;
  getHistoryLength: () => number;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
}): void {
  if (props.videoUrl) {
    URL.revokeObjectURL(props.videoUrl);
    props.setVideoUrl(null);
  }

  props.setVideoFile(props.file);

  props.setAudioTracks([]);
  props.setCaptionTracks([
    {
      id: Date.now() + Math.floor(Math.random() * 1000),
      label: 'Primary Captions',
      color: '#a78bfa',
      enabled: true,
      segments: [],
    },
  ]);
  props.setCaptionSegments([]);
  props.setCaptionText('');
  props.setActiveCaptionTrackId(props.file ? null : null);

  props.setVideoUrl(URL.createObjectURL(props.file));

  props.setCachedVideoFile(null);
  props.setCachedVideoDataUrl(null);

  props.setViewportZoom({
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  const placeholder = props.videoContainer.querySelector('.ve-absolute') ?? props.videoContainer.firstChild;
  if (placeholder) {
    props.videoContainer.replaceChildren(placeholder, props.videoElement);
  } else {
    props.videoContainer.replaceChildren(props.videoElement);
  }

  props.videoElement.onloadedmetadata = () => {
    props.setDuration(Number.isFinite(props.videoElement.duration)
      ? props.videoElement.duration
      : 0);

    if (props.restoredState) {
      props.restoreState(props.restoredState);
    } else {
      const duration = props.videoElement.duration || 0;
      props.setCurrentTime(0);
      props.setDuration(duration);
      props.renderToolControls();
      props.updateCaptions();
    }

    props.renderToolControls();

    if (props.getHistoryLength() === 0) {
      props.pushState();
    }
  };

  props.videoElement.onplay = () => {};
  props.videoElement.onpause = () => {};
  props.videoElement.onended = () => {};
  props.videoElement.ontimeupdate = props.onTimeUpdate;
  props.videoElement.src = props.videoUrl ?? '';
  props.videoElement.load();
}

export function resetEditor(params: {
  videoElement: HTMLVideoElement;
  duration: number;
  setTrimStart: (next: number) => void;
  setTrimEnd: (next: number) => void;
  setPlaybackRate: (next: number) => void;
  setVolume: (next: number) => void;
  setAspectRatio: (ratio: VideoEditorState['aspectRatio']) => void;
  setRotation: (next: number) => void;
  setFlipH: (next: boolean) => void;
  setFlipV: (next: boolean) => void;
  setPreviewQuality: (next: VideoEditorState['previewQuality']) => void;
  setCaptionText: (next: string) => void;
  setCaptionSegments: (next: TimedCaption[]) => void;
  setAudioTracks: (next: any[]) => void;
  setCaptionTracks: (next: any[]) => void;
  setActiveCaptionTrackId: (next: number | null) => void;
  setCaptionSize: (next: number) => void;
  setCaptionWeight: (next: string) => void;
  setCaptionBg: (next: string) => void;
  setCaptionShadow: (next: boolean) => void;
  setCaptionX: (next: number) => void;
  setCaptionY: (next: number) => void;
  setActiveTransition: (next: any) => void;
  setActiveBlendMode: (next: any) => void;
  setMasks: (next: any[]) => void;
  setPendingMask: (next: any) => void;
  setPlaybackCurve: (next: VideoEditorState['playbackCurve']) => void;
  setCubeLut: (next: VideoEditorState['cubeLut']) => void;
  setFilters: (next: VideoFilters) => void;
  setClipSegments: (next: any[]) => void;
  setViewportZoom: (next: {
    zoomLevel: number;
    panX: number;
    panY: number;
    isDragging: boolean;
    startX: number;
    startY: number;
  }) => void;
  pushState: () => void;
  renderToolControls: () => void;
  updateTransforms: () => void;
  updateCaptions: () => void;
  updateTrimMarkers: () => void;
  applyMaskOverlay: () => void;
  applyVideoFilters: () => void;
  volumeSlider: HTMLInputElement;
}) {
  params.videoElement.pause();
  params.setTrimStart(0);
  params.setTrimEnd(params.duration || 0);
  params.setPlaybackRate(1);
  params.videoElement.playbackRate = 1;
  params.setVolume(1);
  params.videoElement.volume = 1;
  params.volumeSlider.value = '1';
  params.setAspectRatio('16:9');
  params.setRotation(0);
  params.setFlipH(false);
  params.setFlipV(false);
  params.setPreviewQuality('1');
  params.setViewportZoom({ zoomLevel: 1, panX: 0, panY: 0, isDragging: false, startX: 0, startY: 0 });
  params.setCaptionText('');
  params.setCaptionSegments([]);
  params.setAudioTracks([]);
  params.setCaptionTracks([
    {
      id: Date.now() + Math.floor(Math.random() * 1000),
      label: 'Primary Captions',
      color: '#a78bfa',
      enabled: true,
      segments: [],
    },
  ]);
  params.setActiveCaptionTrackId(params.duration ? 1 : null);
  params.setCaptionSize(20);
  params.setCaptionWeight('700');
  params.setCaptionBg('rgba(0,0,0,0.6)');
  params.setCaptionShadow(true);
  params.setCaptionX(50);
  params.setCaptionY(85);
  params.setActiveTransition('crossfade');
  params.setActiveBlendMode('screen');
  params.setMasks([]);
  params.setPendingMask(null);
  params.setPlaybackCurve(structuredClone(DEFAULT_PLAYBACK_CURVE));
  params.setCubeLut(null);
  params.setFilters({ ...DEFAULT_FILTERS });
  params.setClipSegments(params.duration ? [{ id: 1, start: 0, end: params.duration, label: 'Main Clip' }] : []);

  if (params.videoElement.src) {
    params.videoElement.currentTime = 0;
  }

  params.setAspectRatio('16:9');
  params.updateTransforms();
  params.updateCaptions();
  params.updateTrimMarkers();
  params.applyMaskOverlay();
  params.applyVideoFilters();
  params.pushState();
  params.renderToolControls();
}

export function seekVideoTo(params: {
  videoElement: HTMLVideoElement;
  duration: number;
  seconds: number;
}): Promise<void> {
  return new Promise((resolve) => {
    const target = clampValue(params.seconds, 0, params.duration);

    if (Math.abs(params.videoElement.currentTime - target) < 0.01) {
      resolve();
      return;
    }

    const handleSeeked = () => resolve();

    params.videoElement.addEventListener('seeked', handleSeeked, { once: true });
    params.videoElement.currentTime = target;
  });
}

export function cancelVideoExport(params: {
  videoElement: HTMLVideoElement;
  getIsRendering: () => boolean;
  setExportCancelled: (next: boolean) => void;
  setIsRendering: (next: boolean) => void;
  getRenderAnimationFrame: () => number;
  setRenderAnimationFrame: (next: number) => void;
  getMediaRecorder: () => MediaRecorder | null;
  setRenderChunks: (next: Blob[]) => void;
  setRenderProgress: (next: number) => void;
  renderToolControls: () => void;
  syncPlaybackUI: () => void;
}) {
  if (!params.getIsRendering()) return;

  params.setExportCancelled(true);
  params.setIsRendering(false);

  const renderAnimationFrame = params.getRenderAnimationFrame();
  if (renderAnimationFrame) {
    cancelAnimationFrame(renderAnimationFrame);
    params.setRenderAnimationFrame(0);
  }

  params.videoElement.pause();

  const mediaRecorder = params.getMediaRecorder();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else {
    params.setRenderChunks([]);
    params.setRenderProgress(0);
    params.setExportCancelled(false);
    params.renderToolControls();
  }

  params.syncPlaybackUI();
}
