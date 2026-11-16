import { div, input, label, span } from '../../components/ui/dom';
import type { ScanMode } from './controls';
import {
  type DocumentPreset,
  type ExportFormat,
  type FilterPreset,
  type ScanTab,
  type ScannedPage,
} from './types';

interface ScanTabBuilderOptions {
  activeTab: ScanTab;
  docPreset: DocumentPreset;
  exportFormat: ExportFormat;
  exportQuality: number;
  isExporting: boolean;
  isOcrProcessing: boolean;
  pages: ScannedPage[];
  scanName: string;
  getActivePage: () => ScannedPage | null;
  setStatus: (message: string) => void;
  makeButton: (
    text: string,
    className: string,
    onClick: () => void,
    disabled?: boolean
  ) => HTMLButtonElement;
  makePresetButton: (
    text: string,
    selected: boolean,
    onClick: () => void
  ) => HTMLButtonElement;
  makeSlider: (
    title: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void
  ) => HTMLDivElement;
  makeSectionTitle: (text: string) => HTMLParagraphElement;
  textElement: (text: string, className?: string) => HTMLParagraphElement;
  renderStagePreview: () => void;
  renderPageReel: () => void;
  persistState: () => void;
  onModeChange: (preset: DocumentPreset, mode: ScanMode, status: string) => void;
  onFilterChange: (page: ScannedPage, filter: FilterPreset, label: string) => void;
  onBrightnessChange: (page: ScannedPage, value: number) => void;
  onContrastChange: (page: ScannedPage, value: number) => void;
  onWatermarkChange: (page: ScannedPage, value: string) => void;
  onWatermarkOpacityChange: (page: ScannedPage, value: number) => void;
  onSignatureRemove: (page: ScannedPage) => void;
  onOpenSignaturePadModal: () => void;
  onApplyPerspectiveCrop: () => void;
  onRunTesseractOcr: () => void;
  onExportFormatChange: (format: ExportFormat) => void;
  onExportQualityChange: (value: number) => void;
  onExportNameChange: (value: string) => void;
  onClearStack: () => void;
  onAddPagesClick: () => void;
  onCopyExtractedText: (text: string) => void;
  onTriggerExport: () => void;
}

export function createScanTabBuilder(options: ScanTabBuilderOptions) {
  const createModeTab = (toolContainer: HTMLElement) => {
    const modes: {
      id: DocumentPreset;
      label: string;
      mode: ScanMode;
      status: string;
    }[] = [
      { id: 'pdf', label: 'PDF document', mode: 'pdf', status: 'PDF Document' },
      { id: 'id', label: 'ID / Passport', mode: 'pdf', status: 'ID Card Mode' },
      { id: 'ocr', label: 'Text recognition', mode: 'pdf', status: 'OCR Text Mode' },
      { id: 'photo', label: 'HD Photo', mode: 'photo', status: 'HD Photo' },
    ];

    const grid = div(
      { className: 'scan-preset-grid' },
      ...modes.map((mode) =>
        options.makePresetButton(
          mode.label,
          options.docPreset === mode.id,
          () => {
            options.onModeChange(mode.id, mode.mode, mode.status);
          }
        )
      )
    );

    toolContainer.append(
      options.makeSectionTitle('Document type'),
      grid
    );
  };

  const createFiltersTab = (toolContainer: HTMLElement) => {
    const page = options.getActivePage();
    if (!page) {
      toolContainer.append(
        options.makeSectionTitle('Enhancement presets'),
        div({ className: 'scan-info-card' }, options.textElement('Upload or capture a document to adjust filters and enhancement settings.'))
      );
      return;
    }

    const filters: { id: FilterPreset; label: string }[] = [
      { id: 'magic', label: 'Magic color' },
      { id: 'gray', label: 'Grayscale' },
      { id: 'bw', label: 'High contrast' },
      { id: 'original', label: 'Original' },
    ];

    const grid = div(
      { className: 'scan-preset-grid' },
      ...filters.map((filter) =>
        options.makePresetButton(
          filter.label,
          page.filter === filter.id,
          () => {
            options.onFilterChange(page, filter.id, filter.label);
          }
        )
      )
    );

    const sliders = div(
      { className: 'scan-control-card' },
      options.makeSlider(
        'Brightness',
        page.brightness,
        50,
        150,
        (value) => options.onBrightnessChange(page, value)
      ),
      options.makeSlider(
        'Contrast',
        page.contrast,
        50,
        200,
        (value) => options.onContrastChange(page, value)
      )
    );

    toolContainer.append(
      options.makeSectionTitle('Enhancement presets'),
      grid,
      options.makeSectionTitle('Image adjustments'),
      sliders
    );
  };

  const createCropTab = (toolContainer: HTMLElement) => {
    const page = options.getActivePage();
    toolContainer.append(
      options.makeSectionTitle('Perspective crop'),
      div(
        { className: 'scan-info-card' },
        options.textElement('Move the four corner handles on the preview to select document boundaries.'),
        options.textElement('The crop operation extracts and flattens the selected quadrilateral region.')
      ),
      options.makeButton(
        'Apply crop',
        'scan-button scan-button-primary scan-button-block',
        () => void options.onApplyPerspectiveCrop(),
        !page
      )
    );
  };

  const createSignTab = (toolContainer: HTMLElement) => {
    const page = options.getActivePage();
    if (!page) {
      toolContainer.append(
        options.makeSectionTitle('Security & Signature'),
        div({ className: 'scan-info-card' }, options.textElement('Upload a document first to add watermarks or signatures.'))
      );
      return;
    }

    const watermarkInput = input({
      type: 'text',
      value: page.watermarkText,
      placeholder: 'CONFIDENTIAL',
      className: 'scan-text-input',
      oninput: (event: Event) => {
        options.onWatermarkChange(page, (event.target as HTMLInputElement).value);
      },
    });

    toolContainer.append(
      options.makeSectionTitle('Security watermark'),
      div(
        { className: 'scan-control-card' },
        label(
          { className: 'scan-field-label' },
          'Watermark text',
          watermarkInput
        ),
        options.makeSlider(
          'Opacity',
          page.watermarkOpacity ?? 15,
          5,
          50,
          (value) => options.onWatermarkOpacityChange(page, value)
        )
      ),
      options.makeSectionTitle('Electronic signature'),
      div(
        { className: 'scan-control-card' },
        options.textElement(
          page.signatureDataUrl
            ? 'A signature is attached to this page.'
            : 'No signature attached.',
          'scan-muted-text'
        ),
        options.makeButton(
          page.signatureDataUrl ? 'Redraw signature' : 'Draw signature',
          'scan-button scan-button-primary scan-button-block',
          () => options.onOpenSignaturePadModal()
        ),
        page.signatureDataUrl
          ? options.makeButton(
              'Remove signature',
              'scan-button scan-button-danger scan-button-block',
              () => options.onSignatureRemove(page)
            )
          : null
      )
    );
  };

  const createOcrTab = (toolContainer: HTMLElement) => {
    const page = options.getActivePage();

    const output = div(
      { className: 'scan-ocr-output' },
      page?.extractedText ||
        (options.isOcrProcessing ? 'Recognizing text...' : 'No text extracted yet.')
    );

    const runButton = options.makeButton(
      options.isOcrProcessing ? 'Processing...' : 'Run text recognition',
      'scan-button scan-button-primary scan-button-block',
      () => void options.onRunTesseractOcr(),
      options.isOcrProcessing || !page
    );

    toolContainer.append(
      options.makeSectionTitle('Text recognition'),
      div(
        { className: 'scan-info-card' },
        options.textElement('Extract text locally from your document using Tesseract.js.'),
        runButton
      ),
      div(
        { className: 'scan-ocr-heading' },
        span({}, 'Extracted text'),
        page?.extractedText
          ? options.makeButton(
              'Copy',
              'scan-button scan-button-muted scan-button-small',
              () => options.onCopyExtractedText(page.extractedText || '')
            )
          : null
      ),
      output
    );
  };

  const createBatchTab = (toolContainer: HTMLElement) => {
    toolContainer.append(
      options.makeSectionTitle('Batch manager'),
      div(
        { className: 'scan-info-card' },
        options.textElement(`Pages in stack: ${options.pages.length}`),
        options.textElement('Add images, switch between pages, or remove individual pages.')
      ),
      options.makeButton(
        'Add pages',
        'scan-button scan-button-muted scan-button-block',
        () => options.onAddPagesClick()
      )
    );

    if (options.pages.length) {
      toolContainer.append(
        options.makeButton(
          'Clear entire stack',
          'scan-button scan-button-danger scan-button-block',
          () => options.onClearStack()
        )
      );
    }
  };

  const createExportTab = (toolContainer: HTMLElement) => {
    const nameInput = input({
      type: 'text',
      value: options.scanName,
      className: 'scan-text-input',
      placeholder: 'Document name',
      oninput: (event: Event) => {
        options.onExportNameChange((event.target as HTMLInputElement).value);
      },
    });

    const formatGrid = div(
      { className: 'scan-preset-grid scan-format-grid' },
      ...(['pdf', 'jpg', 'png'] as ExportFormat[]).map((format) =>
        options.makePresetButton(
          format.toUpperCase(),
          options.exportFormat === format,
          () => options.onExportFormatChange(format)
        )
      )
    );

    toolContainer.append(
      options.makeSectionTitle('Export document'),
      div(
        { className: 'scan-control-card' },
        label({ className: 'scan-field-label' }, 'File name', nameInput),
        label({ className: 'scan-field-label' }, 'Export format', formatGrid),
        options.makeSlider(
          'Image quality',
          Math.round(options.exportQuality * 100),
          40,
          100,
          (value) => options.onExportQualityChange(value / 100)
        ),
        options.makeButton(
          options.isExporting ? 'Exporting...' : `Export ${options.exportFormat.toUpperCase()}`,
          'scan-button scan-button-primary scan-button-block',
          () => void options.onTriggerExport(),
          options.isExporting || !options.pages.length
        )
      )
    );
  };

  return {
    createModeTab,
    createFiltersTab,
    createCropTab,
    createSignTab,
    createOcrTab,
    createBatchTab,
    createExportTab,
    renderTab: (toolContainer: HTMLElement) => {
      switch (options.activeTab) {
        case 'mode':
          createModeTab(toolContainer);
          break;
        case 'filters':
          createFiltersTab(toolContainer);
          break;
        case 'crop':
          createCropTab(toolContainer);
          break;
        case 'sign':
          createSignTab(toolContainer);
          break;
        case 'ocr':
          createOcrTab(toolContainer);
          break;
        case 'batch':
          createBatchTab(toolContainer);
          break;
        case 'export':
          createExportTab(toolContainer);
          break;
      }
    },
  };
}