import type { ScannedPage } from './types';

export function createId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getPageCropBounds(
  page: Pick<ScannedPage, 'corners'>,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; width: number; height: number } {
  const [tl, tr, br, bl] = page.corners;

  const minX = clamp(Math.min(tl.x, bl.x), 0, 1) * imageWidth;
  const minY = clamp(Math.min(tl.y, tr.y), 0, 1) * imageHeight;
  const maxX = clamp(Math.max(tr.x, br.x), 0, 1) * imageWidth;
  const maxY = clamp(Math.max(bl.y, br.y), 0, 1) * imageHeight;

  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image'));

    image.src = src;
  });
}
