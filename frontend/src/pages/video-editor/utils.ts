import type { MaskItem, TimedCaption } from './types';

export function clampValue(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return min;

  return Math.min(max, Math.max(min, value));
}

export function cloneCaptionSegments(
  segments: TimedCaption[],
): TimedCaption[] {
  return segments.map((segment) => ({
    ...segment,
    style: { ...segment.style },
  }));
}

export function cloneMasks(source: MaskItem[]): MaskItem[] {
  return source.map((mask) => ({
    ...mask,
    points: mask.points.map((point) => ({ ...point })),
  }));
}

export function cubicBezierValue(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number {
  const kT = clampValue(t, 0, 1);

  const u = 1 - kT;
  const tt = kT * kT;
  const uu = u * u;

  return (
    uu * u * p0 +
    3 * uu * kT * p1 +
    3 * u * tt * p2 +
    tt * kT * p3
  );
}

export function parseSubtitleTimestamp(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length < 2 || parts.length > 3) return 0;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    seconds = Number(parts[2]);
  } else {
    minutes = Number(parts[0]);
    seconds = Number(parts[1]);
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(
    0,
    Number.isFinite(seconds) ? seconds : 0,
  );

  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);

  return (
    `${String(mins).padStart(2, '0')}:` +
    `${String(secs).padStart(2, '0')}`
  );
}

export function formatCaptionTimestamp(seconds: number): string {
  const safeSeconds = Math.max(
    0,
    Number.isFinite(seconds) ? seconds : 0,
  );

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);

  return (
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:` +
    `${String(wholeSeconds).padStart(2, '0')},` +
    `${String(milliseconds).padStart(3, '0')}`
  );
}
