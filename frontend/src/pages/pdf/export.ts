import { appStore } from '../../appState';
import { processMediaOnServer } from '../../api';
import type { ExportFormat, ScannerPageItem } from './types';

export interface PdfExportDependencies {
  getBaseName: () => string;
  getUploadedFile: () => File | null;
  getUploadedFileType: () => 'pdf' | 'image' | null;
  getPages: () => ScannerPageItem[];
  getOcrEnabled: () => boolean;
  getOcrLanguage: () => string;
  getDeskewAngle: () => number;
  getBrightness: () => number;
  getContrast: () => number;
  getGrayscale: () => number;
  getExtractedText: () => string;
  showToast: (message: string, variant?: 'info' | 'success') => void;
}

export function createPdfExporter({
  getBaseName,
  getUploadedFile,
  getUploadedFileType,
  getPages,
  getOcrEnabled,
  getOcrLanguage,
  getDeskewAngle,
  getBrightness,
  getContrast,
  getGrayscale,
  getExtractedText,
  showToast,
}: PdfExportDependencies) {
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;

    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Unable to read document'));
        }
      };

      reader.onerror = () => reject(
        reader.error || new Error('File read failed'),
      );

      reader.readAsDataURL(file);
    });
  }

  async function triggerExport(format: ExportFormat) {
    const uploadedFile = getUploadedFile();

    if (!uploadedFile) {
      showToast('Upload a document before exporting');
      return;
    }

    const baseName = getBaseName();

    if (format === 'txt') {
      const blob = new Blob([getExtractedText()], {
        type: 'text/plain;charset=utf-8',
      });

      downloadBlob(blob, `${baseName}-ocr.txt`);

      showToast('Text file exported', 'success');
      return;
    }

    const processingMode =
      appStore.getState().mediaProcessingMode ?? 'browser';

    if (processingMode === 'server') {
      try {
        const dataUrl = await fileToDataUrl(uploadedFile);

        const result = await processMediaOnServer({
          operation: 'pdf-export',
          mediaType: 'pdf',
          fileName: `${baseName}-edited.${format}`,
          dataUrl,
          mode: 'server',
          metadata: {
            format,
            pageCount: getPages().length,
            ocrEnabled: getOcrEnabled(),
            language: getOcrLanguage(),
            deskewAngle: getDeskewAngle(),
            brightness: getBrightness(),
            contrast: getContrast(),
            grayscale: getGrayscale(),
            pages: getPages().map((page) => ({
              id: page.id,
              title: page.title,
              rotation: page.rotation,
              isBlank: page.isBlank ?? false,
            })),
          },
        });

        console.info('PDF export response:', result);

        showToast('Document sent for server processing', 'success');
        return;
      } catch (error) {
        console.error('PDF processing failed:', error);
        showToast('Server processing failed');
        return;
      }
    }

    const uploadedFileType = getUploadedFileType();

    if (format === 'pdf' && uploadedFileType === 'pdf') {
      downloadBlob(uploadedFile, `${baseName}-edited.pdf`);

      showToast(
        'Original PDF downloaded. Preview adjustments are not embedded in browser export.',
        'success',
      );

      return;
    }

    if (format === 'jpg' && uploadedFileType === 'image') {
      downloadBlob(uploadedFile, `${baseName}-edited.jpg`);

      showToast(
        'Original image downloaded. Preview adjustments are not embedded in browser export.',
        'success',
      );

      return;
    }

    showToast('This export format requires server-side document conversion.');
  }

  return {
    triggerExport,
    downloadBlob,
    fileToDataUrl,
  };
}
