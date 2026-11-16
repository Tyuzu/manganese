import type { VideoEditorState, VideoTab } from './types';
import {
  clearEditorProject,
  createProjectDownloadBlob,
  importEditorProjectFile,
  loadEditorProject,
  saveEditorProject,
} from './project-io';

export type ProjectLifecycleDeps = {
  getProjectDb: () => IDBDatabase | null;
  setProjectDb: (next: IDBDatabase | null) => void;
  getCachedVideoFile: () => File | null;
  setCachedVideoFile: (next: File | null) => void;
  getCachedVideoDataUrl: () => string | null;
  setCachedVideoDataUrl: (next: string | null) => void;
  getVideoFile: () => File | null;
  getSerializer: () => VideoEditorState;
  restoreState: (state: Partial<VideoEditorState>) => void;
  setVideoFile: (file: File, restoredState?: Partial<VideoEditorState>) => void;
  getProjectHistory: () => {
    history: unknown[];
    historyIndex: number;
    pushState: () => void;
    resetHistory: () => void;
    undo: () => void;
    redo: () => void;
  };
  setActiveTab: (tab: VideoTab) => void;
  switchTab: (tab: VideoTab) => void;
  updatePlaybackRateFromCurve: () => void;
  getVideoElementSrc: () => string;
  renderToolControls: () => void;
};

export function createProjectLifecycleController(deps: ProjectLifecycleDeps) {
  async function persistProjectState(): Promise<void> {
    try {
      const projectDb = deps.getProjectDb();
      const result = await saveEditorProject({
        projectDb,
        videoFile: deps.getVideoFile(),
        cachedVideoFile: deps.getCachedVideoFile(),
        cachedVideoDataUrl: deps.getCachedVideoDataUrl(),
        serializer: deps.getSerializer,
      });

      deps.setProjectDb(result.projectDb);
      deps.setCachedVideoFile(result.cachedVideoFile);
      deps.setCachedVideoDataUrl(result.cachedVideoDataUrl);
    } catch (error) {
      console.warn('Unable to save editor state:', error);
    }
  }

  async function hydrateProjectState(): Promise<void> {
    try {
      const result = await loadEditorProject({
        projectDb: deps.getProjectDb(),
        restoreState: deps.restoreState,
        setVideoFile: deps.setVideoFile,
      });

      deps.setProjectDb(result.projectDb);

      if (!result.restoredState) return;

      if (result.restoredFile && result.restoredVideoDataUrl) {
        deps.setCachedVideoFile(result.restoredFile);
        deps.setCachedVideoDataUrl(result.restoredVideoDataUrl);
        deps.setVideoFile(result.restoredFile, result.restoredState);
        return;
      }

      deps.restoreState(result.restoredState);
    } catch (error) {
      console.warn('Unable to restore editor state:', error);
    }
  }

  function exportProjectFile(): void {
    const blob = createProjectDownloadBlob({
      videoFile: deps.getVideoFile(),
      serializer: deps.getSerializer,
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

  async function importProjectFile(): Promise<void> {
    const filePicker = document.createElement('input');
    filePicker.type = 'file';
    filePicker.accept = '.json,application/json';

    filePicker.onchange = async () => {
      const file = filePicker.files?.[0];
      if (!file) return;

      try {
        const state = await importEditorProjectFile(file);

        deps.restoreState(state);

        const projectHistory = deps.getProjectHistory();
        projectHistory.resetHistory();
        projectHistory.pushState();

        deps.setActiveTab('timeline');
        deps.switchTab('timeline');

        if (deps.getVideoElementSrc()) {
          deps.updatePlaybackRateFromCurve();
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

  function undo(): void {
    const projectHistory = deps.getProjectHistory();
    if (projectHistory.historyIndex <= 0) return;

    projectHistory.undo();
    deps.renderToolControls();
  }

  function redo(): void {
    const projectHistory = deps.getProjectHistory();
    if (projectHistory.historyIndex >= projectHistory.history.length - 1) return;

    projectHistory.redo();
    deps.renderToolControls();
  }

  async function clearProjectState(): Promise<void> {
    try {
      const projectDb = await clearEditorProject(deps.getProjectDb());
      deps.setProjectDb(projectDb);
    } catch (error) {
      console.warn('Unable to clear editor state:', error);
    }
  }

  function resetProjectHistory(): void {
    deps.getProjectHistory().resetHistory();
  }

  return {
    persistProjectState,
    hydrateProjectState,
    clearProjectState,
    exportProjectFile,
    importProjectFile,
    undo,
    redo,
    resetProjectHistory,
  };
}
