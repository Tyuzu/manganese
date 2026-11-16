import type { ScanTab, ScannedPage } from './types';
import { clamp, loadImage } from './utils';

export interface ScanCropDependencies {
  getActivePage: () => ScannedPage | null;
  renderStagePreview: () => void;
  renderAll: () => void;
  persistState: () => void;
  switchTab: (tab: ScanTab) => void;
  setStatus: (message: string) => void;
  getActiveCornerIndex: () => number | null;
  setActiveCornerIndex: (index: number | null) => void;
}

export function createScanCropper({
  getActivePage,
  renderStagePreview,
  renderAll,
  persistState,
  switchTab,
  setStatus,
  getActiveCornerIndex,
  setActiveCornerIndex,
}: ScanCropDependencies) {
  function renderCropOverlay(
    wrapper: HTMLElement,
    image: HTMLImageElement,
    page: ScannedPage
  ) {
    wrapper.querySelector('.scan-crop-overlay')?.remove();

    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.classList.add('scan-crop-overlay');
    overlay.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    
    // CRITICAL FIX: Prevent mobile browser default touch pan/zoom/scroll gestures
    overlay.style.touchAction = 'none';

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.classList.add('scan-crop-polygon');

    const updatePolygonAndHandles = () => {
      const currentRect = image.getBoundingClientRect();
      const currentPoints = page.corners.map((point) => ({
        x: point.x * currentRect.width,
        y: point.y * currentRect.height,
      }));

      polygon.setAttribute(
        'points',
        currentPoints.map((point) => `${point.x},${point.y}`).join(' ')
      );

      handles.forEach((handle, i) => {
        handle.setAttribute('cx', String(currentPoints[i].x));
        handle.setAttribute('cy', String(currentPoints[i].y));
      });
    };

    const initialPoints = page.corners.map((point) => ({
      x: point.x * rect.width,
      y: point.y * rect.height,
    }));

    polygon.setAttribute(
      'points',
      initialPoints.map((point) => `${point.x},${point.y}`).join(' ')
    );
    overlay.append(polygon);

    const handles: SVGCircleElement[] = [];

    initialPoints.forEach((point, index) => {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', String(point.x));
      handle.setAttribute('cy', String(point.y));
      handle.setAttribute('r', '12'); // Generous touch target for mobile
      handle.classList.add('scan-crop-handle');
      handle.style.pointerEvents = 'auto';
      handle.style.touchAction = 'none';

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();

        setActiveCornerIndex(index);
        handle.setPointerCapture(event.pointerId);
      });

      handle.addEventListener('pointermove', (event) => {
        if (getActiveCornerIndex() !== index) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        const currentRect = image.getBoundingClientRect();
        if (!currentRect.width || !currentRect.height) return;

        page.corners[index] = {
          x: clamp(
            (event.clientX - currentRect.left) / currentRect.width,
            0,
            1
          ),
          y: clamp(
            (event.clientY - currentRect.top) / currentRect.height,
            0,
            1
          ),
        };

        // Directly update SVG DOM without tearing down preview/handles
        updatePolygonAndHandles();
      });

      const finishDrag = (event: PointerEvent) => {
        if (getActiveCornerIndex() === index) {
          event.preventDefault();
          event.stopPropagation();

          try {
            if (handle.hasPointerCapture(event.pointerId)) {
              handle.releasePointerCapture(event.pointerId);
            }
          } catch {
            // Ignore capture release errors
          }

          setActiveCornerIndex(null);
          renderStagePreview();
          persistState();
        }
      };

      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', finishDrag);

      handles.push(handle);
      overlay.append(handle);
    });

    wrapper.append(overlay);
  }

  async function applyPerspectiveCrop() {
    const page = getActivePage();
    if (!page) {
      setStatus('No page selected');
      return;
    }

    setStatus('Applying crop...');

    try {
      const image = await loadImage(page.dataUrl);
      const [tl, tr, br, bl] = page.corners;

      const sourceWidth = image.naturalWidth;
      const sourceHeight = image.naturalHeight;

      const minX = clamp(Math.min(tl.x, bl.x), 0, 1) * sourceWidth;
      const minY = clamp(Math.min(tl.y, tr.y), 0, 1) * sourceHeight;
      const maxX = clamp(Math.max(tr.x, br.x), 0, 1) * sourceWidth;
      const maxY = clamp(Math.max(bl.y, br.y), 0, 1) * sourceHeight;

      const width = Math.max(1, Math.round(maxX - minX));
      const height = Math.max(1, Math.round(maxY - minY));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas rendering context unavailable');
      }

      context.drawImage(
        image,
        minX,
        minY,
        width,
        height,
        0,
        0,
        width,
        height
      );

      page.dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      page.corners = [
        { x: 0.05, y: 0.05 },
        { x: 0.95, y: 0.05 },
        { x: 0.95, y: 0.95 },
        { x: 0.05, y: 0.95 },
      ];

      renderAll();
      switchTab('filters');
      persistState();
      setStatus('Crop applied successfully');
    } catch (error) {
      console.error('Crop failed:', error);
      setStatus('Crop failed');
    }
  }

  return {
    renderCropOverlay,
    applyPerspectiveCrop,
  };
}