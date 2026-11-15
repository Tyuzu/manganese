import '../../css/pdf.css';
import {
  button,
  createButton,
  div,
  input,
  label,
  p,
  span,
  strong,
  svgElement,
} from '../components/ui/dom';

import { appStore } from '../appState';
import { processMediaOnServer } from '../api';

import {
  createEditorFooter,
  createEditorShell,
  createEditorTabNav,
  createPresetButton,
  createSliderControl,
} from './shared';

interface ScannerPageItem {
  id: string;
  title: string;
  rotation: number;
  isBlank?: boolean;
}

interface MergeQueueItem {
  id: string;
  name: string;
  sizeMB: string;
  estimatedPages: number;
  file: File;
}

type ScanTab = 'pages' | 'enhance' | 'ocr' | 'deskew' | 'merge' | 'export';
type ExportFormat = 'pdf' | 'jpg' | 'txt';
type ScanPreset = 'original' | 'magic' | 'bw';

const TABS: { id: ScanTab; label: string }[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'enhance', label: 'Enhance' },
  { id: 'ocr', label: 'OCR' },
  { id: 'deskew', label: 'Deskew' },
  { id: 'merge', label: 'Merge' },
  { id: 'export', label: 'Export' },
];

const OCR_LANGUAGES = [
  { value: 'eng', label: 'English' },
  { value: 'spa', label: 'Spanish' },
  { value: 'fra', label: 'French' },
  { value: 'deu', label: 'German' },
];

const INITIAL_PAGES: ScannerPageItem[] = [
  { id: 'p-1', title: 'Page 1 (Cover)', rotation: 0 },
  { id: 'p-2', title: 'Page 2 (Invoice Details)', rotation: 0 },
  { id: 'p-3', title: 'Page 3 (Line Items)', rotation: 0 },
  { id: 'p-4', title: 'Page 4 (Terms & Signatures)', rotation: 0 },
];

export async function createPdfScannerPage(): Promise<HTMLElement> {
  let activeTab: ScanTab = 'pages';

  let uploadedFile: File | null = null;
  let uploadedFileName: string | null = null;
  let uploadedFileUrl: string | null = null;
  let uploadedFileType: 'pdf' | 'image' | null = null;

  let pages: ScannerPageItem[] = INITIAL_PAGES.map((page) => ({ ...page }));
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

  function createId(prefix = 'pdf') {
    return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  function showToast(
    message: string,
    variant: 'info' | 'success' = 'info',
  ) {
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

  function getFileType(file: File): 'pdf' | 'image' {
    return file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : 'image';
  }

  function createIcon(name: string) {
    const paths: Record<string, string> = {
      upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 16v4h16v-4',
      file: 'M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 0v5h5',
      zoomIn: 'M11 5v12m-6-6h12M21 21l-4.35-4.35',
      zoomOut: 'M5 11h12m4 10-4.35-4.35',
      rotate: 'M20 11a8 8 0 1 1-2.34-5.66L20 8m0-5v5h-5',
      close: 'M18 6 6 18M6 6l12 12',
      download: 'M12 3v12m0 0 5-5m-5 5-5-5M4 17v4h16v-4',
    };

    return svgElement(
      'svg',
      {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.7',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        class: 'pdf-icon',
        'aria-hidden': 'true',
      },
      svgElement('path', { d: paths[name] || paths.file }),
    );
  }

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
        loadDocumentFile(file);
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
    'Page 1 / 4',
  );

  const documentName = span(
    { className: 'pdf-document-name' },
    'No document loaded',
  );

  const uploadButton = createButton(
    'secondary',
    {
      type: 'button',
      className: 'pdf-button pdf-button-secondary',
      onclick: () => fileInput.click(),
    },
    'Upload document',
  );

  const exportButton = createButton(
    'primary',
    {
      type: 'button',
      className: 'pdf-button pdf-button-primary',
      onclick: () => triggerExport('pdf'),
    },
    'Export PDF',
  );

  const quickActions = div(
    { className: 'pdf-quick-actions' },
    div(
      { className: 'pdf-document-info' },
      pageCounter,
      documentName,
    ),
    div(
      { className: 'pdf-quick-buttons' },
      uploadButton,
      exportButton,
    ),
  );

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
  // Preview rendering
  // --------------------------------------------------

  function renderDocumentPreview() {
    pageCounter.textContent = `Page ${selectedPageIndex + 1} / ${pages.length}`;

    documentName.textContent =
      uploadedFileName || 'Sample document';

    if (!uploadedFileUrl || !uploadedFileType) {
      renderEmptyDropzone();
      return;
    }

    previewContainer.replaceChildren();

    const activePage = getActivePage();

    const wrapper = div({
      className: 'pdf-document-canvas',
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
    } else {
      const iframe = document.createElement('iframe');

      iframe.src = `${uploadedFileUrl}#toolbar=0&navpanes=0`;
      iframe.title = uploadedFileName || 'PDF document';
      iframe.className = 'pdf-document-frame';

      wrapper.append(iframe);
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

  const zoomOutBtn = button(
    {
      type: 'button',
      className: 'pdf-icon-button',
      title: 'Zoom out',
      'aria-label': 'Zoom out',
    },
    createIcon('zoomOut'),
  );

  const zoomLabel = span(
    { className: 'pdf-zoom-label' },
    '100%',
  );

  const zoomInBtn = button(
    {
      type: 'button',
      className: 'pdf-icon-button',
      title: 'Zoom in',
      'aria-label': 'Zoom in',
    },
    createIcon('zoomIn'),
  );

  const deskewLeftBtn = button(
    {
      type: 'button',
      className: 'pdf-hud-button',
      title: 'Rotate counterclockwise',
    },
    '−1°',
  );

  const deskewRightBtn = button(
    {
      type: 'button',
      className: 'pdf-hud-button',
      title: 'Rotate clockwise',
    },
    '+1°',
  );

  const rotate90Btn = button(
    {
      type: 'button',
      className: 'pdf-hud-button',
      title: 'Rotate 90 degrees',
    },
    createIcon('rotate'),
    '90°',
  );

  const ocrRunBtn = createButton(
    'primary',
    {
      type: 'button',
      className: 'pdf-button pdf-button-primary pdf-ocr-button',
      onclick: runOCR,
    },
    'Run OCR',
  );

  const stageHud = div(
    { className: 'pdf-stage-hud' },
    div(
      { className: 'pdf-zoom-controls' },
      zoomOutBtn,
      zoomLabel,
      zoomInBtn,
    ),
    div(
      { className: 'pdf-hud-divider' },
    ),
    deskewLeftBtn,
    deskewRightBtn,
    rotate90Btn,
    ocrRunBtn,
  );

  // --------------------------------------------------
  // Stage
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

  // --------------------------------------------------
  // Workspace
  // --------------------------------------------------

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
      loadDocumentFile(file);
    }
  });

  // --------------------------------------------------
  // File loading
  // --------------------------------------------------

  function loadDocumentFile(file: File) {
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

    pages = isImage
      ? [
          {
            id: createId('page'),
            title: `${file.name} (Scan)`,
            rotation: 0,
          },
        ]
      : [
          { id: createId('page'), title: 'Page 1', rotation: 0 },
        ];

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
      'OCR has not been executed on this document.',
    ].join('\n');

    renderDocumentPreview();
    renderToolControls();

    showToast(`Loaded ${file.name}`, 'success');
  }

  // --------------------------------------------------
  // Page thumbnails
  // --------------------------------------------------

  function createPageThumbnailItem(
    pageItem: ScannerPageItem,
    index: number,
  ) {
    const isSelected = index === selectedPageIndex;

    const thumbnail = div({
      className: `pdf-thumbnail ${isSelected ? 'is-selected' : ''}`,
      role: 'button',
      tabindex: 0,
      'aria-label': `Select ${pageItem.title}`,
      onclick: () => selectPage(index),
    });

    const pagePreview = div(
      { className: 'pdf-thumbnail-preview' },
      div({ className: 'pdf-thumbnail-lines' }),
      div({ className: 'pdf-thumbnail-lines short' }),
      div({ className: 'pdf-thumbnail-lines' }),
      div({ className: 'pdf-thumbnail-lines medium' }),
    );

    const pageNumber = span(
      { className: 'pdf-thumbnail-number' },
      `${index + 1}`,
    );

    const pageName = span(
      { className: 'pdf-thumbnail-name' },
      pageItem.title,
    );

    const actions = div(
      { className: 'pdf-thumbnail-actions' },
      button(
        {
          type: 'button',
          title: 'Move up',
          disabled: index === 0,
          onclick: (event: Event) => {
            event.stopPropagation();
            movePage(index, -1);
          },
        },
        '↑',
      ),
      button(
        {
          type: 'button',
          title: 'Move down',
          disabled: index === pages.length - 1,
          onclick: (event: Event) => {
            event.stopPropagation();
            movePage(index, 1);
          },
        },
        '↓',
      ),
      button(
        {
          type: 'button',
          title: 'Delete page',
          onclick: (event: Event) => {
            event.stopPropagation();
            deletePage(index);
          },
        },
        '×',
      ),
    );

    thumbnail.append(pagePreview, pageNumber, pageName, actions);

    thumbnail.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectPage(index);
      }
    });

    return thumbnail;
  }

  function selectPage(index: number) {
    if (index < 0 || index >= pages.length) {
      return;
    }

    selectedPageIndex = index;

    renderDocumentPreview();
    renderToolControls();
  }

  function movePage(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= pages.length) {
      return;
    }

    [pages[index], pages[target]] = [pages[target], pages[index]];

    selectedPageIndex = target;

    renderDocumentPreview();
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

    renderDocumentPreview();
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

    renderDocumentPreview();
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

    renderDocumentPreview();
    renderToolControls();

    showToast('Page duplicated', 'success');
  }

  // --------------------------------------------------
  // Inspector rendering
  // --------------------------------------------------

  function renderToolControls() {
    toolContainer.replaceChildren();

    switch (activeTab) {
      case 'pages':
        renderPagesControls();
        break;

      case 'enhance':
        renderEnhanceControls();
        break;

      case 'ocr':
        renderOCRControls();
        break;

      case 'deskew':
        renderDeskewControls();
        break;

      case 'merge':
        renderMergeControls();
        break;

      case 'export':
        renderExportControls();
        break;
    }

    renderSummary();
  }

  function createSectionTitle(title: string, description?: string) {
    return div(
      { className: 'pdf-section-heading' },
      p({ className: 'pdf-section-title' }, title),
      description
        ? p({ className: 'pdf-section-description' }, description)
        : '',
    );
  }

  function createControlGroup(...children: HTMLElement[]) {
    return div(
      { className: 'pdf-control-group' },
      ...children,
    );
  }

  function renderPagesControls() {
    const pageList = div(
      { className: 'pdf-page-list' },
      ...pages.map((page, index) =>
        createPageThumbnailItem(page, index),
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
        const row = div(
          { className: 'pdf-merge-item' },
          div(
            { className: 'pdf-merge-file-info' },
            span({ className: 'pdf-merge-number' }, `${index + 1}`),
            div(
              { className: 'pdf-merge-file-details' },
              span({ className: 'pdf-merge-file-name' }, item.name),
              span(
                { className: 'pdf-merge-file-size' },
                `${item.sizeMB} MB`,
              ),
            ),
          ),
          button(
            {
              type: 'button',
              className: 'pdf-remove-button',
              title: 'Remove file',
              onclick: () => {
                mergeQueue = mergeQueue.filter(
                  (entry) => entry.id !== item.id,
                );

                renderToolControls();
              },
            },
            createIcon('close'),
          ),
        );

        queueList.append(row);
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
          onclick: mergeDocuments,
        },
        `Add ${mergeQueue.length} file(s) to workspace`,
      ),
      p(
        { className: 'pdf-helper-text' },
        'Queued files are tracked separately. Actual PDF merging requires the server-side merge operation.',
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

    const summary = div(
      { className: 'pdf-summary' },
      p({ className: 'pdf-summary-title' }, 'Document summary'),
      div(
        { className: 'pdf-summary-row' },
        span({}, 'File'),
        strong({}, uploadedFileName || 'No document'),
      ),
      div(
        { className: 'pdf-summary-row' },
        span({}, 'Pages'),
        strong({}, `${pages.length}`),
      ),
      div(
        { className: 'pdf-summary-row' },
        span({}, 'Rotation'),
        strong(
          {},
          `${(page?.rotation ?? 0) + deskewAngle}°`,
        ),
      ),
      div(
        { className: 'pdf-summary-row' },
        span({}, 'OCR'),
        strong({}, ocrEnabled ? 'Enabled' : 'Disabled'),
      ),
    );

    toolContainer.append(summary);
  }

  // --------------------------------------------------
  // Enhancement
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

  // --------------------------------------------------
  // Rotation
  // --------------------------------------------------

  function rotateActivePage() {
    const page = getActivePage();

    if (!page) {
      return;
    }

    page.rotation = (page.rotation + 90) % 360;

    applyVisualTransforms();
    renderToolControls();
  }

  // --------------------------------------------------
  // OCR
  // --------------------------------------------------

  function runOCR() {
    if (!uploadedFile) {
      showToast('Upload a document first');
      return;
    }

    ocrEnabled = true;

    switchTab('ocr');

    showToast(
      'OCR is enabled. Connect an OCR processing service to extract actual document text.',
    );
  }

  // --------------------------------------------------
  // Merge
  // --------------------------------------------------

  function mergeDocuments() {
    if (!mergeQueue.length) {
      return;
    }

    const queued = [...mergeQueue];

    queued.forEach((item) => {
      pages.push({
        id: createId('page'),
        title: `${item.name} (Queued)`,
        rotation: 0,
      });
    });

    selectedPageIndex = pages.length - 1;
    mergeQueue = [];

    renderDocumentPreview();
    renderToolControls();

    showToast(
      `${queued.length} file(s) added to workspace queue`,
      'success',
    );
  }

  // --------------------------------------------------
  // Export
  // --------------------------------------------------

  async function triggerExport(format: ExportFormat) {
    if (!uploadedFile) {
      showToast('Upload a document before exporting');
      return;
    }

    const baseName = getBaseName();

    if (format === 'txt') {
      const blob = new Blob(
        [extractedText],
        { type: 'text/plain;charset=utf-8' },
      );

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
            pageCount: pages.length,
            ocrEnabled,
            language: ocrLanguage,
            deskewAngle,
            brightness,
            contrast,
            grayscale,
            pages: pages.map((page) => ({
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

    if (format === 'pdf' && uploadedFileType === 'pdf') {
      downloadBlob(
        uploadedFile,
        `${baseName}-edited.pdf`,
      );

      showToast(
        'Original PDF downloaded. Preview adjustments are not embedded in browser export.',
        'success',
      );

      return;
    }

    if (format === 'jpg' && uploadedFileType === 'image') {
      downloadBlob(
        uploadedFile,
        `${baseName}-edited.jpg`,
      );

      showToast(
        'Original image downloaded. Preview adjustments are not embedded in browser export.',
        'success',
      );

      return;
    }

    showToast(
      'This export format requires server-side document conversion.',
    );
  }

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
      buttonElement.setAttribute(
        'aria-selected',
        String(selected),
      );
    });

    renderToolControls();
  }

  // --------------------------------------------------
  // HUD event listeners
  // --------------------------------------------------

  zoomOutBtn.addEventListener('click', () => {
    zoomLevel = Math.max(50, zoomLevel - 15);
    applyVisualTransforms();
  });

  zoomInBtn.addEventListener('click', () => {
    zoomLevel = Math.min(220, zoomLevel + 15);
    applyVisualTransforms();
  });

  deskewLeftBtn.addEventListener('click', () => {
    deskewAngle = Math.max(-15, deskewAngle - 1);
    applyVisualTransforms();

    if (activeTab === 'deskew') {
      renderToolControls();
    }
  });

  deskewRightBtn.addEventListener('click', () => {
    deskewAngle = Math.min(15, deskewAngle + 1);
    applyVisualTransforms();

    if (activeTab === 'deskew') {
      renderToolControls();
    }
  });

  rotate90Btn.addEventListener('click', rotateActivePage);

  ocrRunBtn.addEventListener('click', runOCR);

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

  renderDocumentPreview();
  renderToolControls();
  updateFullscreenButton();

  return root;
}