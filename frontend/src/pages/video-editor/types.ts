export type VideoTab =
  | 'timeline'
  | 'filters'
  | 'transform'
  | 'audio'
  | 'captions'
  | 'export';

export type ClipTransition =
  | 'none'
  | 'crossfade'
  | 'dip-to-black'
  | 'wipe'
  | 'slide';

export type BlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'soft-light';

export type MaskType = 'circle' | 'rect' | 'freehand';

export interface CaptionStyle {
  size: number;
  weight: string;
  background: string;
  shadow: boolean;
  x: number;
  y: number;
}

export interface TimedCaption {
  id: number;
  start: number;
  end: number;
  text: string;
  style: CaptionStyle;
}

export interface AudioTrack {
  id: number;
  label: string;
  fileName: string;
  dataUrl: string | null;
  volume: number;
  trimStart: number;
  trimEnd: number;
  enabled: boolean;
}

export interface CaptionTrack {
  id: number;
  label: string;
  color: string;
  enabled: boolean;
  segments: TimedCaption[];
}

export interface TimelineClipSegment {
  id: number;
  start: number;
  end: number;
  label: string;
}

export interface MaskItem {
  id: number;
  type: MaskType;
  points: Array<{ x: number; y: number }>;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  feather: number;
  opacity: number;
  blur: number;
  color: string;
}

export interface PlaybackCurve {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

export interface VideoFilters {
  exposure: number;
  brightness: number;
  contrast: number;
  saturate: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  blur: number;
  sharpen: number;
  grayscale: number;
  sepia: number;
  vignette: number;
  filmGrain: number;
  fade: number;
}

export interface VideoEditorState {
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  previewQuality: '1' | '0.5' | '0.25';
  captionText: string;
  captionSegments: TimedCaption[];
  audioTracks: AudioTrack[];
  captionTracks: CaptionTrack[];
  activeCaptionTrackId: number | null;
  transitionType: ClipTransition;
  clipSegments: TimelineClipSegment[];
  blendMode: BlendMode;
  masks: MaskItem[];
  playbackCurve: PlaybackCurve;
  cubeLut: { size: number; values: number[] } | null;
  captionSize: number;
  captionWeight: string;
  captionBg: string;
  captionShadow: boolean;
  captionX: number;
  captionY: number;
  filters: VideoFilters;
}

export interface StoredProject {
  id: string;
  videoDataUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  savedAt: number;
  state: Partial<VideoEditorState>;
}

export const DEFAULT_FILTERS: VideoFilters = {
  exposure: 100,
  brightness: 100,
  contrast: 100,
  saturate: 100,
  temperature: 0,
  tint: 0,
  highlights: 100,
  shadows: 100,
  blur: 0,
  sharpen: 0,
  grayscale: 0,
  sepia: 0,
  vignette: 0,
  filmGrain: 0,
  fade: 0,
};

export const DEFAULT_PLAYBACK_CURVE: PlaybackCurve = {
  p0: { x: 0, y: 0 },
  p1: { x: 0.2, y: 1 },
  p2: { x: 0.8, y: 1 },
  p3: { x: 1, y: 0 },
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  size: 20,
  weight: '700',
  background: 'rgba(0,0,0,0.6)',
  shadow: true,
  x: 50,
  y: 85,
};

export const PROJECT_DATABASE = 'dolomite-video-editor';
export const PROJECT_STORE = 'video-editor-state';
export const PROJECT_ID = 'current-project';
