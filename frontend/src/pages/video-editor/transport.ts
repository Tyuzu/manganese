export function syncPlaybackButton(
  playPauseBtn: HTMLButtonElement,
  videoElement: HTMLVideoElement,
  isPlaying: boolean,
): void {
  playPauseBtn.textContent = isPlaying ? '❚❚' : '▶';
  playPauseBtn.title = isPlaying ? 'Pause playback' : 'Play playback';
  playPauseBtn.setAttribute(
    'aria-label',
    isPlaying ? 'Pause video' : 'Play video',
  );

  if (!videoElement.src) {
    playPauseBtn.textContent = '▶';
    playPauseBtn.title = 'Play playback';
    playPauseBtn.setAttribute('aria-label', 'Play video');
  }
}

export function togglePlayback(
  videoElement: HTMLVideoElement,
  syncPlaybackUI: () => void,
): boolean {
  if (!videoElement.src) return false;

  if (videoElement.paused) {
    void videoElement.play().catch(() => undefined);
  } else {
    videoElement.pause();
  }

  syncPlaybackUI();
  return true;
}

export function stepVideoFrame(
  videoElement: HTMLVideoElement,
  duration: number,
  delta: number,
): void {
  if (!videoElement.src) return;

  videoElement.pause();

  const frameDuration = 1 / 30;
  videoElement.currentTime = Math.min(
    Math.max(videoElement.currentTime + delta * frameDuration, 0),
    duration,
  );
}
