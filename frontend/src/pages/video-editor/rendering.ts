import type { MaskItem, TimedCaption } from './types';
import { clampValue } from './utils';

export function parseCubeLut(
  rawText: string,
): { size: number; values: number[] } | null {
  const lines = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  let size: number | null = null;

  const values: number[] = [];

  for (const line of lines) {
    if (line.startsWith('LUT_3D_SIZE')) {
      const match = line.match(/LUT_3D_SIZE\s+(\d+)/);

      if (match) {
        size = Number(match[1]);
      }

      continue;
    }

    if (
      line.startsWith('TITLE') ||
      line.startsWith('DOMAIN_') ||
      line.startsWith('LUT_1D_SIZE')
    ) {
      continue;
    }

    const parts = line.split(/\s+/);

    if (parts.length !== 3) continue;

    const numbers = parts.map(Number);

    if (!numbers.every(Number.isFinite)) continue;

    values.push(...numbers);
  }

  if (!size || size < 2 || values.length === 0) {
    return null;
  }

  if (values.length !== size * size * size * 3) {
    return null;
  }

  return {
    size,
    values,
  };
}

export function getSupportedRecorderMimeType(
  format: 'webm' | 'mp4',
): string | null {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  const candidates =
    format === 'mp4'
      ? [
          'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
          'video/mp4',
        ]
      : [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ];

  for (const mimeType of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export function getExportDimensions(
  exportResolution: '720p' | '1080p' | '4k',
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5',
): { width: number; height: number } {
  let width = 1920;
  let height = 1080;

  if (exportResolution === '720p') {
    width = 1280;
    height = 720;
  } else if (exportResolution === '4k') {
    width = 3840;
    height = 2160;
  }

  if (aspectRatio === '9:16') {
    [width, height] = [height, width];
  } else if (aspectRatio === '1:1') {
    width = Math.min(width, height);
    height = width;
  } else if (aspectRatio === '4:5') {
    height = Math.round(width * 1.25);
  }

  return { width, height };
}

export function drawExportMask(
  ctx: CanvasRenderingContext2D,
  mask: MaskItem,
  width: number,
  height: number,
) {
  ctx.save();

  ctx.globalAlpha = clampValue(mask.opacity, 0, 1);

  ctx.fillStyle = `${mask.color}55`;
  ctx.strokeStyle = mask.color;
  ctx.lineWidth = 3;

  const x = (mask.x / 100) * width;
  const y = (mask.y / 100) * height;

  const maskWidth = (mask.width / 100) * width;
  const maskHeight = (mask.height / 100) * height;

  if (mask.type === 'circle') {
    ctx.beginPath();

    ctx.ellipse(
      x,
      y,
      maskWidth / 2,
      maskHeight / 2,
      0,
      0,
      Math.PI * 2,
    );

    ctx.fill();
    ctx.stroke();
  } else if (mask.type === 'rect') {
    ctx.beginPath();

    ctx.roundRect(
      x - maskWidth / 2,
      y - maskHeight / 2,
      maskWidth,
      maskHeight,
      Math.max(0, mask.radius),
    );

    ctx.fill();
    ctx.stroke();
  } else if (mask.points.length > 2) {
    ctx.beginPath();

    mask.points.forEach((point, index) => {
      const pointX = (point.x / 100) * width;
      const pointY = (point.y / 100) * height;

      if (index === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    });

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function drawExportCaption(
  ctx: CanvasRenderingContext2D,
  caption: TimedCaption,
  width: number,
  height: number,
) {
  const style = caption.style;

  const fontSize = Math.max(
    18,
    style.size * (width / 1280),
  );

  const text = caption.text.trim();

  if (!text) return;

  ctx.save();

  ctx.font = `${style.weight} ${fontSize}px sans-serif`;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const x = (style.x / 100) * width;
  const y = (style.y / 100) * height;

  const maxTextWidth = width * 0.85;

  const words = text.split(/\s+/);

  const lines: string[] = [];

  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (
      currentLine &&
      ctx.measureText(candidate).width > maxTextWidth
    ) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const lineHeight = fontSize * 1.25;

  const maxLineWidth = Math.max(
    ...lines.map((line) => ctx.measureText(line).width),
  );

  const paddingX = fontSize * 0.8;
  const paddingY = fontSize * 0.45;

  const boxWidth = Math.min(
    width * 0.95,
    maxLineWidth + paddingX * 2,
  );

  const boxHeight =
    lines.length * lineHeight + paddingY * 2;

  if (style.background !== 'transparent') {
    ctx.fillStyle = style.background;

    ctx.fillRect(
      x - boxWidth / 2,
      y - boxHeight / 2,
      boxWidth,
      boxHeight,
    );
  }

  ctx.fillStyle = '#ffffff';

  if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
  }

  lines.forEach((line, index) => {
    const lineY =
      y +
      (index - (lines.length - 1) / 2) * lineHeight;

    ctx.fillText(line, x, lineY, maxTextWidth);
  });

  ctx.restore();
}

export function drawExportFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  videoElement: HTMLVideoElement,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
  masks: MaskItem[],
  getActiveCaption: () => TimedCaption | null,
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.save();

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  ctx.save();

  ctx.filter = videoElement.style.filter || 'none';

  ctx.translate(width / 2, height / 2);

  ctx.rotate((rotation * Math.PI) / 180);

  ctx.scale(
    flipH ? -1 : 1,
    flipV ? -1 : 1,
  );

  const sourceWidth = videoElement.videoWidth;
  const sourceHeight = videoElement.videoHeight;

  if (sourceWidth > 0 && sourceHeight > 0) {
    const sourceAspect = sourceWidth / sourceHeight;
    const outputAspect = width / height;

    let drawWidth: number;
    let drawHeight: number;

    if (sourceAspect > outputAspect) {
      drawWidth = width;
      drawHeight = width / sourceAspect;
    } else {
      drawHeight = height;
      drawWidth = height * sourceAspect;
    }

    ctx.drawImage(
      videoElement,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );
  }

  ctx.restore();

  masks.forEach((mask) => {
    drawExportMask(ctx, mask, width, height);
  });

  const activeCaption = getActiveCaption();

  if (activeCaption) {
    drawExportCaption(
      ctx,
      activeCaption,
      width,
      height,
    );
  }

  ctx.restore();
}
