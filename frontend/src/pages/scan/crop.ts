import type { ScanTab, ScannedPage } from './types';
import { clamp, getPageCropBounds, loadImage } from './utils';

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
    overlay.style.touchAction = 'none';

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.classList.add('scan-crop-polygon');
    overlay.append(polygon);

    // 4 Corners: [TL (0), TR (1), BR (2), BL (3)]
    // 4 Sides (midpoints): Top (4: between TL & TR), Right (5: between TR & BR), Bottom (6: between BR & BL), Left (7: between BL & TL)

    const updatePolygonAndHandles = () => {
      const currentRect = image.getBoundingClientRect();
      const points = page.corners.map((point) => ({
        x: point.x * currentRect.width,
        y: point.y * currentRect.height,
      }));

      polygon.setAttribute(
        'points',
        points.map((point) => `${point.x},${point.y}`).join(' ')
      );

      // Update 4 corner handles (0-3)
      cornerHandles.forEach((handle, i) => {
        handle.setAttribute('cx', String(points[i].x));
        handle.setAttribute('cy', String(points[i].y));
      });

      // Update 4 side midpoint handles (4-7)
      const midpoints = [
        { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }, // Top (0-1)
        { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 }, // Right (1-2)
        { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 }, // Bottom (2-3)
        { x: (points[3].x + points[0].x) / 2, y: (points[3].y + points[0].y) / 2 }, // Left (3-0)
      ];

      sideHandles.forEach((handle, i) => {
        handle.setAttribute('cx', String(midpoints[i].x));
        handle.setAttribute('cy', String(midpoints[i].y));
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

    const cornerHandles: SVGCircleElement[] = [];
    const sideHandles: SVGCircleElement[] = [];

    // --- Create 4 Corner Handles ---
    initialPoints.forEach((point, index) => {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', String(point.x));
      handle.setAttribute('cy', String(point.y));
      handle.setAttribute('r', '12');
      handle.classList.add('scan-crop-handle', 'scan-corner-handle');
      handle.style.pointerEvents = 'auto';
      handle.style.touchAction = 'none';

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveCornerIndex(index);
        handle.setPointerCapture(event.pointerId);
      });

      handle.addEventListener('pointermove', (event) => {
        if (getActiveCornerIndex() !== index) return;
        event.preventDefault();
        event.stopPropagation();

        const currentRect = image.getBoundingClientRect();
        if (!currentRect.width || !currentRect.height) return;

        page.corners[index] = {
          x: clamp((event.clientX - currentRect.left) / currentRect.width, 0, 1),
          y: clamp((event.clientY - currentRect.top) / currentRect.height, 0, 1),
        };

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
          } catch { }
          setActiveCornerIndex(null);
          renderStagePreview();
          persistState();
        }
      };

      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', finishDrag);

      cornerHandles.push(handle);
      overlay.append(handle);
    });

    // --- Create 4 Side-Drag Handles ---
    // Mapping: 0 = Top (corners 0,1), 1 = Right (corners 1,2), 2 = Bottom (corners 2,3), 3 = Left (corners 3,0)
    const sideMappings = [
      { c1: 0, c2: 1 }, // Top
      { c1: 1, c2: 2 }, // Right
      { c1: 2, c2: 3 }, // Bottom
      { c1: 3, c2: 0 }, // Left
    ];

    sideMappings.forEach((side, sideIndex) => {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const midpointX = (initialPoints[side.c1].x + initialPoints[side.c2].x) / 2;
      const midpointY = (initialPoints[side.c1].y + initialPoints[side.c2].y) / 2;

      handle.setAttribute('cx', String(midpointX));
      handle.setAttribute('cy', String(midpointY));
      handle.setAttribute('r', '10');
      handle.classList.add('scan-crop-handle', 'scan-side-handle');
      handle.style.pointerEvents = 'auto';
      handle.style.touchAction = 'none';

      let lastClientX = 0;
      let lastClientY = 0;

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        lastClientX = event.clientX;
        lastClientY = event.clientY;
        setActiveCornerIndex(4 + sideIndex); // Offset to distinguish side handles
        handle.setPointerCapture(event.pointerId);
      });

      handle.addEventListener('pointermove', (event) => {
        if (getActiveCornerIndex() !== 4 + sideIndex) return;
        event.preventDefault();
        event.stopPropagation();

        const currentRect = image.getBoundingClientRect();
        if (!currentRect.width || !currentRect.height) return;

        const dx = (event.clientX - lastClientX) / currentRect.width;
        const dy = (event.clientY - lastClientY) / currentRect.height;
        lastClientX = event.clientX;
        lastClientY = event.clientY;

        // Move both connected corners by the delta (dx, dy)
        page.corners[side.c1] = {
          x: clamp(page.corners[side.c1].x + dx, 0, 1),
          y: clamp(page.corners[side.c1].y + dy, 0, 1),
        };
        page.corners[side.c2] = {
          x: clamp(page.corners[side.c2].x + dx, 0, 1),
          y: clamp(page.corners[side.c2].y + dy, 0, 1),
        };

        updatePolygonAndHandles();
      });

      const finishSideDrag = (event: PointerEvent) => {
        if (getActiveCornerIndex() === 4 + sideIndex) {
          event.preventDefault();
          event.stopPropagation();
          try {
            if (handle.hasPointerCapture(event.pointerId)) {
              handle.releasePointerCapture(event.pointerId);
            }
          } catch { }
          setActiveCornerIndex(null);
          persistState();
        }
      };

      handle.addEventListener('pointerup', finishSideDrag);
      handle.addEventListener('pointercancel', finishSideDrag);

      sideHandles.push(handle);
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
      const crop = getPageCropBounds(page, image.naturalWidth, image.naturalHeight);

      const canvas = document.createElement('canvas');
      canvas.width = crop.width;
      canvas.height = crop.height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas rendering context unavailable');
      }

      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
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