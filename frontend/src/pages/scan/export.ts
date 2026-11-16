import { appStore } from '../../appState';
import { processMediaOnServer } from '../../api';
import type { ExportFormat, ScannedPage } from './types';
import { getPageCropBounds, loadImage } from './utils';

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
    const crop = getPageCropBounds(page, image.naturalWidth, image.naturalHeight);

    const rotated = page.rotation % 180 !== 0;

    const canvas = document.createElement('canvas');
    const sourceWidth = crop.width;
    const sourceHeight = crop.height;

    canvas.width = rotated ? sourceHeight : sourceWidth;
    canvas.height = rotated ? sourceWidth : sourceHeight;

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
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight
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

  async function importRemote<T>(url: string): Promise<T> {
    return await import(/* @vite-ignore */ url);
  }

  async function exportPdf(
    renderedPages: HTMLCanvasElement[],
    filename: string
  ) {
    const { jsPDF } = await importRemote<any>('https://esm.sh/jspdf@4.2.1');

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

    const doc = new jsPDF({
      unit: 'pt',
      format: 'a4',
      orientation: renderedPages[0]?.width > renderedPages[0]?.height ? 'landscape' : 'portrait',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    renderedPages.forEach((canvas, index) => {
      const imgData = canvas.toDataURL('image/jpeg', getExportQuality());
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
      const drawWidth = imgWidth * ratio;
      const drawHeight = imgHeight * ratio;
      const x = (pageWidth - drawWidth) / 2;
      const y = (pageHeight - drawHeight) / 2;

      if (index > 0) {
        doc.addPage();
      }

      doc.addImage(imgData, 'JPEG', x, y, drawWidth, drawHeight, undefined, 'FAST');
    });

    // Generate reliable blob object URL for desktop and mobile download
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');

    link.href = pdfUrl;
    link.download = `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
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

    for (let index = 0; index < renderedPages.length; index++) {
      const canvas = renderedPages[index];
      
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas blob conversion failed'));
        }, mimeType, getExportQuality());
      });

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.download = renderedPages.length > 1
        ? `${filename}_page_${index + 1}.${extension}`
        : `${filename}.${extension}`;

      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      if (index < renderedPages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }

  async function triggerExport() {
    const pages = getPages();

    if (!pages.length || getDestroyed() || getIsExporting()) {
      setStatus('Nothing to export');
      return;
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
        await exportPdf(renderedPages, safeName);
      } else {
        await exportImages(renderedPages, safeName);
      }

      setStatus(`Export completed: ${safeName}`);
    } catch (error) {
      console.error('Export failed:', error);
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