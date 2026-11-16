import '../../css/scan.css';
import { button, createButton, div, input, label, p, span, svgElement } from '../components/ui/dom';
import {
  createEditorFooter,
  createEditorShell,
  createEditorTabNav,
} from './shared';
import { createScanCameraController } from './scan/camera';
import { createScanCropper } from './scan/crop';
import { createScanExporter } from './scan/export';
import type { ScanMode } from './scan/controls';
import { loadSessionFromIdb, saveSessionToIdb } from './scan/storage';
import {
  FILTERS,
  TABS,
  type DocumentPreset,
  type ExportFormat,
  type FilterPreset,
  type ScanTab,
  type ScannedPage,
} from './scan/types';
import { clamp, createId } from './scan/utils';
import { createWorker } from 'tesseract.js';

export async function createScanPage(): Promise<HTMLElement> {
  // State

  let currentMode: ScanMode = 'pdf';
  let docPreset: DocumentPreset = 'pdf';
  let activeTab: ScanTab = 'mode';

  let pages: ScannedPage[] = [];
  let activePageIndex = -1;

  let scanName = `Scan_${new Date().toISOString().slice(0, 10)}`;
  let exportFormat: ExportFormat = 'pdf';
  let exportQuality = 0.92;

  let flashEnabled = false;
  let isCameraActive = false;
  let isOcrProcessing = false;
  let isExporting = false;

  let ocrWorker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let ocrRequestId = 0;

  let activeCornerIndex: number | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  let controller!: ReturnType<typeof createScanCameraController>;

  const savedSession = await loadSessionFromIdb();

  if (savedSession?.pages?.length) {
    pages = savedSession.pages;
    activePageIndex = clamp(
      savedSession.activePageIndex,
      0,
      pages.length - 1
    );
  }

  const getActivePage = (): ScannedPage | null => {
    if (activePageIndex < 0 || activePageIndex >= pages.length) {
      return null;
    }

    return pages[activePageIndex];
  };

  const persistState = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(() => {
      void saveSessionToIdb({
        pages,
        activePageIndex,
      });
    }, 250);
  };

  // Small DOM helpers

  const textElement = (
    text: string,
    className = ''
  ) => p({ className }, text);

  const makeButton = (
    text: string,
    className: string,
    onClick: () => void,
    disabled = false
  ) => {
    return button(
      {
        type: 'button',
        className,
        disabled,
        onclick: onClick,
      },
      text
    );
  };

  const makeSectionTitle = (text: string) =>
    p({ className: 'scan-section-title' }, text);

  const makePresetButton = (
    text: string,
    selected: boolean,
    onClick: () => void
  ) => {
    return makeButton(
      text,
      `scan-preset${selected ? ' is-selected' : ''}`,
      onClick
    );
  };

  const makeSlider = (
    title: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void
  ) => {
    const wrapper = div({ className: 'scan-slider' });

    const heading = div({ className: 'scan-slider-heading' });
    const name = span({ className: 'scan-slider-label' }, title);
    const output = span({ className: 'scan-slider-value' }, `${value}%`);

    const range = input({
      type: 'range',
      min: String(min),
      max: String(max),
      value: String(value),
      className: 'scan-range',
      oninput: (event: Event) => {
        const nextValue = Number(
          (event.target as HTMLInputElement).value
        );

        output.textContent = `${nextValue}%`;
        onChange(nextValue);
      },
    });

    heading.append(name, output);
    wrapper.append(heading, range);

    return wrapper;
  };

  const makeStatusCard = (title: string, value: string) => {
    return div(
      { className: 'scan-info-item' },
      span({ className: 'scan-info-label' }, title),
      span({ className: 'scan-info-value' }, value)
    );
  };

  // Main layout

  const root = div({ className: 'scan-root' });

  const statusMessage = span(
    { className: 'scan-status-message' },
    pages.length ? 'Session restored' : 'Waiting for upload'
  );

  const modeStatus = span(
    { className: 'scan-status-mode' },
    'PDF Document'
  );

  const pageCount = span(
    { className: 'scan-status-count' },
    String(pages.length)
  );

  const statusBox = div(
    { className: 'scan-status-card' },
    makeStatusCard('Mode', ''),
    makeStatusCard('Status', ''),
    makeStatusCard('Pages', '')
  );

  const statusItems = statusBox.querySelectorAll('.scan-info-value');

  statusItems[0].replaceWith(modeStatus);
  statusItems[1].replaceWith(statusMessage);
  statusItems[2].replaceWith(pageCount);

  const setStatus = (message: string) => {
    statusMessage.textContent = message;
  };

  const updatePageCounter = () => {
    pageCount.textContent = pages.length
      ? `${activePageIndex + 1} / ${pages.length}`
      : '0';

    const reelCount = root.querySelector('.scan-reel-count');

    if (reelCount) {
      reelCount.textContent = String(pages.length);
    }
  };

  // Upload

  const fileInput = input({
    type: 'file',
    accept: 'image/*,.pdf',
    multiple: true,
    className: 'scan-file-input',
    onchange: (event: Event) => {
      const target = event.target as HTMLInputElement;

      processFiles(target.files);
      target.value = '';
    },
  });

  const addPageFromDataUrl = (
    dataUrl: string,
    name?: string
  ) => {
    const page: ScannedPage = {
      id: createId(),
      name: name || `Page ${pages.length + 1}`,
      dataUrl,
      filter: 'magic',
      rotation: 0,
      flipX: false,
      brightness: 100,
      contrast: 100,
      corners: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      signatureDataUrl: null,
      watermarkText: '',
      watermarkOpacity: 15,
      extractedText: '',
    };

    pages.push(page);
    activePageIndex = pages.length - 1;

    isCameraActive = false;

    renderAll();
    persistState();

    setStatus(`Added ${page.name}`);
  };

  function processFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    const files = Array.from(fileList);

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        if (file.type === 'application/pdf') {
          setStatus('PDF import requires page rasterization support');
        } else {
          setStatus(`Unsupported file: ${file.name}`);
        }

        continue;
      }

      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          addPageFromDataUrl(
            reader.result,
            file.name.replace(/\.[^/.]+$/, '')
          );
        }
      };

      reader.onerror = () => {
        setStatus(`Failed to read ${file.name}`);
      };

      reader.readAsDataURL(file);
    }
  }

  // Top actions

  const quickActions = div(
    { className: 'scan-quick-actions' },

    div(
      { className: 'scan-quick-group' },
      makeButton('Rotate left', 'scan-button scan-button-muted', () =>
        rotateActivePage(-90)
      ),
      makeButton('Rotate right', 'scan-button scan-button-muted', () =>
        rotateActivePage(90)
      ),
      makeButton('Flip', 'scan-button scan-button-muted', () =>
        flipActivePage()
      )
    ),

    div(
      { className: 'scan-quick-group scan-quick-group-primary' },

      label(
        { className: 'scan-button scan-button-muted scan-upload-button' },
        'Upload',
        fileInput
      ),

      createButton(
        'primary',
        {
          type: 'button',
          className: 'scan-button scan-button-primary',
          onclick: () => void triggerExport(),
        },
        'Export'
      )
    )
  );

  // Page reel

  const pageReelContainer = div({
    className: 'scan-page-reel',
  });

  const leftSidebar = div(
    { className: 'scan-sidebar scan-sidebar-pages' },

    div(
      { className: 'scan-panel-heading' },
      span({}, 'Pages'),
      span(
        { className: 'scan-reel-count' },
        String(pages.length)
      )
    ),

    pageReelContainer
  );

  function renderPageReel() {
    pageReelContainer.innerHTML = '';

    if (!pages.length) {
      pageReelContainer.append(
        div(
          { className: 'scan-empty-reel' },
          'Your scanned pages will appear here.'
        )
      );

      updatePageCounter();
      return;
    }

    pages.forEach((page, index) => {
      const selected = index === activePageIndex;

      const thumbnail = div({
        className: `scan-thumbnail${selected ? ' is-active' : ''}`,
        role: 'button',
        tabindex: '0',
        'aria-label': `Select page ${index + 1}`,
      });

      const image = document.createElement('img');
      image.src = page.dataUrl;
      image.alt = page.name;
      image.loading = 'lazy';

      const details = div(
        { className: 'scan-thumbnail-details' },
        span(
          { className: 'scan-thumbnail-name' },
          `${index + 1}. ${page.name}`
        ),
        span(
          { className: 'scan-thumbnail-filter' },
          page.filter
        )
      );

      const remove = makeButton(
        '×',
        'scan-thumbnail-remove',
        () => deletePage(index)
      );

      remove.setAttribute('aria-label', `Delete page ${index + 1}`);

      thumbnail.append(image, details, remove);

      const selectPage = () => {
        activePageIndex = index;
        isCameraActive = false;
        renderAll();
        persistState();
      };

      thumbnail.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('.scan-thumbnail-remove')) {
          return;
        }

        selectPage();
      });

      thumbnail.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectPage();
        }
      });

      pageReelContainer.append(thumbnail);
    });

    updatePageCounter();
  }

  // Preview

  const previewFrame = div({
    className: 'scan-preview-frame',
  });

  const stage = div(
    { className: 'scan-stage' },
    quickActions,
    previewFrame
  );

  const computeCssFilter = (page: ScannedPage): string => {
    return [
      FILTERS[page.filter],
      `brightness(${page.brightness}%)`,
      `contrast(${page.contrast}%)`,
    ]
      .filter(Boolean)
      .join(' ');
  };

  function renderStagePreview() {
    if (isCameraActive) {
      return;
    }

    previewFrame.innerHTML = '';

    const page = getActivePage();

    if (!page) {
      const dropzone = div(
        { className: 'scan-dropzone' },

        svgElement(
          'svg',
          {
            class: 'scan-dropzone-icon',
            fill: 'none',
            stroke: 'currentColor',
            viewBox: '0 0 24 24',
            'stroke-width': '1.5',
          },
          svgElement('path', {
            d: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
          })
        ),

        p({ className: 'scan-dropzone-title' }, 'No document selected'),

        p(
          { className: 'scan-dropzone-description' },
          'Upload an image or drag files into this area.'
        ),

        makeButton(
          'Choose files',
          'scan-button scan-button-primary',
          () => fileInput.click()
        )
      );

      previewFrame.append(dropzone);
      return;
    }

    const wrapper = div({
      className: 'scan-image-wrapper',
    });

    const image = document.createElement('img');

    image.src = page.dataUrl;
    image.alt = page.name;
    image.className = 'scan-preview-image';
    image.draggable = false;

    image.style.filter = computeCssFilter(page);
    image.style.transform =
      `rotate(${page.rotation}deg) scaleX(${page.flipX ? -1 : 1})`;

    wrapper.append(image);

    if (page.watermarkText) {
      const watermark = div(
        { className: 'scan-watermark' },
        span({}, page.watermarkText)
      );

      watermark.style.opacity = String(
        (page.watermarkOpacity ?? 15) / 100
      );

      wrapper.append(watermark);
    }

    if (page.signatureDataUrl) {
      const signature = document.createElement('img');

      signature.src = page.signatureDataUrl;
      signature.alt = 'Signature';
      signature.className = 'scan-preview-signature';

      wrapper.append(signature);
    }

    if (activeTab === 'crop') {
      image.addEventListener('load', () => {
        if (!wrapper.isConnected || !image.isConnected) {
          return;
        }

        renderCropOverlay(wrapper, image, page);
      });

      if (image.complete) {
        requestAnimationFrame(() => {
          renderCropOverlay(wrapper, image, page);
        });
      }
    }

    previewFrame.append(wrapper);
  }

  const scanCropper = createScanCropper({
    getActivePage,
    renderStagePreview,
    renderAll,
    persistState,
    switchTab,
    setStatus,
    getActiveCornerIndex: () => activeCornerIndex,
    setActiveCornerIndex: (index) => {
      activeCornerIndex = index;
    },
  });

  const renderCropOverlay = (
    wrapper: HTMLElement,
    image: HTMLImageElement,
    page: ScannedPage
  ) => scanCropper.renderCropOverlay(wrapper, image, page);

  // Camera HUD

  const cameraToggleButton = makeButton(
    'Open camera',
    'scan-button scan-button-muted',
    () => void openCamera()
  );

  const captureButton = makeButton(
    'Capture',
    'scan-button scan-button-primary',
    () => capturePhoto()
  );

  const flashButton = makeButton(
    'Flash off',
    'scan-button scan-button-muted',
    () => toggleFlash()
  );

  const stageHud = div(
    { className: 'scan-camera-toolbar' },
    cameraToggleButton,
    captureButton,
    flashButton
  );

  stage.append(stageHud);

  async function openCamera() {
    isCameraActive = true;

    try {
      await controller.startCamera();
      setStatus('Camera live');
    } catch (error) {
      isCameraActive = false;
      setStatus('Unable to access camera');
      console.error('Camera initialization failed:', error);
    }
  }

  function capturePhoto() {
    if (!isCameraActive) {
      setStatus('Open camera first');
      return;
    }

    controller.capturePhoto();

    requestAnimationFrame(() => {
      const capturedImage = previewFrame.querySelector('img');

      if (capturedImage?.src) {
        addPageFromDataUrl(
          capturedImage.src,
          `Scan_${pages.length + 1}`
        );
      }
    });
  }

  function toggleFlash() {
    flashEnabled = !flashEnabled;

    flashButton.textContent = flashEnabled ? 'Flash on' : 'Flash off';
    flashButton.classList.toggle('is-flash-active', flashEnabled);

    setStatus(flashEnabled ? 'Flash enabled' : 'Flash disabled');
  }

  controller = createScanCameraController({
    previewFrame,
    getMode: () => currentMode,
    setStatus,
  });

  const scanExporter = createScanExporter({
    getPages: () => pages,
    getCurrentMode: () => currentMode,
    getExportFormat: () => exportFormat,
    getExportQuality: () => exportQuality,
    getFilename: () => scanName,
    setStatus,
    renderToolControls,
    getDestroyed: () => destroyed,
    computeCssFilter,
    getIsExporting: () => isExporting,
    setIsExporting: (value: boolean) => {
      isExporting = value;
    },
  });

  // Rotation and flipping

  function rotateActivePage(degrees: number) {
    const page = getActivePage();

    if (!page) {
      setStatus('No page selected');
      return;
    }

    page.rotation = (page.rotation + degrees + 360) % 360;

    renderStagePreview();
    persistState();

    setStatus(`Rotation: ${page.rotation}°`);
  }

  function flipActivePage() {
    const page = getActivePage();

    if (!page) {
      setStatus('No page selected');
      return;
    }

    page.flipX = !page.flipX;

    renderStagePreview();
    persistState();

    setStatus(page.flipX ? 'Flipped horizontally' : 'Flip removed');
  }

  // Inspector

  const toolContainer = div({
    className: 'scan-tool-content',
  });

  const sidePanelNav = createEditorTabNav(
    TABS,
    activeTab,
    (tabId) => switchTab(tabId),
    {
      activeClassName: 'scan-tab is-active',
      inactiveClassName: 'scan-tab',
      containerClassName: 'scan-tab-list',
    }
  );

  const rightInspector = div(
    { className: 'scan-sidebar scan-sidebar-inspector' },
    toolContainer
  );

  function createModeTab() {
    const modes: {
      id: DocumentPreset;
      label: string;
      mode: ScanMode;
      status: string;
    }[] = [
      {
        id: 'pdf',
        label: 'PDF document',
        mode: 'pdf',
        status: 'PDF Document',
      },
      {
        id: 'id',
        label: 'ID / Passport',
        mode: 'pdf',
        status: 'ID Card Mode',
      },
      {
        id: 'ocr',
        label: 'Text recognition',
        mode: 'pdf',
        status: 'OCR Text Mode',
      },
      {
        id: 'photo',
        label: 'HD Photo',
        mode: 'photo',
        status: 'HD Photo',
      },
    ];

    const grid = div(
      { className: 'scan-preset-grid' },

      ...modes.map((mode) =>
        makePresetButton(
          mode.label,
          docPreset === mode.id,
          () => {
            docPreset = mode.id;
            currentMode = mode.mode;
            modeStatus.textContent = mode.status;

            setStatus(`${mode.status} active`);
            renderToolControls();
          }
        )
      )
    );

    toolContainer.append(
      makeSectionTitle('Document type'),
      grid
    );
  }

  function createFiltersTab(page: ScannedPage | null) {
    const filters: { id: FilterPreset; label: string }[] = [
      { id: 'magic', label: 'Magic color' },
      { id: 'gray', label: 'Grayscale' },
      { id: 'bw', label: 'High contrast' },
      { id: 'original', label: 'Original' },
    ];

    const grid = div(
      { className: 'scan-preset-grid' },

      ...filters.map((filter) =>
        makePresetButton(
          filter.label,
          page?.filter === filter.id,
          () => {
            if (!page) {
              setStatus('Upload a document first');
              return;
            }

            page.filter = filter.id;

            renderStagePreview();
            renderToolControls();
            renderPageReel();
            persistState();

            setStatus(`Filter: ${filter.label}`);
          }
        )
      )
    );

    const sliders = div(
      { className: 'scan-control-card' },

      makeSlider(
        'Brightness',
        page?.brightness ?? 100,
        50,
        150,
        (value) => {
          if (!page) return;

          page.brightness = value;
          renderStagePreview();
          persistState();
        }
      ),

      makeSlider(
        'Contrast',
        page?.contrast ?? 100,
        50,
        200,
        (value) => {
          if (!page) return;

          page.contrast = value;
          renderStagePreview();
          persistState();
        }
      )
    );

    toolContainer.append(
      makeSectionTitle('Enhancement presets'),
      grid,
      makeSectionTitle('Image adjustments'),
      sliders
    );
  }

  function createCropTab() {
    toolContainer.append(
      makeSectionTitle('Perspective crop'),

      div(
        { className: 'scan-info-card' },
        textElement(
          'Move the four corner handles to select the document boundaries.'
        ),
        textElement(
          'The current crop operation creates a rectangular crop from the selected bounds. Full perspective correction requires a homography transform.'
        )
      ),

      makeButton(
        'Apply crop',
        'scan-button scan-button-primary scan-button-block',
        () => void applyPerspectiveCrop()
      )
    );
  }

  function createSignTab(page: ScannedPage | null) {
    const watermarkInput = input({
      type: 'text',
      value: page?.watermarkText ?? '',
      placeholder: 'CONFIDENTIAL',
      className: 'scan-text-input',
      oninput: (event: Event) => {
        if (!page) return;

        page.watermarkText = (
          event.target as HTMLInputElement
        ).value;

        renderStagePreview();
        persistState();
      },
    });

    toolContainer.append(
      makeSectionTitle('Security watermark'),

      div(
        { className: 'scan-control-card' },

        label(
          { className: 'scan-field-label' },
          'Watermark text',
          watermarkInput
        ),

        makeSlider(
          'Opacity',
          page?.watermarkOpacity ?? 15,
          5,
          50,
          (value) => {
            if (!page) return;

            page.watermarkOpacity = value;
            renderStagePreview();
            persistState();
          }
        )
      ),

      makeSectionTitle('Electronic signature'),

      div(
        { className: 'scan-control-card' },

        textElement(
          page?.signatureDataUrl
            ? 'A signature is attached.'
            : 'No signature attached.',
          'scan-muted-text'
        ),

        makeButton(
          page?.signatureDataUrl ? 'Redraw signature' : 'Draw signature',
          'scan-button scan-button-primary scan-button-block',
          () => openSignaturePadModal()
        ),

        page?.signatureDataUrl
          ? makeButton(
              'Remove signature',
              'scan-button scan-button-danger scan-button-block',
              () => {
                if (!page) return;

                page.signatureDataUrl = null;

                renderStagePreview();
                renderToolControls();
                persistState();

                setStatus('Signature removed');
              }
            )
          : null
      )
    );
  }

  function createOcrTab(page: ScannedPage | null) {
    const output = div(
      { className: 'scan-ocr-output' },
      page?.extractedText ||
        (isOcrProcessing
          ? 'Recognizing text...'
          : 'No text extracted yet.')
    );

    const runButton = makeButton(
      isOcrProcessing ? 'Processing...' : 'Run text recognition',
      'scan-button scan-button-primary scan-button-block',
      () => void runTesseractOcr(),
      isOcrProcessing || !page
    );

    toolContainer.append(
      makeSectionTitle('Text recognition'),

      div(
        { className: 'scan-info-card' },
        textElement(
          'Extract text locally from your document using Tesseract.js.'
        ),
        runButton
      ),

      div(
        { className: 'scan-ocr-heading' },
        span({}, 'Extracted text'),

        page?.extractedText
          ? makeButton(
              'Copy',
              'scan-button scan-button-muted scan-button-small',
              () => {
                void navigator.clipboard.writeText(
                  page.extractedText || ''
                );

                setStatus('Text copied');
              }
            )
          : null
      ),

      output
    );
  }

  function createBatchTab() {
    toolContainer.append(
      makeSectionTitle('Batch manager'),

      div(
        { className: 'scan-info-card' },
        textElement(`Pages in stack: ${pages.length}`),
        textElement(
          'Add images, switch between pages, or remove individual pages.'
        )
      ),

      makeButton(
        'Add pages',
        'scan-button scan-button-muted scan-button-block',
        () => fileInput.click()
      )
    );

    if (pages.length) {
      toolContainer.append(
        makeButton(
          'Clear entire stack',
          'scan-button scan-button-danger scan-button-block',
          () => {
            if (!confirm('Clear the entire document stack?')) {
              return;
            }

            pages = [];
            activePageIndex = -1;

            renderAll();
            persistState();

            setStatus('Document stack cleared');
          }
        )
      );
    }
  }

  function createExportTab() {
    const nameInput = input({
      type: 'text',
      value: scanName,
      className: 'scan-text-input',
      placeholder: 'Document name',
      oninput: (event: Event) => {
        scanName = (
          event.target as HTMLInputElement
        ).value;
      },
    });

    const formatGrid = div(
      { className: 'scan-preset-grid scan-format-grid' },

      ...(['pdf', 'jpg', 'png'] as ExportFormat[]).map((format) =>
        makePresetButton(
          format.toUpperCase(),
          exportFormat === format,
          () => {
            exportFormat = format;
            renderToolControls();
          }
        )
      )
    );

    toolContainer.append(
      makeSectionTitle('Export document'),

      div(
        { className: 'scan-control-card' },

        label(
          { className: 'scan-field-label' },
          'File name',
          nameInput
        ),

        label(
          { className: 'scan-field-label' },
          'Export format',
          formatGrid
        ),

        makeSlider(
          'Image quality',
          Math.round(exportQuality * 100),
          40,
          100,
          (value) => {
            exportQuality = value / 100;
          }
        ),

        makeButton(
          isExporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`,
          'scan-button scan-button-primary scan-button-block',
          () => void triggerExport(),
          isExporting || !pages.length
        )
      )
    );
  }

  function renderToolControls() {
    toolContainer.innerHTML = '';

    const page = getActivePage();

    switch (activeTab) {
      case 'mode':
        createModeTab();
        break;

      case 'filters':
        createFiltersTab(page);
        break;

      case 'crop':
        createCropTab();
        break;

      case 'sign':
        createSignTab(page);
        break;

      case 'ocr':
        createOcrTab(page);
        break;

      case 'batch':
        createBatchTab();
        break;

      case 'export':
        createExportTab();
        break;
    }

    toolContainer.append(
      div(
        { className: 'scan-inspector-footer' },

        makeSectionTitle('Session information'),

        statusBox,

        div(
          { className: 'scan-info-grid' },
          makeStatusCard('Engine', 'Tesseract.js'),
          makeStatusCard('Format', exportFormat.toUpperCase()),
          makeStatusCard('Pages', String(pages.length))
        )
      )
    );
  }

  // OCR

  async function runTesseractOcr() {
    const page = getActivePage();

    if (!page) {
      setStatus('No page selected');
      return;
    }

    if (isOcrProcessing) {
      return;
    }

    const pageId = page.id;
    const requestId = ++ocrRequestId;

    isOcrProcessing = true;

    renderToolControls();
    setStatus('Initializing OCR...');

    try {
      if (!ocrWorker) {
        ocrWorker = await createWorker('eng');
      }

      if (destroyed || requestId !== ocrRequestId) {
        return;
      }

      setStatus('Recognizing text...');

      const result = await ocrWorker.recognize(page.dataUrl);

      const originalPage = pages.find((item) => item.id === pageId);

      if (!originalPage || destroyed) {
        return;
      }

      originalPage.extractedText =
        result.data.text.trim() || 'No text detected.';

      persistState();
      setStatus('OCR completed');
    } catch (error) {
      console.error('OCR failed:', error);
      setStatus('OCR recognition failed');
    } finally {
      isOcrProcessing = false;

      if (!destroyed) {
        renderToolControls();
      }
    }
  }

  // Signature modal

  function openSignaturePadModal() {
    const page = getActivePage();

    if (!page) {
      setStatus('Select a page first');
      return;
    }

    const overlay = div({
      className: 'scan-modal-overlay',
    });

    const modal = div({
      className: 'scan-signature-modal',
    });

    const heading = div(
      { className: 'scan-modal-heading' },
      p({}, 'Draw your signature'),
      makeButton(
        '×',
        'scan-modal-close',
        () => closeModal()
      )
    );

    const canvas = document.createElement('canvas');

    canvas.width = 1000;
    canvas.height = 400;
    canvas.className = 'scan-signature-canvas';

    const canvasWrapper = div(
      { className: 'scan-signature-canvas-wrapper' },
      canvas
    );

    const context = canvas.getContext('2d');

    if (context) {
      context.strokeStyle = '#111827';
      context.lineWidth = 5;
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }

    let drawing = false;

    const getPosition = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();

      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);

      const point = getPosition(event);

      context?.beginPath();
      context?.moveTo(point.x, point.y);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drawing) return;

      const point = getPosition(event);

      context?.lineTo(point.x, point.y);
      context?.stroke();
    };

    const onPointerUp = () => {
      drawing = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    const clearButton = makeButton(
      'Clear',
      'scan-button scan-button-muted',
      () => context?.clearRect(0, 0, canvas.width, canvas.height)
    );

    const saveButton = makeButton(
      'Apply signature',
      'scan-button scan-button-primary',
      () => {
        page.signatureDataUrl = canvas.toDataURL('image/png');

        renderStagePreview();
        renderToolControls();
        persistState();

        setStatus('Signature attached');
        closeModal();
      }
    );

    const actions = div(
      { className: 'scan-modal-actions' },
      clearButton,
      saveButton
    );

    modal.append(heading, canvasWrapper, actions);
    overlay.append(modal);
    document.body.append(overlay);

    function closeModal() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);

      overlay.remove();
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
  }

  // Crop

  async function applyPerspectiveCrop() {
    await scanCropper.applyPerspectiveCrop();
  }

  // Page management

  function deletePage(index: number) {
    if (index < 0 || index >= pages.length) {
      return;
    }

    const removedPage = pages[index];

    pages.splice(index, 1);

    if (!pages.length) {
      activePageIndex = -1;
    } else if (index < activePageIndex) {
      activePageIndex--;
    } else if (index === activePageIndex) {
      activePageIndex = Math.min(index, pages.length - 1);
    }

    if (removedPage) {
      removedPage.dataUrl = '';
    }

    renderAll();
    persistState();

    setStatus('Page removed');
  }

  // Rendering and export

  async function triggerExport() {
    await scanExporter.triggerExport();
  }

  // Tabs and reset

  function switchTab(tab: ScanTab) {
    activeTab = tab;

    sidePanelNav.querySelectorAll('button').forEach((buttonElement, index) => {
      buttonElement.classList.toggle(
        'is-active',
        TABS[index]?.id === tab
      );
    });

    renderToolControls();
    renderStagePreview();
  }

  function resetEditor() {
    flashEnabled = false;

    flashButton.textContent = 'Flash off';
    flashButton.classList.remove('is-flash-active');

    const page = getActivePage();

    if (!page) {
      setStatus('Waiting for upload');
      return;
    }

    page.filter = 'original';
    page.rotation = 0;
    page.flipX = false;
    page.brightness = 100;
    page.contrast = 100;
    page.signatureDataUrl = null;
    page.watermarkText = '';
    page.watermarkOpacity = 15;
    page.extractedText = '';

    page.corners = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];

    renderAll();
    persistState();

    setStatus('Current page reset');
  }

  // Fullscreen

  const workspace = div(
    { className: 'scan-workspace' },
    leftSidebar,
    stage,
    rightInspector
  );

  const modalFooter = createEditorFooter(
    () => resetEditor(),
    () => void triggerExport()
  );

  const {
    root: editorRoot,
    modal,
    fullscreenButton,
  } = createEditorShell({
    title: 'Document Studio',
    nav: sidePanelNav,
    workspace,
    footer: modalFooter,
    onReset: resetEditor,
    onToggleFullscreen: () => toggleEditorFullscreen(),
    rootClassName: 'scan-editor-root',
    modalClassName: 'scan-editor-modal',
  });

  root.append(editorRoot);

  const updateFullscreenButton = () => {
    fullscreenButton.textContent =
      document.fullscreenElement === modal ? 'Exit fullscreen' : 'Fullscreen';
  };

  document.addEventListener('fullscreenchange', updateFullscreenButton);

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

  // Drag and drop

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    previewFrame.classList.add('is-dragging');
  };

  const onDragLeave = (event: DragEvent) => {
    if (!stage.contains(event.relatedTarget as Node)) {
      previewFrame.classList.remove('is-dragging');
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();

    previewFrame.classList.remove('is-dragging');

    if (event.dataTransfer?.files) {
      processFiles(event.dataTransfer.files);
    }
  };

  stage.addEventListener('dragover', onDragOver);
  stage.addEventListener('dragleave', onDragLeave);
  stage.addEventListener('drop', onDrop);

  // Render

  function renderAll() {
    renderStagePreview();
    renderToolControls();
    renderPageReel();
    updatePageCounter();
  }

  renderAll();

  // Cleanup when editor is removed

  const observer = new MutationObserver(() => {
    if (root.isConnected) {
      return;
    }

    destroyed = true;
    ocrRequestId++;

    observer.disconnect();

    document.removeEventListener(
      'fullscreenchange',
      updateFullscreenButton
    );

    stage.removeEventListener('dragover', onDragOver);
    stage.removeEventListener('dragleave', onDragLeave);
    stage.removeEventListener('drop', onDrop);

    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    void saveSessionToIdb({
      pages,
      activePageIndex,
    });

    if (ocrWorker) {
      void ocrWorker.terminate();
      ocrWorker = null;
    }

    if (isCameraActive) {
      // The camera controller should release its media stream
      // when its owning editor is destroyed.
      isCameraActive = false;
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return root;
}
