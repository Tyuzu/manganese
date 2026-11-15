import type {
  AudioTrack,
  CaptionTrack,
  MaskItem,
  PlaybackCurve,
  TimedCaption,
  VideoEditorState,
  VideoFilters,
  StoredProject,
} from './types';
import { PROJECT_DATABASE, PROJECT_ID, PROJECT_STORE } from './types';
import { cloneCaptionSegments, cloneMasks } from './utils';
import { openProjectDatabase } from './storage';

export type SerializedProjectContext = {
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  aspectRatio: VideoEditorState['aspectRatio'];
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  previewQuality: VideoEditorState['previewQuality'];
  captionText: string;
  captionSegments: TimedCaption[];
  audioTracks: AudioTrack[];
  captionTracks: CaptionTrack[];
  activeCaptionTrackId: number | null;
  activeTransition: VideoEditorState['transitionType'];
  clipSegments: VideoEditorState['clipSegments'];
  activeBlendMode: VideoEditorState['blendMode'];
  masks: MaskItem[];
  playbackCurve: PlaybackCurve;
  cubeLut: VideoEditorState['cubeLut'];
  captionSize: number;
  captionWeight: string;
  captionBg: string;
  captionShadow: boolean;
  captionX: number;
  captionY: number;
  filters: VideoFilters;
};

export function serializeEditorState(
  state: SerializedProjectContext,
): VideoEditorState {
  return {
    trimStart: state.trimStart,
    trimEnd: state.trimEnd,
    playbackRate: state.playbackRate,
    volume: state.volume,

    aspectRatio: state.aspectRatio,

    rotation: state.rotation,
    flipH: state.flipH,
    flipV: state.flipV,

    previewQuality: state.previewQuality,

    captionText: state.captionText,
    captionSegments: cloneCaptionSegments(state.captionSegments),
    audioTracks: state.audioTracks.map((track) => ({
      ...track,
      dataUrl: track.dataUrl,
    })),
    captionTracks: state.captionTracks.map((track) => ({
      ...track,
      segments: cloneCaptionSegments(track.segments),
    })),
    activeCaptionTrackId: state.activeCaptionTrackId,

    transitionType: state.activeTransition,
    clipSegments: state.clipSegments.map((segment) => ({ ...segment })),
    blendMode: state.activeBlendMode,

    masks: cloneMasks(state.masks),

    playbackCurve: {
      p0: { ...state.playbackCurve.p0 },
      p1: { ...state.playbackCurve.p1 },
      p2: { ...state.playbackCurve.p2 },
      p3: { ...state.playbackCurve.p3 },
    },

    cubeLut: state.cubeLut
      ? {
          size: state.cubeLut.size,
          values: [...state.cubeLut.values],
        }
      : null,

    captionSize: state.captionSize,
    captionWeight: state.captionWeight,
    captionBg: state.captionBg,
    captionShadow: state.captionShadow,
    captionX: state.captionX,
    captionY: state.captionY,

    filters: { ...state.filters },
  };
}

export function cloneEditorState(
  state: VideoEditorState,
): VideoEditorState {
  return {
    ...state,
    captionSegments: cloneCaptionSegments(state.captionSegments),
    clipSegments: state.clipSegments.map((segment) => ({ ...segment })),
    masks: cloneMasks(state.masks),
    playbackCurve: {
      p0: { ...state.playbackCurve.p0 },
      p1: { ...state.playbackCurve.p1 },
      p2: { ...state.playbackCurve.p2 },
      p3: { ...state.playbackCurve.p3 },
    },
    cubeLut: state.cubeLut
      ? {
          size: state.cubeLut.size,
          values: [...state.cubeLut.values],
        }
      : null,
    filters: { ...state.filters },
  };
}

export async function persistProjectSnapshot(params: {
  projectDb: IDBDatabase | null;
  videoFile: File | null;
  videoDataUrl: string | null;
  serializer: () => VideoEditorState;
}): Promise<IDBDatabase | null> {
  if (!('indexedDB' in window)) return params.projectDb;

  try {
    const db =
      params.projectDb ?? (await openProjectDatabase(PROJECT_DATABASE, PROJECT_STORE));

    let savedVideoDataUrl = params.videoDataUrl;

    if (params.videoFile && !savedVideoDataUrl) {
      const blobUrl = URL.createObjectURL(params.videoFile);
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      savedVideoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Unable to read file for persistence.'));
        };
        reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
        reader.readAsDataURL(blob);
      });
      URL.revokeObjectURL(blobUrl);
    }

    const payload: StoredProject = {
      id: PROJECT_ID,
      videoDataUrl: savedVideoDataUrl,
      fileName: params.videoFile?.name ?? null,
      fileType: params.videoFile?.type ?? null,
      savedAt: Date.now(),
      state: params.serializer(),
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECT_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECT_STORE);
      const request = store.put(payload);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(request.error ?? new Error('Could not persist the editor project.'));
      };
    });

    return db;
  } catch (error) {
    console.warn('Unable to save editor state:', error);
    return params.projectDb;
  }
}

export function buildProjectExportSnapshot(params: {
  videoFile: File | null;
  serializer: () => VideoEditorState;
}) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    source: params.videoFile
      ? {
          name: params.videoFile.name,
          type: params.videoFile.type,
          size: params.videoFile.size,
        }
      : null,
    state: params.serializer(),
  };
}
