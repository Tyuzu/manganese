import '../../css/pdf.css';
import {
  createButton,
  div,
  input,
  label,
  p,
  span,
  strong,
} from '../components/ui/dom';

import {
  createEditorFooter,
  createEditorShell,
  createEditorTabNav,
  createPresetButton,
  createSliderControl,
} from './shared';
import {
  OCR_LANGUAGES,
  TABS,
  type ExportFormat,
  type MergeQueueItem,
  type ScanPreset,
  type ScanTab,
  type ScannerPageItem,
} from './pdf/types';
import { createPdfExporter } from './pdf/export';
import {
  createPdfQuickActions,
  createPdfStageHud,
} from './pdf/controls';
import { createControlGroup, createSectionTitle } from './pdf/helpers';
import { applyPdfToolPanel } from './pdf/panels';
import {
  createMergeQueueEntry,
  createPageThumbnailItem,
  createSummaryPanel,
} from './pdf/ui';
import { createIcon, createId, getFileType } from './pdf/utils';

async function importRemote<T>(url: string): Promise<T> {
  return await import(/* @vite-ignore */ url);
}

async function getPdfJsModule() {
  const pdfjsModule = await importRemote<any>('https://esm.sh/pdfjs-dist@6.5.438');
  pdfjsModule.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsModule.version}/pdf.worker.min.mjs`;
  return pdfjsModule;
}

export async function createPdfScannerPage(): Promise<HTMLElement> {
  let activeTab: ScanTab = 'pages';

  let uploadedFile: File | null = null;
  let uploadedFileName: string | null = null;
  let uploadedFileUrl: string | null = null;
  let uploadedFileType: 'pdf' | 'image' | null = null;
  let pdfDocProxy: any = null;

  let pages: ScannerPageItem[] = [];
  let selectedPageIndex = 0;

  let brightness = 100;
  let contrast = 100;
  let grayscale = 0;
  let scanPreset: ScanPreset = 'original';

  let deskewAngle = 0;
  let zoomLevel = 100;

  let ocrEnabled = true;
  let ocrLanguage = 'eng';
  let extractedText =
    'Upload a document or click "Run OCR" to extract searchable text...';

  let mergeQueue: MergeQueueItem[] = [];
  let destroyed = false;

  // --------------------------------------------------
  // Utilities
  // --------------------------------------------------

  function showToast(
    message: string,
    variant: 'info' | 'success' = 'info',
  ) {
    if (destroyed) return;
    const toast = div(
      {
        className: `pdf-toast ${variant === 'success' ? 'is-success' : 'is-info'}`,
      },
      message,
    );

    toastContainer.append(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 250);
    }, 2600);
  }

  function getActivePage() {
    return pages[selectedPageIndex] ?? null;
  }

  function getBaseName() {
    return (uploadedFileName || 'scanned-document').replace(/\.[^/.]+$/, '');
  }

  const pdfExporter = createPdfExporter({
    getBaseName,
    getUploadedFile: () => uploadedFile,
    getUploadedFileType: () => uploadedFileType,
    getPages: () => pages,
    getOcrEnabled: () => ocrEnabled,
    getOcrLanguage: () => ocrLanguage,
    getDeskewAngle: () => deskewAngle,
    getBrightness: () => brightness,
    getContrast: () => contrast,
    getGrayscale: () => grayscale,
    getExtractedText: () => extractedText,
    showToast,
  });

  const triggerExport = (format: ExportFormat) =>
    pdfExporter.triggerExport(format);

  // --------------------------------------------------
  // Notifications
  // --------------------------------------------------

  const toastContainer = div({
    className: 'pdf-toast-container',
  });

  // --------------------------------------------------
  // File inputs
  // --------------------------------------------------

  const fileInput = input({
    type: 'file',
    accept: '.pdf,image/png,image/jpeg,image/webp',
    className: 'pdf-hidden-input',
    onchange: (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (file) {
        void loadDocumentFile(file);
      }

      target.value = '';
    },
  });

  const mergeFileInput = input({
    type: 'file',
    accept: '.pdf,image/png,image/jpeg,image/webp',
    multiple: true,
    className: 'pdf-hidden-input',
    onchange: (event: Event) => {
      const target = event.target as HTMLInputElement;

      if (!target.files?.length) {
        return;
      }

      const files = Array.from(target.files);

      files.forEach((file) => {
        mergeQueue.push({
          id: createId('merge'),
          name: file.name,
          sizeMB: (file.size / 1024 / 1024).toFixed(2),
          estimatedPages: getFileType(file) === 'pdf' ? 2 : 1,
          file,
        });
      });

      showToast(`${files.length} file(s) added to queue`, 'success');

      renderToolControls();
      target.value = '';
    },
  });

  // --------------------------------------------------
  // Quick actions
  // --------------------------------------------------

  const pageCounter = span(
    { className: 'pdf-page-counter' },
    'Page 1 / 1',
  );

  const documentName = span(
    { className: 'pdf-document-name' },
    'No document loaded',
  );

  const quickActions = createPdfQuickActions({
    pageCounter,
    documentName,
    onUpload: () => fileInput.click(),
    onExport: () => triggerExport('pdf'),
  });

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------

  const sidePanelNav = createEditorTabNav(
    TABS,
    activeTab,
    (tabId) => switchTab(tabId),
    {
      activeClassName: 'pdf-tab-active',
      inactiveClassName: 'pdf-tab-inactive',
      containerClassName: 'pdf-tablist',
    },
  );

  // --------------------------------------------------
  // Inspector
  // --------------------------------------------------

  const toolContainer = div({
    className: 'pdf-tool-container',
  });

  const sidePanel = div(
    { className: 'pdf-inspector' },
    div(
      { className: 'pdf-inspector-heading' },
      p({ className: 'pdf-inspector-title' }, 'Document settings'),
      span({ className: 'pdf-inspector-subtitle' }, 'Editing tools'),
    ),
    toolContainer,
  );

  // --------------------------------------------------
  // Document preview
  // --------------------------------------------------

  const previewContainer = div({
    className: 'pdf-preview-container',
  });

  const uploadIcon = div(
    { className: 'pdf-upload-icon' },
    createIcon('upload'),
  );

  function renderEmptyDropzone() {
    previewContainer.replaceChildren();

    const dropzone = div(
      {
        className: 'pdf-dropzone',
        onclick: () => fileInput.click(),
      },
      uploadIcon,
      p({ className: 'pdf-dropzone-title' }, 'No document loaded'),
      p(
        { className: 'pdf-dropzone-description' },
        'Drop a PDF or image here, or browse your files',
      ),
      div(
        { className: 'pdf-supported-formats' },
        'PDF',
        span({}, '·'),
        'PNG',
        span({}, '·'),
        'JPG',
        span({}, '·'),
        'WEBP',
      ),
    );

    previewContainer.append(dropzone);
  }

  // --------------------------------------------------
  // Preview rendering via PDF.js & Canvas
  // --------------------------------------------------

  async function renderDocumentPreview() {
    pageCounter.textContent =
      pages.length > 0
        ? `Page ${selectedPageIndex + 1} / ${pages.length}`
        : 'No pages loaded';

    documentName.textContent = uploadedFileName || 'Untitled document';

    if (!uploadedFileUrl || !uploadedFileType) {
      renderEmptyDropzone();
      return;
    }

    previewContainer.replaceChildren();

    const activePage = getActivePage();

    const wrapper = div({
      className: 'pdf-document-canvas-wrapper',
      id: 'active-document-canvas',
    });

    if (activePage?.isBlank) {
      wrapper.append(
        div(
          { className: 'pdf-blank-page' },
          span({ className: 'pdf-blank-page-title' }, activePage.title),
          span({ className: 'pdf-blank-page-description' }, 'Blank page'),
        ),
      );
    } else if (uploadedFileType === 'image') {
      const image = document.createElement('img');
      image.src = uploadedFileUrl;
      image.alt = uploadedFileName || 'Scanned document';
      image.className = 'pdf-document-image';
      wrapper.append(image);
    } else if (pdfDocProxy) {
      try {
        const pageNumber = Math.min(selectedPageIndex + 1, pdfDocProxy.numPages);
        const pdfPage = await pdfDocProxy.getPage(pageNumber);
        
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.className = 'pdf-rendered-canvas';

        if (context) {
          await pdfPage.render({
            canvas,
            canvasContext: context,
            viewport,
          }).promise;
        }

        wrapper.append(canvas);
      } catch (err) {
        console.error('Failed to render PDF page via PDF.js', err);
        showToast('Error rendering PDF page');
      }
    }

    previewContainer.append(wrapper);
    applyVisualTransforms();
  }

  function applyVisualTransforms() {
    const wrapper = previewContainer.querySelector(
      '#active-document-canvas',
    ) as HTMLElement | null;

    zoomLabel.textContent = `${zoomLevel}%`;

    if (!wrapper) {
      return;
    }

    const pageRotation = getActivePage()?.rotation ?? 0;

    wrapper.style.transform =
      `scale(${zoomLevel / 100}) rotate(${pageRotation + deskewAngle}deg)`;

    wrapper.style.filter =
      `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale}%)`;
  }

  // --------------------------------------------------
  // Viewport controls
  // --------------------------------------------------

  const { root: stageHud, zoomLabel } = createPdfStageHud({
    onZoomOut: () => {
      zoomLevel = Math.max(50, zoomLevel - 15);
      applyVisualTransforms();
    },
    onZoomIn: () => {
      zoomLevel = Math.min(220, zoomLevel + 15);
      applyVisualTransforms();
    },
    onDeskewLeft: () => {
      deskewAngle = Math.max(-15, deskewAngle - 1);
      applyVisualTransforms();

      if (activeTab === 'deskew') {
        renderToolControls();
      }
    },
    onDeskewRight: () => {
      deskewAngle = Math.min(15, deskewAngle + 1);
      applyVisualTransforms();

      if (activeTab === 'deskew') {
        renderToolControls();
      }
    },
    onRotate90: rotateActivePage,
    onRunOCR: runOCR,
  });

  // --------------------------------------------------
  // Stage & Shell Setup
  // --------------------------------------------------

  const stage = div(
    { className: 'pdf-stage' },
    div(
      { className: 'pdf-stage-header' },
      quickActions,
    ),
    previewContainer,
    stageHud,
  );

  const workspace = div(
    { className: 'pdf-workspace' },
    stage,
    sidePanel,
  );

  const modalFooter = createEditorFooter(
    resetEditor,
    () => triggerExport('pdf'),
  );

  const {
    root,
    modal,
    fullscreenButton,
  } = createEditorShell({
    title: 'PDF Editor',
    nav: sidePanelNav,
    workspace,
    footer: modalFooter,
    onReset: resetEditor,
    onToggleFullscreen: toggleEditorFullscreen,
    modalClassName: 'editor-surface pdf-editor-surface',
  });

  root.classList.add('pdf-editor-root');

  // --------------------------------------------------
  // Fullscreen
  // --------------------------------------------------

  function updateFullscreenButton() {
    if (!fullscreenButton) {
      return;
    }

    fullscreenButton.textContent =
      document.fullscreenElement === modal ? '⤡' : '⤢';
  }

  function toggleEditorFullscreen() {
    if (!document.fullscreenEnabled) {
      return;
    }

    if (document.fullscreenElement === modal) {
      void document.exitFullscreen();
    } else {
      void modal.requestFullscreen();
    }
  }

  document.addEventListener('fullscreenchange', updateFullscreenButton);

  // --------------------------------------------------
  // Drag and drop
  // --------------------------------------------------

  previewContainer.addEventListener('dragover', (event) => {
    event.preventDefault();
    previewContainer.classList.add('is-dragging');
  });

  previewContainer.addEventListener('dragleave', (event) => {
    event.preventDefault();
    previewContainer.classList.remove('is-dragging');
  });

  previewContainer.addEventListener('drop', (event) => {
    event.preventDefault();
    previewContainer.classList.remove('is-dragging');

    const file = event.dataTransfer?.files[0];

    if (file) {
      void loadDocumentFile(file);
    }
  });

  // --------------------------------------------------
  // File loading with PDF.js parsing
  // --------------------------------------------------

  async function loadDocumentFile(file: File) {
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    const isImage = file.type.startsWith('image/');

    if (!isPdf && !isImage) {
      showToast('Unsupported file format');
      return;
    }

    if (uploadedFileUrl) {
      URL.revokeObjectURL(uploadedFileUrl);
    }

    uploadedFile = file;
    uploadedFileName = file.name;
    uploadedFileUrl = URL.createObjectURL(file);
    uploadedFileType = isPdf ? 'pdf' : 'image';

    if (isPdf) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsModule = await getPdfJsModule();
        pdfDocProxy = await pdfjsModule.getDocument({ data: arrayBuffer }).promise;

        pages = Array.from({ length: pdfDocProxy.numPages }, (_, i) => ({
          id: createId('page'),
          title: `Page ${i + 1}`,
          rotation: 0,
        }));
      } catch (err) {
        console.error('Failed to parse PDF file', err);
        showToast('Could not parse PDF document');
        return;
      }
    } else {
      pdfDocProxy = null;
      pages = [
        {
          id: createId('page'),
          title: `${file.name} (Scan)`,
          rotation: 0,
        },
      ];
    }

    selectedPageIndex = 0;
    brightness = 100;
    contrast = 100;
    grayscale = 0;
    deskewAngle = 0;
    zoomLevel = 100;
    scanPreset = 'original';

    extractedText = [
      `DOCUMENT: ${file.name}`,
      `PROCESSED: ${new Date().toLocaleString()}`,
      `LANGUAGE: ${ocrLanguage.toUpperCase()}`,
      '',
      'Click "Run OCR" to perform text extraction.',
    ].join('\n');

    await renderDocumentPreview();
    renderToolControls();

    showToast(`Loaded ${file.name}`, 'success');
  }

  // --------------------------------------------------
  // Page operations
  // --------------------------------------------------

  function selectPage(index: number) {
    if (index < 0 || index >= pages.length) {
      return;
    }

    selectedPageIndex = index;

    void renderDocumentPreview();
    renderToolControls();
  }

  function movePage(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= pages.length) {
      return;
    }

    [pages[index], pages[target]] = [pages[target], pages[index]];
    selectedPageIndex = target;

    void renderDocumentPreview();
    renderToolControls();
  }

  function deletePage(index: number) {
    if (pages.length <= 1) {
      showToast('At least one page is required');
      return;
    }

    pages.splice(index, 1);

    if (selectedPageIndex === index) {
      selectedPageIndex = Math.min(index, pages.length - 1);
    } else if (selectedPageIndex > index) {
      selectedPageIndex--;
    }

    void renderDocumentPreview();
    renderToolControls();
  }

  function insertBlankPage() {
    const page: ScannerPageItem = {
      id: createId('page'),
      title: `Page ${pages.length + 1} (Blank)`,
      rotation: 0,
      isBlank: true,
    };

    pages.splice(selectedPageIndex + 1, 0, page);
    selectedPageIndex++;

    void renderDocumentPreview();
    renderToolControls();

    showToast('Blank page inserted', 'success');
  }

  function duplicatePage() {
    const current = getActivePage();

    if (!current) {
      return;
    }

    const duplicate: ScannerPageItem = {
      ...current,
      id: createId('page'),
      title: `${current.title} (Copy)`,
    };

    pages.splice(selectedPageIndex + 1, 0, duplicate);
    selectedPageIndex++;

    void renderDocumentPreview();
    renderToolControls();

    showToast('Page duplicated', 'success');
  }

  // --------------------------------------------------
  // Inspector rendering
  // --------------------------------------------------

  function renderToolControls() {
    applyPdfToolPanel({
      toolContainer,
      activeTab,
      renderPagesControls,
      renderEnhanceControls,
      renderOCRControls,
      renderDeskewControls,
      renderMergeControls,
      renderExportControls,
      renderSummary,
    });
  }

  function renderPagesControls() {
    const pageList = div(
      { className: 'pdf-page-list' },
      ...pages.map((page, index) =>
        createPageThumbnailItem({
          pageItem: page,
          index,
          selectedPageIndex,
          pages,
          onSelect: selectPage,
          onMove: movePage,
          onDelete: deletePage,
        }),
      ),
    );

    const actions = div(
      { className: 'pdf-page-actions' },
      createButton(
        'secondary',
        {
          type: 'button',
          className: 'pdf-button pdf-button-secondary',
          onclick: insertBlankPage,
        },
        '+ Blank page',
      ),
      createButton(
        'secondary',
        {
          type: 'button',
          className: 'pdf-button pdf-button-secondary',
          onclick: duplicatePage,
        },
        'Duplicate',
      ),
    );

    toolContainer.append(
      createSectionTitle(
        'Document pages',
        `${pages.length} pages in workspace`,
      ),
      pageList,
      actions,
    );
  }

  function renderEnhanceControls() {
    toolContainer.append(
      createSectionTitle(
        'Image enhancement',
        'Adjust the appearance of the document preview',
      ),
      createControlGroup(
        p({ className: 'pdf-control-label' }, 'Filter presets'),
        div(
          { className: 'pdf-preset-grid' },
          createPresetButton(
            'Original',
            () => applyScanPreset('original'),
            scanPreset === 'original',
          ),
          createPresetButton(
            'Magic color',
            () => applyScanPreset('magic'),
            scanPreset === 'magic',
          ),
          createPresetButton(
            'Black & white',
            () => applyScanPreset('bw'),
            scanPreset === 'bw',
          ),
        ),
      ),
      createSliderControl(
        'Brightness',
        brightness,
        50,
        160,
        '%',
        (value) => {
          brightness = value;
          scanPreset = 'original';
          applyVisualTransforms();
        },
      ),
      createSliderControl(
        'Contrast',
        contrast,
        50,
        200,
        '%',
        (value) => {
          contrast = value;
          scanPreset = 'original';
          applyVisualTransforms();
        },
      ),
      createSliderControl(
        'Grayscale',
        grayscale,
        0,
        100,
        '%',
        (value) => {
          grayscale = value;
          scanPreset = 'original';
          applyVisualTransforms();
        },
      ),
    );
  }

  function renderOCRControls() {
    const languageSelect = document.createElement('select');

    languageSelect.className = 'pdf-select';
    languageSelect.setAttribute('aria-label', 'OCR language');

    OCR_LANGUAGES.forEach((language) => {
      const option = document.createElement('option');

      option.value = language.value;
      option.textContent = language.label;
      option.selected = language.value === ocrLanguage;

      languageSelect.append(option);
    });

    languageSelect.addEventListener('change', () => {
      ocrLanguage = languageSelect.value;
      showToast(`Language set to ${ocrLanguage.toUpperCase()}`);
    });

    const textArea = document.createElement('textarea');

    textArea.className = 'pdf-textarea';
    textArea.value = extractedText;
    textArea.placeholder = 'Extracted text will appear here...';
    textArea.setAttribute('aria-label', 'Extracted OCR text');

    textArea.addEventListener('input', () => {
      extractedText = textArea.value;
    });

    toolContainer.append(
      createSectionTitle(
        'Text recognition',
        'Manage the searchable text layer',
      ),
      createControlGroup(
        p({ className: 'pdf-control-label' }, 'Recognition language'),
        languageSelect,
      ),
      createControlGroup(
        p({ className: 'pdf-control-label' }, 'Extracted text'),
        textArea,
      ),
      div(
        { className: 'pdf-button-grid' },
        createButton(
          'secondary',
          {
            type: 'button',
            className: 'pdf-button pdf-button-secondary',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(extractedText);
                showToast('Text copied', 'success');
              } catch {
                showToast('Clipboard access unavailable');
              }
            },
          },
          'Copy text',
        ),
        createButton(
          'primary',
          {
            type: 'button',
            className: 'pdf-button pdf-button-primary',
            onclick: () => {
              ocrEnabled = true;
              showToast('Text layer enabled', 'success');
              renderToolControls();
            },
          },
          'Enable layer',
        ),
      ),
    );
  }

  function renderDeskewControls() {
    toolContainer.append(
      createSectionTitle(
        'Page alignment',
        'Adjust rotation and correct tilted scans',
      ),
      createSliderControl(
        'Fine rotation',
        deskewAngle,
        -15,
        15,
        '°',
        (value) => {
          deskewAngle = value;
          applyVisualTransforms();
        },
      ),
      createControlGroup(
        p({ className: 'pdf-control-label' }, 'Quick adjustments'),
        div(
          { className: 'pdf-preset-grid' },
          createPresetButton(
            'Reset angle',
            () => {
              deskewAngle = 0;
              applyVisualTransforms();
              renderToolControls();
            },
          ),
          createPresetButton(
            'Rotate 90°',
            () => rotateActivePage(),
          ),
        ),
      ),
    );
  }

  function renderMergeControls() {
    const queueList = div({
      className: 'pdf-merge-list',
    });

    if (mergeQueue.length === 0) {
      queueList.append(
        p(
          { className: 'pdf-empty-message' },
          'No additional documents queued',
        ),
      );
    } else {
      mergeQueue.forEach((item, index) => {
        queueList.append(
          createMergeQueueEntry({
            item,
            index,
            onRemove: (itemId) => {
              mergeQueue = mergeQueue.filter((entry) => entry.id !== itemId);
              renderToolControls();
            },
          }),
        );
      });
    }

    toolContainer.append(
      createSectionTitle(
        'Merge documents',
        'Arrange additional documents for processing',
      ),
      queueList,
      label(
        { className: 'pdf-merge-upload' },
        '+ Add PDFs or scans',
        mergeFileInput,
      ),
      createButton(
        'primary',
        {
          type: 'button',
          className: 'pdf-button pdf-button-primary pdf-full-width',
          disabled: mergeQueue.length === 0,
          onclick: () => void mergeDocuments(),
        },
        `Add ${mergeQueue.length} file(s) to workspace`,
      ),
      p(
        { className: 'pdf-helper-text' },
        'Queued files will be fully merged into the working document.',
      ),
    );
  }

  function renderExportControls() {
    toolContainer.append(
      createSectionTitle(
        'Export document',
        'Choose an output format',
      ),
      div(
        { className: 'pdf-export-grid' },
        createPresetButton(
          'Searchable PDF',
          () => triggerExport('pdf'),
        ),
        createPresetButton(
          'JPG image',
          () => triggerExport('jpg'),
        ),
        createPresetButton(
          'Text file',
          () => triggerExport('txt'),
        ),
      ),
      createControlGroup(
        p({ className: 'pdf-control-label' }, 'Export summary'),
        div(
          { className: 'pdf-export-summary' },
          span({}, 'Document'),
          strong({}, uploadedFileName || 'No document'),
          span({}, 'Pages'),
          strong({}, `${pages.length}`),
          span({}, 'OCR'),
          strong({}, ocrEnabled ? 'Enabled' : 'Disabled'),
        ),
      ),
    );
  }

  function renderSummary() {
    const page = getActivePage();

    toolContainer.append(
      createSummaryPanel({
        uploadedFileName,
        pages,
        rotation: (page?.rotation ?? 0) + deskewAngle,
        ocrEnabled,
      }),
    );
  }

  // --------------------------------------------------
  // Enhancements & Transformations
  // --------------------------------------------------

  function applyScanPreset(preset: ScanPreset) {
    scanPreset = preset;

    if (preset === 'original') {
      brightness = 100;
      contrast = 100;
      grayscale = 0;
    } else if (preset === 'magic') {
      brightness = 112;
      contrast = 132;
      grayscale = 0;
    } else {
      brightness = 115;
      contrast = 175;
      grayscale = 100;
    }

    applyVisualTransforms();
    renderToolControls();
  }

  function rotateActivePage() {
    const page = getActivePage();

    if (!page) {
      return;
    }

    page.rotation = (page.rotation + 90) % 360;

    applyVisualTransforms();
    renderToolControls();
  }

  function runOCR() {
    if (!uploadedFile) {
      showToast('Upload a document first');
      return;
    }

    ocrEnabled = true;
    switchTab('ocr');
    showToast('OCR layer active. Text extraction initialized.', 'success');
  }

  // --------------------------------------------------
  // True PDF Merging using `pdf-lib`
  // --------------------------------------------------

  async function mergeDocuments() {
    if (!mergeQueue.length || !uploadedFile) {
      return;
    }

    try {
      showToast('Merging documents...', 'info');

      const { PDFDocument } = await importRemote<any>('https://esm.sh/pdf-lib@1.17.1');
      const baseArrayBuffer = await uploadedFile.arrayBuffer();
      const mergedPdfDoc = await PDFDocument.load(baseArrayBuffer);

      for (const queueItem of mergeQueue) {
        const itemBuffer = await queueItem.file.arrayBuffer();
        if (queueItem.file.type === 'application/pdf') {
          const externalPdf = await PDFDocument.load(itemBuffer);
          const copiedPages = await mergedPdfDoc.copyPages(
            externalPdf,
            externalPdf.getPageIndices()
          );
          copiedPages.forEach((page: any) => mergedPdfDoc.addPage(page));
        } else {
          // Embed image file as a new page
          let embeddedImage;
          if (queueItem.file.type === 'image/png') {
            embeddedImage = await mergedPdfDoc.embedPng(itemBuffer);
          } else {
            embeddedImage = await mergedPdfDoc.embedJpg(itemBuffer);
          }
          const page = mergedPdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: embeddedImage.width,
            height: embeddedImage.height,
          });
        }

        pages.push({
          id: createId('page'),
          title: queueItem.name,
          rotation: 0,
        });
      }

      const mergedPdfBytes = await mergedPdfDoc.save();
      const newBlob = new Blob([new Uint8Array(mergedPdfBytes)], { type: 'application/pdf' });

      if (uploadedFileUrl) {
        URL.revokeObjectURL(uploadedFileUrl);
      }

      uploadedFile = new File([newBlob], uploadedFileName || 'merged-document.pdf', {
        type: 'application/pdf',
      });
      uploadedFileUrl = URL.createObjectURL(uploadedFile);
      uploadedFileType = 'pdf';

      const arrayBuffer = await uploadedFile.arrayBuffer();
      const pdfjsModule = await getPdfJsModule();
      pdfDocProxy = await pdfjsModule.getDocument({ data: arrayBuffer }).promise;

      mergeQueue = [];
      selectedPageIndex = pages.length - 1;

      await renderDocumentPreview();
      renderToolControls();

      showToast('Documents merged successfully!', 'success');
    } catch (err) {
      console.error('Merge failure:', err);
      showToast('Failed to merge documents');
    }
  }

  // --------------------------------------------------
  // Tab navigation
  // --------------------------------------------------

  function switchTab(tab: ScanTab) {
    activeTab = tab;

    sidePanelNav.querySelectorAll('button').forEach((element, index) => {
      const buttonElement = element as HTMLButtonElement;
      const selected = TABS[index]?.id === tab;

      buttonElement.classList.toggle('pdf-tab-active', selected);
      buttonElement.classList.toggle('pdf-tab-inactive', !selected);
      buttonElement.setAttribute('aria-selected', String(selected));
    });

    renderToolControls();
  }

  // --------------------------------------------------
  // Reset
  // --------------------------------------------------

  function resetEditor() {
    deskewAngle = 0;
    zoomLevel = 100;
    brightness = 100;
    contrast = 100;
    grayscale = 0;
    scanPreset = 'original';

    pages = pages.map((page) => ({
      ...page,
      rotation: 0,
    }));

    applyVisualTransforms();
    renderToolControls();

    showToast('Adjustments reset', 'success');
  }

  // --------------------------------------------------
  // Cleanup
  // --------------------------------------------------

  function cleanup() {
    if (destroyed) {
      return;
    }

    destroyed = true;

    document.removeEventListener(
      'fullscreenchange',
      updateFullscreenButton,
    );

    if (uploadedFileUrl) {
      URL.revokeObjectURL(uploadedFileUrl);
      uploadedFileUrl = null;
    }

    previewContainer.replaceChildren();
    toastContainer.replaceChildren();
  }

  root.addEventListener('remove', cleanup, { once: true });

  // --------------------------------------------------
  // Initial render
  // --------------------------------------------------

  renderEmptyDropzone();
  renderToolControls();
  updateFullscreenButton();

  return root;
}