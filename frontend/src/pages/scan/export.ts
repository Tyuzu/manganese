import { appStore } from '../../appState';
import { processMediaOnServer } from '../../api';
import type { ExportFormat, ScannedPage } from './types';
import { loadImage } from './utils';

export interface ScanExportDependencies {
  getPages: () => ScannedPage[];
  getCurrentMode: () => string;
  getExportFormat: () => ExportFormat;
  getExportQuality: () => number;
  getFilename: () => string;
  setStatus: (message: string) => void;
  renderToolControls: () => void;
  getDestroyed: () => boolean;
  computeCssFilter: (page: ScannedPage) => string;
  getIsExporting: () => boolean;
  setIsExporting: (value: boolean) => void;
}

export function createScanExporter({
  getPages,
  getCurrentMode,
  getExportFormat,
  getExportQuality,
  getFilename,
  setStatus,
  renderToolControls,
  getDestroyed,
  computeCssFilter,
  getIsExporting,
  setIsExporting,
}: ScanExportDependencies) {
  async function renderPageToCanvas(
    page: ScannedPage
  ): Promise<HTMLCanvasElement> {
    const image = await loadImage(page.dataUrl);

    const rotated = page.rotation % 180 !== 0;

    const canvas = document.createElement('canvas');

    canvas.width = rotated ? image.naturalHeight : image.naturalWidth;
    canvas.height = rotated ? image.naturalWidth : image.naturalHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas unavailable');
    }

    context.filter = computeCssFilter(page);

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((page.rotation * Math.PI) / 180);
    context.scale(page.flipX ? -1 : 1, 1);

    context.drawImage(
      image,
      -image.naturalWidth / 2,
      -image.naturalHeight / 2
    );

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.filter = 'none';

    if (page.watermarkText) {
      context.save();

      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(-Math.PI / 6);

      const fontSize = Math.max(24, canvas.width * 0.055);

      context.font = `900 ${fontSize}px sans-serif`;
      context.fillStyle = `rgba(255,255,255,${(page.watermarkOpacity ?? 15) / 100})`;
      context.textAlign = 'center';
      context.fillText(page.watermarkText, 0, 0);

      context.restore();
    }

    if (page.signatureDataUrl) {
      const signature = await loadImage(page.signatureDataUrl);

      const signatureWidth = Math.min(
        canvas.width * 0.3,
        signature.naturalWidth
      );

      const signatureHeight =
        signatureWidth * (signature.naturalHeight / signature.naturalWidth);

      context.drawImage(
        signature,
        canvas.width - signatureWidth - 30,
        canvas.height - signatureHeight - 30,
        signatureWidth,
        signatureHeight
      );
    }

    return canvas;
  }

  async function exportPdf(
    renderedPages: HTMLCanvasElement[],
    filename: string,
    preOpenedWindow?: Window | null
  ) {
    if ((appStore.getState().mediaProcessingMode ?? 'browser') === 'server') {
      for (let index = 0; index < renderedPages.length; index++) {
        const canvas = renderedPages[index];

        await processMediaOnServer({
          operation: 'scan-export',
          mediaType: 'scan',
          fileName: `${filename}_page_${index + 1}.png`,
          dataUrl: canvas.toDataURL('image/png'),
          mode: 'server',
          metadata: {
            exportFormat: 'pdf',
            pageNumber: index + 1,
            pageCount: renderedPages.length,
            mode: getCurrentMode(),
          },
        });
      }
      return;
    }

    // Use pre-opened window or open one now
    const printWindow = preOpenedWindow || window.open('', '_blank');

    if (!printWindow) {
      throw new Error('Popup blocker prevented export. Please allow popups for this site.');
    }

    const pageMarkup = renderedPages.map((canvas, index) => {
      return `<section class="page"><img src="${canvas.toDataURL('image/jpeg', getExportQuality())}" alt="Page ${index + 1}"></section>`;
    }).join('');

    printWindow.document.open();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${filename}</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; }
          .page {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            page-break-after: always;
            break-after: page;
          }
          .page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .page img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          @page { margin: 0; size: auto; }
          @media print {
            html, body { width: 100%; height: 100%; }
            .page { width: 100%; height: 100vh; }
          }
        </style>
      </head>
      <body>
        ${pageMarkup}
        <script>
          // Wait for all images to fully load before triggering print dialog
          window.addEventListener('load', () => {
            const images = document.querySelectorAll('img');
            let loadedCount = 0;
            if (images.length === 0) {
              window.print();
              return;
            }
            images.forEach(img => {
              if (img.complete) {
                loadedCount++;
                if (loadedCount === images.length) setTimeout(() => window.print(), 200);
              } else {
                img.onload = () => {
                  loadedCount++;
                  if (loadedCount === images.length) setTimeout(() => window.print(), 200);
                };
                img.onerror = () => {
                  loadedCount++;
                  if (loadedCount === images.length) setTimeout(() => window.print(), 200);
                };
              }
            });
          });
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  async function exportImages(
    renderedPages: HTMLCanvasElement[],
    filename: string
  ) {
    const mimeType = getExportFormat() === 'png' ? 'image/png' : 'image/jpeg';
    const extension = getExportFormat();

    if ((appStore.getState().mediaProcessingMode ?? 'browser') === 'server') {
      for (let index = 0; index < renderedPages.length; index++) {
        await processMediaOnServer({
          operation: 'scan-export',
          mediaType: 'scan',
          fileName: `${filename}_page_${index + 1}.${extension}`,
          dataUrl: renderedPages[index].toDataURL(
            mimeType,
            getExportQuality()
          ),
          mode: 'server',
          metadata: {
            exportFormat: getExportFormat(),
            quality: getExportQuality(),
            pageNumber: index + 1,
            pageCount: renderedPages.length,
            mode: getCurrentMode(),
          },
        });
      }
      return;
    }

    // Download sequentially with a small delay to prevent browser popup blockers from flagging multi-file downloads
    for (let index = 0; index < renderedPages.length; index++) {
      const canvas = renderedPages[index];
      const link = document.createElement('a');

      link.download = renderedPages.length > 1
        ? `${filename}_page_${index + 1}.${extension}`
        : `${filename}.${extension}`;

      link.href = canvas.toDataURL(mimeType, getExportQuality());
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (index < renderedPages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  async function triggerExport() {
    const pages = getPages();

    if (!pages.length || getDestroyed() || getIsExporting()) {
      setStatus('Nothing to export');
      return;
    }

    // CRITICAL: Pre-open print window synchronously if export format is PDF to preserve user gesture context
    let preOpenedWindow: Window | null = null;
    if (getExportFormat() === 'pdf' && (appStore.getState().mediaProcessingMode ?? 'browser') !== 'server') {
      preOpenedWindow = window.open('about:blank', '_blank');
      if (!preOpenedWindow) {
        setStatus('Popup blocker prevented export. Please allow popups.');
        return;
      }
      preOpenedWindow.document.write('<!DOCTYPE html><html><head><title>Preparing export...</title></head><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;"><h3 style="color:#64748b;">Rendering document pages for PDF export...</h3></body></html>');
    }

    setIsExporting(true);
    renderToolControls();

    try {
      const safeName = (getFilename().trim() || 'Scan')
        .replace(/[<>:"/\\|?*]/g, '_');

      setStatus('Rendering document...');

      const renderedPages: HTMLCanvasElement[] = [];

      for (const page of pages) {
        renderedPages.push(await renderPageToCanvas(page));
      }

      if (getExportFormat() === 'pdf') {
        await exportPdf(renderedPages, safeName, preOpenedWindow);
      } else {
        if (preOpenedWindow) {
          preOpenedWindow.close();
        }
        await exportImages(renderedPages, safeName);
      }

      setStatus(`Export completed: ${safeName}`);
    } catch (error) {
      console.error('Export failed:', error);
      if (preOpenedWindow) {
        try { preOpenedWindow.close(); } catch {}
      }
      setStatus('Export failed');
    } finally {
      setIsExporting(false);

      if (!getDestroyed()) {
        renderToolControls();
      }
    }
  }

  return {
    renderPageToCanvas,
    exportPdf,
    exportImages,
    triggerExport,
  };
}