import { appStore } from '../../appState';
import { downloadVideoFromServer, exportVideoWithFFmpeg } from '../../api';
import type {
  AudioTrack,
  BlendMode,
  CaptionTrack,
  ClipTransition,
  MaskItem,
  TimedCaption,
  VideoEditorState,
  VideoFilters,
} from './types';
import { drawExportFrame, getExportDimensions, getSupportedRecorderMimeType } from './rendering';
import { cloneCaptionSegments } from './utils';
import { fileToDataUrl } from './storage';

export type VideoExportControllerDeps = {
  videoElement: HTMLVideoElement;
  getVideoFile: () => File | null;
  getVideoUrl: () => string | null;
  getDuration: () => number;
  getTrimStart: () => number;
  getTrimEnd: () => number;
  getExportResolution: () => '720p' | '1080p' | '4k';
  getExportFps: () => 24 | 30 | 60;
  getExportFormat: () => 'webm' | 'mp4';
  getExportBitrate: () => number;
  getAspectRatio: () => VideoEditorState['aspectRatio'];
  getRotation: () => number;
  getFlipH: () => boolean;
  getFlipV: () => boolean;
  getPlaybackRate: () => number;
  getVolume: () => number;
  getCaptionSegments: () => TimedCaption[];
  getCaptionText: () => string;
  getAudioTracks: () => AudioTrack[];
  getCaptionTracks: () => CaptionTrack[];
  getActiveCaptionTrackId: () => number | null;
  getMasks: () => MaskItem[];
  getFilters: () => VideoFilters;
  getActiveTransition: () => ClipTransition;
  getActiveBlendMode: () => BlendMode;
  getCurrentCaption: () => TimedCaption | null;
  getIsRendering: () => boolean;
  setIsRendering: (next: boolean) => void;
  getRenderProgress: () => number;
  setRenderProgress: (next: number) => void;
  setRenderChunks: (next: Blob[]) => void;
  getRenderChunks: () => Blob[];
  setExportCancelled: (next: boolean) => void;
  getExportCancelled: () => boolean;
  setMediaRecorder: (next: MediaRecorder | null) => void;
  getMediaRecorder: () => MediaRecorder | null;
  setRenderAnimationFrame: (next: number) => void;
  getRenderAnimationFrame: () => number;
  updateRenderProgressUI: (progress: number) => void;
  renderToolControls: () => void;
  seekVideoTo: (seconds: number) => Promise<void>;
  syncPlaybackUI: () => void;
  updatePlaybackRateFromCurve: () => void;
};

export function createVideoExportController(deps: VideoExportControllerDeps) {
  async function pollServerVideoExport(jobId: string, fileName: string): Promise<void> {
    while (deps.getIsRendering()) {
      try {
        const status = await getVideoExportStatus(jobId);

        if (status.status === 'completed') {
          deps.setIsRendering(false);
          deps.renderToolControls();
          deps.updateRenderProgressUI(100);

          if (status.output) {
            await downloadVideoFromServer(
              status.output,
              status.fileName || fileName || 'dolomite-rendered.mp4',
            );
          }

          alert(
            status.message || 'The server render finished successfully.',
          );
          return;
        }

        if (status.status === 'failed' || status.error) {
          deps.setIsRendering(false);
          deps.renderToolControls();
          deps.updateRenderProgressUI(0);
          alert(status.error || status.message || 'Server render failed.');
          return;
        }

        const nextProgress = typeof status.progress === 'number'
          ? Math.max(0, Math.min(100, status.progress))
          : status.status === 'processing'
            ? 35
            : 10;

        deps.updateRenderProgressUI(nextProgress);
      } catch (error) {
        console.warn('Server export status poll failed:', error);
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  async function fallbackToServerExport(): Promise<boolean> {
    const videoFile = deps.getVideoFile();

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
          `rendered-video-${Date.now()}.${deps.getExportFormat()}`,
        mode: 'server',
        dataUrl,
        metadata: {
          resolution: deps.getExportResolution(),
          fps: deps.getExportFps(),
          format: deps.getExportFormat(),
          bitrate: deps.getExportBitrate(),
          async: true,
          trimStart: deps.getTrimStart(),
          trimEnd: deps.getTrimEnd(),
          aspectRatio: deps.getAspectRatio(),
          rotation: deps.getRotation(),
          flipH: deps.getFlipH(),
          flipV: deps.getFlipV(),
          playbackRate: deps.getPlaybackRate(),
          volume: deps.getVolume(),
          captionSegments: deps.getCaptionSegments(),
          captionText: deps.getCaptionText(),
          audioTracks: deps.getAudioTracks().map((track) => ({
            ...track,
            dataUrl: track.dataUrl,
          })),
          captionTracks: deps.getCaptionTracks().map((track) => ({
            ...track,
            segments: cloneCaptionSegments(track.segments),
          })),
          activeCaptionTrackId: deps.getActiveCaptionTrackId(),
          filters: { ...deps.getFilters() },
          transitionType: deps.getActiveTransition(),
          blendMode: deps.getActiveBlendMode(),
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

  async function startVideoExport(): Promise<void> {
    const videoFile = deps.getVideoFile();
    const videoUrl = deps.getVideoUrl();

    if (!videoFile || !videoUrl) {
      alert('Please import a video before rendering.');
      return;
    }

    if (deps.getIsRendering()) {
      alert('A video render is already in progress.');
      return;
    }

    if (!deps.getDuration() || deps.getTrimEnd() <= deps.getTrimStart()) {
      alert('Please choose a valid video trim range.');
      return;
    }

    if ((appStore.getState().mediaProcessingMode ?? 'browser') === 'server') {
      try {
        const dataUrl = await fileToDataUrl(videoFile);

        deps.setIsRendering(true);
        deps.renderToolControls();
        deps.updateRenderProgressUI(5);

        const result = await exportVideoWithFFmpeg({
          operation: 'video-export',
          mediaType: 'video',
          fileName:
            videoFile.name ||
            `rendered-video-${Date.now()}.${deps.getExportFormat()}`,
          mode: 'server',
          dataUrl,
          metadata: {
            resolution: deps.getExportResolution(),
            fps: deps.getExportFps(),
            format: deps.getExportFormat(),
            bitrate: deps.getExportBitrate(),
            async: true,
            trimStart: deps.getTrimStart(),
            trimEnd: deps.getTrimEnd(),
            aspectRatio: deps.getAspectRatio(),
            rotation: deps.getRotation(),
            flipH: deps.getFlipH(),
            flipV: deps.getFlipV(),
            playbackRate: deps.getPlaybackRate(),
            volume: deps.getVolume(),
            captionSegments: deps.getCaptionSegments(),
            captionText: deps.getCaptionText(),
            audioTracks: deps.getAudioTracks().map((track) => ({
              ...track,
              dataUrl: track.dataUrl,
            })),
            captionTracks: deps.getCaptionTracks().map((track) => ({
              ...track,
              segments: cloneCaptionSegments(track.segments),
            })),
            activeCaptionTrackId: deps.getActiveCaptionTrackId(),
            filters: { ...deps.getFilters() },
            transitionType: deps.getActiveTransition(),
            blendMode: deps.getActiveBlendMode(),
          },
        });

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
          result.message || 'Video processing request was sent to the server.',
        );
      } catch (error) {
        console.error('Server video export failed:', error);

        deps.setIsRendering(false);
        deps.renderToolControls();

        alert(
          'Server render failed. Check the server connection or use browser rendering.',
        );
      }

      return;
    }

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

    const mimeType = getSupportedRecorderMimeType(deps.getExportFormat());
    const targetRecordingFrameRate = Math.min(deps.getExportFps(), 30);

    if (!mimeType) {
      if (deps.getExportFormat() === 'mp4') {
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
      deps.getExportResolution(),
      deps.getAspectRatio(),
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert('Could not initialize the export canvas.');
      return;
    }

    deps.setExportCancelled(false);
    deps.setIsRendering(true);
    deps.setRenderProgress(0);
    deps.setRenderChunks([]);

    deps.renderToolControls();
    deps.updateRenderProgressUI(0);

    const videoElement = deps.videoElement;
    videoElement.pause();
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.defaultPlaybackRate = 1;
    videoElement.playbackRate = 1;
    deps.syncPlaybackUI();

    const canvasStream = canvas.captureStream(deps.getExportFps());

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
        videoBitsPerSecond: deps.getExportBitrate(),
      });
    } catch (error) {
      deps.setIsRendering(false);
      canvasStream.getTracks().forEach((track) => track.stop());
      console.error('Could not initialize MediaRecorder:', error);
      alert('Could not initialize the browser video encoder.');
      deps.renderToolControls();
      return;
    }

    deps.setMediaRecorder(recorder);

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        deps.setRenderChunks([...deps.getRenderChunks(), event.data]);
      }
    };

    recorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      deps.setExportCancelled(true);
      deps.setIsRendering(false);
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    recorder.onstop = async () => {
      const wasCancelled = deps.getExportCancelled();
      deps.setIsRendering(false);

      if (deps.getRenderAnimationFrame()) {
        cancelAnimationFrame(deps.getRenderAnimationFrame());
        deps.setRenderAnimationFrame(0);
      }

      canvasStream.getTracks().forEach((track) => track.stop());
      sourceStream?.getTracks().forEach((track) => track.stop());

      if (wasCancelled) {
        deps.setRenderChunks([]);
        deps.setRenderProgress(0);
        deps.setExportCancelled(false);
        deps.renderToolControls();
        return;
      }

      deps.updateRenderProgressUI(100);

      const actualMimeType = recorder.mimeType || mimeType;
      const extension = actualMimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(deps.getRenderChunks(), { type: actualMimeType });
      deps.setRenderChunks([]);

      if (!blob.size) {
        const fallbackSucceeded = await fallbackToServerExport();
        if (fallbackSucceeded) {
          deps.setRenderChunks([]);
          deps.setRenderProgress(0);
          deps.renderToolControls();
          return;
        }

        alert(
          'The render produced an empty video file and the FFmpeg fallback could not complete.',
        );
        deps.renderToolControls();
        return;
      }

      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `rendered-video-${Date.now()}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      deps.renderToolControls();
    };

    try {
      await deps.seekVideoTo(deps.getTrimStart());
      if (deps.getExportCancelled()) return;

      drawExportFrame(
        ctx,
        canvas,
        videoElement,
        deps.getRotation(),
        deps.getFlipH(),
        deps.getFlipV(),
        deps.getMasks(),
        deps.getCurrentCaption,
      );

      recorder.start(Math.max(50, 1000 / targetRecordingFrameRate));
      await videoElement.play();
      deps.syncPlaybackUI();
    } catch (error) {
      console.error('Could not start video rendering:', error);
      deps.setExportCancelled(true);
      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        deps.setIsRendering(false);
        canvasStream.getTracks().forEach((track) => track.stop());
        deps.renderToolControls();
      }
      alert('Could not start video playback for rendering.');
      return;
    }

    const renderLoop = () => {
      if (!deps.getIsRendering() || deps.getExportCancelled()) return;

      if (videoElement.readyState >= 2) {
        drawExportFrame(
          ctx,
          canvas,
          videoElement,
          deps.getRotation(),
          deps.getFlipH(),
          deps.getFlipV(),
          deps.getMasks(),
          deps.getCurrentCaption,
        );
      }

      const totalRange = Math.max(0.01, deps.getTrimEnd() - deps.getTrimStart());
      const progress = ((videoElement.currentTime - deps.getTrimStart()) / totalRange) * 100;
      deps.updateRenderProgressUI(progress);

      if (videoElement.currentTime >= deps.getTrimEnd() || videoElement.ended) {
        videoElement.pause();
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        deps.syncPlaybackUI();
        return;
      }

      deps.setRenderAnimationFrame(requestAnimationFrame(renderLoop));
    };

    deps.setRenderAnimationFrame(requestAnimationFrame(renderLoop));
  }

  function cancelVideoExport() {
    const renderAnimationFrame = deps.getRenderAnimationFrame();
    if (renderAnimationFrame) {
      cancelAnimationFrame(renderAnimationFrame);
      deps.setRenderAnimationFrame(0);
    }

    const mediaRecorder = deps.getMediaRecorder();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    deps.setExportCancelled(true);
    deps.setIsRendering(false);
    deps.setRenderChunks([]);
    deps.setRenderProgress(0);
    deps.renderToolControls();
    deps.syncPlaybackUI();
  }

  return {
    startVideoExport,
    cancelVideoExport,
    pollServerVideoExport,
    fallbackToServerExport,
  };
}

async function getVideoExportStatus(jobId: string): Promise<{
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  output?: string;
  fileName?: string;
  error?: string;
  message?: string;
}> {
  try {
    const response = await fetch(`/api/video-status/${encodeURIComponent(jobId)}`);
    return response.ok ? await response.json() : { status: 'failed', error: 'Unable to read export status.' };
  } catch {
    return { status: 'failed', error: 'Unable to reach the export status endpoint.' };
  }
}
