import type {
  AudioTrack,
  BlendMode,
  CaptionTrack,
  ClipTransition,
  MaskItem,
  PlaybackCurve,
  TimedCaption,
  TimelineClipSegment,
  VideoEditorState,
  VideoFilters,
} from './types';
import {
  DEFAULT_CAPTION_STYLE,
  DEFAULT_FILTERS,
  DEFAULT_PLAYBACK_CURVE,
} from './types';
import { clampValue, cloneCaptionSegments, cloneMasks } from './utils';

export type SerializedEditorStateInput = {
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
  activeTransition: ClipTransition;
  clipSegments: TimelineClipSegment[];
  activeBlendMode: BlendMode;
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
  duration: number;
};

export function serializeEditorSnapshot(
  state: SerializedEditorStateInput,
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

export function applyEditorSnapshot(
  current: SerializedEditorStateInput,
  incoming: Partial<VideoEditorState>,
): SerializedEditorStateInput {
  const next: SerializedEditorStateInput = { ...current };

  if (Number.isFinite(incoming.trimStart)) {
    next.trimStart = Math.max(0, Number(incoming.trimStart));
  }

  if (Number.isFinite(incoming.trimEnd)) {
    next.trimEnd = Math.max(0, Number(incoming.trimEnd));
  }

  if (Number.isFinite(incoming.playbackRate)) {
    next.playbackRate = clampValue(Number(incoming.playbackRate), 0.25, 4);
  }

  if (Number.isFinite(incoming.volume)) {
    next.volume = clampValue(Number(incoming.volume), 0, 1);
  }

  if (incoming.aspectRatio) {
    next.aspectRatio = incoming.aspectRatio;
  }

  next.rotation = Number.isFinite(incoming.rotation)
    ? Number(incoming.rotation)
    : 0;

  next.flipH = Boolean(incoming.flipH);
  next.flipV = Boolean(incoming.flipV);

  next.previewQuality =
    incoming.previewQuality === '0.5' || incoming.previewQuality === '0.25'
      ? incoming.previewQuality
      : '1';

  next.captionText = incoming.captionText ?? '';

  next.captionSegments = Array.isArray(incoming.captionSegments)
    ? cloneCaptionSegments(incoming.captionSegments)
    : [];

  next.audioTracks = Array.isArray(incoming.audioTracks)
    ? incoming.audioTracks.map((track) => ({
        id: Number.isFinite(track.id) ? Number(track.id) : Date.now() + Math.random(),
        label: typeof track.label === 'string' ? track.label : `Audio Track ${next.audioTracks.length + 1}`,
        fileName: typeof track.fileName === 'string' ? track.fileName : 'audio-track.mp3',
        dataUrl: typeof track.dataUrl === 'string' ? track.dataUrl : null,
        volume: Number.isFinite(track.volume) ? clampValue(Number(track.volume), 0, 2) : 1,
        trimStart: Number.isFinite(track.trimStart) ? Number(track.trimStart) : 0,
        trimEnd: Number.isFinite(track.trimEnd) ? Number(track.trimEnd) : next.duration || 0,
        enabled: typeof track.enabled === 'boolean' ? track.enabled : true,
      }))
    : [];

  next.captionTracks = Array.isArray(incoming.captionTracks)
    ? incoming.captionTracks.map((track) => ({
        id: Number.isFinite(track.id) ? Number(track.id) : Date.now() + Math.random(),
        label: typeof track.label === 'string' ? track.label : 'Captions',
        color: typeof track.color === 'string' ? track.color : '#a78bfa',
        enabled: typeof track.enabled === 'boolean' ? track.enabled : true,
        segments: Array.isArray(track.segments) ? cloneCaptionSegments(track.segments) : [],
      }))
    : [];

  if (!next.captionTracks.length) {
    next.captionTracks = [
      {
        id: 1,
        label: 'Primary Captions',
        color: '#a78bfa',
        enabled: true,
        segments: cloneCaptionSegments(next.captionSegments),
      },
    ];
  }

  next.activeCaptionTrackId = Number.isFinite(incoming.activeCaptionTrackId)
    ? Number(incoming.activeCaptionTrackId)
    : next.captionTracks[0]?.id ?? null;

  const activeTrack =
    next.captionTracks.find((track) => track.id === next.activeCaptionTrackId) ??
    next.captionTracks[0] ??
    null;

  if (activeTrack) {
    next.captionSegments = cloneCaptionSegments(activeTrack.segments);
    next.captionText = next.captionSegments[0]?.text ?? next.captionText;
  }

  next.activeTransition = incoming.transitionType ?? 'crossfade';

  next.clipSegments = Array.isArray(incoming.clipSegments)
    ? incoming.clipSegments.map((segment) => ({ ...segment }))
    : [];

  next.activeBlendMode = incoming.blendMode ?? 'screen';

  next.masks = Array.isArray(incoming.masks) ? cloneMasks(incoming.masks) : [];

  if (incoming.playbackCurve) {
    next.playbackCurve = {
      p0: { ...incoming.playbackCurve.p0 },
      p1: { ...incoming.playbackCurve.p1 },
      p2: { ...incoming.playbackCurve.p2 },
      p3: { ...incoming.playbackCurve.p3 },
    };
  } else {
    next.playbackCurve = structuredClone(DEFAULT_PLAYBACK_CURVE);
  }

  next.cubeLut = incoming.cubeLut
    ? {
        size: incoming.cubeLut.size,
        values: [...incoming.cubeLut.values],
      }
    : null;

  next.captionSize = Number.isFinite(incoming.captionSize)
    ? Number(incoming.captionSize)
    : DEFAULT_CAPTION_STYLE.size;

  next.captionWeight = incoming.captionWeight ?? DEFAULT_CAPTION_STYLE.weight;
  next.captionBg = incoming.captionBg ?? DEFAULT_CAPTION_STYLE.background;
  next.captionShadow = typeof incoming.captionShadow === 'boolean'
    ? incoming.captionShadow
    : DEFAULT_CAPTION_STYLE.shadow;
  next.captionX = Number.isFinite(incoming.captionX)
    ? clampValue(Number(incoming.captionX), 0, 100)
    : DEFAULT_CAPTION_STYLE.x;
  next.captionY = Number.isFinite(incoming.captionY)
    ? clampValue(Number(incoming.captionY), 0, 100)
    : DEFAULT_CAPTION_STYLE.y;

  if (incoming.filters) {
    Object.assign(next.filters, DEFAULT_FILTERS, incoming.filters);
  }

  if (next.duration) {
    next.trimStart = clampValue(next.trimStart, 0, next.duration);
    next.trimEnd = clampValue(next.trimEnd || next.duration, next.trimStart, next.duration);

    if (next.trimEnd <= next.trimStart) {
      next.trimEnd = next.duration;
    }
  }

  return next;
}
