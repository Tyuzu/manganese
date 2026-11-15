export type ThumbnailStripDeps = {
  thumbnailStrip: HTMLElement;
  getVideoUrl: () => string | null;
  getDuration: () => number;
};

export function createThumbnailStripGenerator(deps: ThumbnailStripDeps) {
  return async function generateThumbnailStrip(): Promise<void> {
    const { thumbnailStrip, getVideoUrl, getDuration } = deps;
    const videoUrl = getVideoUrl();
    const duration = getDuration();

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
        const seekTime = (index / Math.max(1, frameCount - 1)) * Math.max(0, duration - 0.1);

        if (Math.abs(previewVideo.currentTime - seekTime) > 0.01) {
          const seeked = waitForEvent(previewVideo, 'seeked');
          previewVideo.currentTime = seekTime;
          await seeked;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
      }
    } catch (error) {
      console.warn('Thumbnail generation failed:', error);
    } finally {
      previewVideo.pause();
      previewVideo.removeAttribute('src');
      previewVideo.load();
    }
  };
}
