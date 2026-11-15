import type {
  VideoEditorState,
  VideoFilters,
} from './types';
import { flushVideoSession as flushVideoSessionController } from './media';

export type VideoSourceControllerDeps = {
  videoElement: HTMLVideoElement;
  videoContainer: HTMLDivElement;
  maskOverlay: HTMLElement;
  captionOverlay: HTMLElement;
  seekSlider: HTMLInputElement;
  playheadLine: HTMLElement;
  getVideoUrl: () => string | null;
  setVideoUrl: (next: string | null) => void;
  getVideoFile: () => File | null;
  setVideoFile: (next: File | null) => void;
  getDuration: () => number;
  setDuration: (next: number) => void;
  getCurrentTime: () => number;
  setCurrentTime: (next: number) => void;
  getTrimStart: () => number;
  setTrimStart: (next: number) => void;
  getTrimEnd: () => number;
  setTrimEnd: (next: number) => void;
  setCaptionText: (next: string) => void;
  setCaptionSegments: (next: any[]) => void;
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
  getIsRendering: () => boolean;
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
  setViewportZoom: (next: {
    zoomLevel: number;
    panX: number;
    panY: number;
    isDragging: boolean;
    startX: number;
    startY: number;
  }) => void;
  timeDisplay: HTMLElement;
  formatTime: (seconds: number) => string;
  generateThumbnailStrip: () => Promise<void>;
  syncPlaybackUI: () => void;
  updatePlaybackRateFromCurve: () => void;
  getHistoryLength: () => number;
  pushState: () => void;
  restoreState: (state: Partial<VideoEditorState>) => void;
  setCachedVideoFile: (next: File | null) => void;
  setCachedVideoDataUrl: (next: string | null) => void;
};

export function createVideoSourceController(deps: VideoSourceControllerDeps) {
  function flushVideoSession(): void {
    flushVideoSessionController({
      videoElement: deps.videoElement,
      videoContainer: deps.videoContainer,
      videoUrl: deps.getVideoUrl(),
      setVideoUrl: deps.setVideoUrl,
      setVideoFile: deps.setVideoFile,
      getVideoFile: deps.getVideoFile,
      getDuration: deps.getDuration,
      setDuration: deps.setDuration,
      setTrimStart: deps.setTrimStart,
      setTrimEnd: deps.setTrimEnd,
      setCurrentTime: deps.setCurrentTime,
      setCaptionText: deps.setCaptionText,
      setCaptionSegments: deps.setCaptionSegments,
      setAudioTracks: deps.setAudioTracks,
      setCaptionTracks: deps.setCaptionTracks,
      setMasks: deps.setMasks,
      setPendingMask: deps.setPendingMask,
      setClipSegments: deps.setClipSegments,
      setPlaybackCurve: deps.setPlaybackCurve,
      setCubeLut: deps.setCubeLut,
      setAspectRatio: deps.setAspectRatio,
      setVolume: deps.setVolume,
      setRenderAnimationFrame: deps.setRenderAnimationFrame,
      getRenderAnimationFrame: deps.getRenderAnimationFrame,
      setMediaRecorder: deps.setMediaRecorder,
      getMediaRecorder: deps.getMediaRecorder,
      setExportCancelled: deps.setExportCancelled,
      setIsRendering: deps.setIsRendering,
      setRenderChunks: deps.setRenderChunks,
      setRenderProgress: deps.setRenderProgress,
      resetHistory: deps.resetHistory,
      renderToolControls: deps.renderToolControls,
      updateCaptions: deps.updateCaptions,
      updateTrimMarkers: deps.updateTrimMarkers,
      applyMaskOverlay: deps.applyMaskOverlay,
      applyVideoFilters: deps.applyVideoFilters,
      volumeSlider: deps.volumeSlider,
      getFilters: deps.getFilters,
      setFilters: deps.setFilters,
    });
  }

  function setVideoFile(
    file: File,
    restoredState?: Partial<VideoEditorState>,
  ): void {
    const currentVideoUrl = deps.getVideoUrl();

    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      deps.setVideoUrl(null);
    }

    deps.setVideoFile(file);

    deps.setAudioTracks([]);
    deps.setCaptionTracks([
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        label: 'Primary Captions',
        color: '#a78bfa',
        enabled: true,
        segments: [],
      },
    ]);
    deps.setCaptionSegments([]);
    deps.setCaptionText('');

    const nextVideoUrl = URL.createObjectURL(file);
    deps.setVideoUrl(nextVideoUrl);

    deps.setCachedVideoFile(null);
    deps.setCachedVideoDataUrl(null);

    deps.setViewportZoom({
      zoomLevel: 1,
      panX: 0,
      panY: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
    });

    deps.videoContainer.replaceChildren(
      deps.maskOverlay,
      deps.videoElement,
      deps.captionOverlay,
    );

    deps.videoElement.onloadedmetadata = () => {
      const nextDuration = Number.isFinite(deps.videoElement.duration)
        ? deps.videoElement.duration
        : 0;

      deps.setDuration(nextDuration);

      if (restoredState) {
        deps.restoreState(restoredState);
      } else {
        deps.setTrimStart(0);
        deps.setTrimEnd(nextDuration);

        deps.setClipSegments(
          nextDuration
            ? [
                {
                  id: 1,
                  start: 0,
                  end: nextDuration,
                  label: file.name || 'Main Clip',
                },
              ]
            : [],
        );

        deps.videoElement.currentTime = 0;
        deps.updateTrimMarkers();
        deps.applyVideoFilters();
        deps.updateCaptions();
      }

      deps.timeDisplay.textContent = `${deps.formatTime(0)} / ${deps.formatTime(nextDuration)}`;
      deps.syncPlaybackUI();
      void deps.generateThumbnailStrip();
      deps.renderToolControls();

      if (deps.getHistoryLength() === 0) {
        deps.pushState();
      }
    };

    deps.videoElement.onplay = deps.syncPlaybackUI;
    deps.videoElement.onpause = deps.syncPlaybackUI;
    deps.videoElement.onended = deps.syncPlaybackUI;

    deps.videoElement.ontimeupdate = () => {
      const duration = deps.getDuration();
      if (!duration) return;

      const currentTime = deps.videoElement.currentTime;
      deps.setCurrentTime(currentTime);
      deps.timeDisplay.textContent = `${deps.formatTime(currentTime)} / ${deps.formatTime(duration)}`;

      const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

      deps.seekSlider.value = String(percent);
      deps.playheadLine.style.left = `${percent}%`;

      deps.updateCaptions();

      if (!deps.getIsRendering()) {
        deps.updatePlaybackRateFromCurve();

        if (deps.getDuration() > 0 && currentTime >= deps.getTrimEnd()) {
          deps.videoElement.pause();
          deps.videoElement.currentTime = deps.getTrimEnd();
          deps.syncPlaybackUI();
        }
      }
    };

    deps.videoElement.src = nextVideoUrl;
    deps.videoElement.load();
  }

  function handleVideoUpload(event: Event): void {
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

  return {
    flushVideoSession,
    setVideoFile,
    handleVideoUpload,
  };
}
