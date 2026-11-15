import type { CaptionStyle, TimedCaption } from './types';
import {
  formatCaptionTimestamp,
  parseSubtitleTimestamp,
} from './utils';

export function parseSrtText(
  rawText: string,
  getCurrentCaptionStyle: () => CaptionStyle,
): TimedCaption[] {
  const cleaned = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .replace(/^WEBVTT[^\n]*\n/i, '')
    .trim();

  const blocks = cleaned
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments: TimedCaption[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');

    const timeIndex = lines.findIndex((line) =>
      line.includes('-->'),
    );

    if (timeIndex < 0) continue;

    const timeMatch = lines[timeIndex].match(
      /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})/,
    );

    if (!timeMatch) continue;

    const start = parseSubtitleTimestamp(timeMatch[1]);
    const end = parseSubtitleTimestamp(timeMatch[2]);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }

    if (end <= start) continue;

    const text = lines
      .slice(timeIndex + 1)
      .join('\n')
      .trim();

    if (!text) continue;

    segments.push({
      id: segments.length + 1,
      start,
      end,
      text,
      style: getCurrentCaptionStyle(),
    });
  }

  return segments.sort((a, b) => a.start - b.start);
}

export function buildSrtFromSegments(
  segments: TimedCaption[],
  formatter: (seconds: number) => string = formatCaptionTimestamp,
): string {
  return segments
    .map((segment, index) => {
      return (
        `${index + 1}\n` +
        `${formatter(segment.start)} --> ` +
        `${formatter(segment.end)}\n` +
        `${segment.text.trim()}`
      );
    })
    .join('\n\n');
}
