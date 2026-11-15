export type EditorShortcutsDeps = {
  undo: () => void;
  redo: () => void;
  togglePlay: () => void;
  zoomViewport: (factor: number) => void;
  updateTransforms: () => void;
  pushState: () => void;
  duration: () => number;
  interactionModeEnabled: () => boolean;
  videoElement: HTMLVideoElement;
  setRotation: (value: number) => void;
  rotationValue: () => number;
  flipHValue: () => boolean;
  setFlipH: (value: boolean) => void;
};

export function bindEditorShortcuts(deps: EditorShortcutsDeps) {
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

    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        deps.redo();
      } else {
        deps.undo();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault();
      deps.redo();
      return;
    }

    if (!deps.interactionModeEnabled()) return;

    if (event.code === 'Space') {
      event.preventDefault();
      deps.togglePlay();
    } else if (key === '+' || key === '=') {
      event.preventDefault();
      deps.zoomViewport(1.15);
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      deps.zoomViewport(1 / 1.15);
    } else if (key === 'r') {
      event.preventDefault();
      const nextRotation = (deps.rotationValue() + 90) % 360;
      deps.setRotation(nextRotation);
      deps.updateTransforms();
      deps.pushState();
    } else if (key === 'h') {
      event.preventDefault();
      deps.setFlipH(!deps.flipHValue());
      deps.updateTransforms();
      deps.pushState();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const duration = deps.duration();
      if (duration) {
        deps.videoElement.currentTime = Math.min(
          duration,
          deps.videoElement.currentTime + 5,
        );
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const duration = deps.duration();
      if (duration) {
        deps.videoElement.currentTime = Math.max(
          0,
          deps.videoElement.currentTime - 5,
        );
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}
