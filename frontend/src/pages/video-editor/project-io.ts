import {
  PROJECT_DATABASE,
  PROJECT_ID,
  PROJECT_STORE,
  type StoredProject,
  type VideoEditorState,
} from './types';
import {
  dataUrlToFile,
  fileToDataUrl,
  openProjectDatabase,
} from './storage';
import { buildProjectExportSnapshot } from './project-state';

export type EditorProjectSerializer = () => VideoEditorState;

export function createProjectDownloadBlob(params: {
  videoFile: File | null;
  serializer: EditorProjectSerializer;
}): Blob {
  return new Blob(
    [JSON.stringify(buildProjectExportSnapshot(params), null, 2)],
    {
      type: 'application/json;charset=utf-8',
    },
  );
}

export async function importEditorProjectFile(
  file: File,
): Promise<Partial<VideoEditorState>> {
  const parsed = JSON.parse(await file.text());
  const state = parsed.state ?? parsed;

  if (!state || typeof state !== 'object') {
    throw new Error('Invalid project data.');
  }

  return state as Partial<VideoEditorState>;
}

export async function saveEditorProject(params: {
  projectDb: IDBDatabase | null;
  videoFile: File | null;
  cachedVideoFile: File | null;
  cachedVideoDataUrl: string | null;
  serializer: EditorProjectSerializer;
}): Promise<{
  projectDb: IDBDatabase | null;
  cachedVideoFile: File | null;
  cachedVideoDataUrl: string | null;
}> {
  if (!('indexedDB' in window)) {
    return {
      projectDb: params.projectDb,
      cachedVideoFile: params.cachedVideoFile,
      cachedVideoDataUrl: params.cachedVideoDataUrl,
    };
  }

  const db =
    params.projectDb ??
    (await openProjectDatabase(PROJECT_DATABASE, PROJECT_STORE));

  let nextCachedVideoFile = params.cachedVideoFile;
  let nextCachedVideoDataUrl = params.cachedVideoDataUrl;

  if (params.videoFile) {
    if (nextCachedVideoFile === params.videoFile && nextCachedVideoDataUrl) {
      nextCachedVideoDataUrl = params.cachedVideoDataUrl;
    } else {
      nextCachedVideoDataUrl = await fileToDataUrl(params.videoFile);
      nextCachedVideoFile = params.videoFile;
    }
  }

  const payload: StoredProject = {
    id: PROJECT_ID,
    videoDataUrl: nextCachedVideoDataUrl,
    fileName: params.videoFile?.name ?? null,
    fileType: params.videoFile?.type ?? null,
    savedAt: Date.now(),
    state: params.serializer(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readwrite');

    tx.objectStore(PROJECT_STORE).put(payload);

    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      reject(tx.error ?? new Error('Project save failed.'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('Project save was aborted.'));
    };
  });

  return {
    projectDb: db,
    cachedVideoFile: nextCachedVideoFile,
    cachedVideoDataUrl: nextCachedVideoDataUrl,
  };
}

export async function clearEditorProject(
  projectDb: IDBDatabase | null,
): Promise<IDBDatabase | null> {
  if (!('indexedDB' in window)) {
    return projectDb;
  }

  const db = projectDb ?? (await openProjectDatabase(PROJECT_DATABASE, PROJECT_STORE));

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readwrite');
    const request = tx.objectStore(PROJECT_STORE).delete(PROJECT_ID);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      reject(request.error ?? new Error('Project clear failed.'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('Project clear was aborted.'));
    };
  });

  return db;
}

export async function loadEditorProject(params: {
  projectDb: IDBDatabase | null;
  restoreState: (state: Partial<VideoEditorState>) => void;
  setVideoFile: (file: File, state?: Partial<VideoEditorState>) => void;
}): Promise<{
  projectDb: IDBDatabase | null;
  restoredState: Partial<VideoEditorState> | null;
  restoredFile: File | null;
  restoredVideoDataUrl: string | null;
}> {
  if (!('indexedDB' in window)) {
    return {
      projectDb: params.projectDb,
      restoredState: null,
      restoredFile: null,
      restoredVideoDataUrl: null,
    };
  }

  const db =
    params.projectDb ??
    (await openProjectDatabase(PROJECT_DATABASE, PROJECT_STORE));

  const entry = await new Promise<StoredProject | undefined>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readonly');
    const request = tx.objectStore(PROJECT_STORE).get(PROJECT_ID);

    request.onsuccess = () => {
      resolve(request.result as StoredProject | undefined);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Project restore failed.'));
    };
  });

  if (!entry?.state) {
    return {
      projectDb: db,
      restoredState: null,
      restoredFile: null,
      restoredVideoDataUrl: null,
    };
  }

  if (entry.videoDataUrl && entry.fileName) {
    const restoredFile = await dataUrlToFile(
      entry.videoDataUrl,
      entry.fileName,
      entry.fileType,
    );

    return {
      projectDb: db,
      restoredState: entry.state,
      restoredFile,
      restoredVideoDataUrl: entry.videoDataUrl,
    };
  }

  return {
    projectDb: db,
    restoredState: entry.state,
    restoredFile: null,
    restoredVideoDataUrl: null,
  };
}
