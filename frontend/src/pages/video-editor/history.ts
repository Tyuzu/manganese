import type { VideoEditorState } from './types';
import { cloneEditorState as cloneProjectState } from './project-state';

export function createProjectHistory(params: {
  createSnapshot: () => VideoEditorState;
  restoreSnapshot: (state: Partial<VideoEditorState>) => void;
  onSnapshot?: () => void | Promise<void>;
}) {
  let history: VideoEditorState[] = [];
  let historyIndex = -1;

  const pushState = () => {
    const currentState = params.createSnapshot();

    history = history.slice(0, historyIndex + 1);
    history.push(cloneProjectState(currentState));

    const MAX_HISTORY = 100;

    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    historyIndex = history.length - 1;

    if (params.onSnapshot) {
      void params.onSnapshot();
    }
  };

  const undo = () => {
    if (historyIndex <= 0) return;

    historyIndex -= 1;
    params.restoreSnapshot(cloneProjectState(history[historyIndex]));
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;

    historyIndex += 1;
    params.restoreSnapshot(cloneProjectState(history[historyIndex]));
  };

  const resetHistory = () => {
    history = [];
    historyIndex = -1;
  };

  const setHistory = (nextHistory: VideoEditorState[]) => {
    history = nextHistory;
    historyIndex = history.length - 1;
  };

  return {
    get history() {
      return history;
    },
    get historyIndex() {
      return historyIndex;
    },
    resetHistory,
    setHistory,
    pushState,
    undo,
    redo,
  };
}
