
import { FILTER_DEFINITIONS } from './types';

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attributes: Record<string, string> = {},
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);

  if (className) element.className = className;

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  return element;
};

const button = (
  label: string,
  action: string,
  variant = '',
): HTMLButtonElement => {
  const element = createElement('button', `ie-button ${variant}`.trim(), {
    type: 'button',
    'data-action': action,
  });

  element.textContent = label;
  return element;
};

const section = (
  title: string,
  content: HTMLElement[],
): HTMLElement => {
  const wrapper = createElement('section', 'ie-section');

  const heading = createElement('h2', 'ie-section-title');
  heading.textContent = title;

  wrapper.append(heading, ...content);
  return wrapper;
};

const field = (
  label: string,
  control: HTMLElement,
  className = '',
): HTMLLabelElement => {
  const wrapper = createElement(
    'label',
    `ie-field ${className}`.trim(),
  );

  const title = createElement('span', 'ie-field-label');
  title.textContent = label;

  wrapper.append(title, control);
  return wrapper;
};

const rangeControl = (
  role: string,
  min: number,
  max: number,
  value: number,
  step = 1,
): HTMLInputElement => {
  return createElement('input', '', {
    type: 'range',
    min: String(min),
    max: String(max),
    value: String(value),
    step: String(step),
    'data-role': role,
  });
};

const valueLabel = (
  role: string,
  value: string,
): HTMLSpanElement => {
  const element = createElement('span', 'ie-value', {
    'data-role': role,
    'aria-live': 'polite',
  });

  element.textContent = value;
  return element;
};

const buttonRow = (
  ...buttons: HTMLButtonElement[]
): HTMLDivElement => {
  const row = createElement('div', 'ie-button-row');
  row.append(...buttons);
  return row;
};

export function buildImageStudioShell(): HTMLDivElement {
  const root = createElement('div', 'image-studio');

  // Header
  const header = createElement('header', 'ie-topbar');
  header.setAttribute('aria-label', 'Image studio toolbar');

  const brand = createElement('div', 'ie-brand');
  brand.textContent = 'PIXEL';

  const brandAccent = createElement('span');
  brandAccent.textContent = 'STUDIO';
  brand.append(brandAccent);

  const actions = createElement('div', 'ie-header-actions');

  actions.append(
    button('Open image', 'open'),
    button('Import project', 'import-project'),
    button('Export project JSON', 'save-project'),
    button('Flush all', 'flush-all'),
  );

  const savedProjects = createElement('select', 'ie-select', {
    'data-role': 'saved-projects',
    'aria-label': 'Saved projects',
  });

  savedProjects.style.width = '150px';

  const savedOption = createElement('option');
  savedOption.value = '';
  savedOption.textContent = 'Saved projects';
  savedProjects.append(savedOption);

  const exportFormat = createElement('select', 'ie-select', {
    'data-role': 'export-format',
    'aria-label': 'Export format',
  });

  exportFormat.style.width = '95px';

  const formats = [
    ['image/png', 'PNG'],
    ['image/jpeg', 'JPEG'],
    ['image/webp', 'WebP'],
    ['image/avif', 'AVIF'],
  ];

  for (const [value, label] of formats) {
    const option = createElement('option');
    option.value = value;
    option.textContent = label;
    exportFormat.append(option);
  }

  actions.append(
    savedProjects,
    exportFormat,
    button('Export image', 'export', 'primary'),
  );

  const status = createElement('div', 'ie-status-wrap', {
    role: 'status',
    'aria-live': 'polite',
  });

  const loader = createElement('span', 'ie-loader', {
    'data-role': 'loader',
    'aria-label': 'Processing',
  });

  loader.hidden = true;

  const statusText = createElement('span', 'ie-status', {
    'data-role': 'status',
  });

  statusText.textContent = 'Ready';

  status.append(loader, statusText);

  const fileInput = createElement('input', '', {
    type: 'file',
    accept: 'image/*',
    multiple: '',
    hidden: '',
    'data-role': 'file-input',
    'aria-label': 'Choose images',
  });

  const projectInput = createElement('input', '', {
    type: 'file',
    accept: '.json,application/json',
    hidden: '',
    'data-role': 'project-input',
    'aria-label': 'Import project',
  });

  header.append(
    brand,
    actions,
    status,
    fileInput,
    projectInput,
  );

  // Navigation
  const tabs = createElement('nav', 'ie-tabs', {
    'data-role': 'tabs',
    'aria-label': 'Editor tools',
  });

  // Left sidebar
  const leftSidebar = createElement('aside', 'ie-sidebar left', {
    'aria-label': 'Image tools',
  });

  // Transform
  leftSidebar.append(
    section('Transform', [
      buttonRow(
        button('↶ Rotate', 'rotate-left'),
        button('Rotate ↷', 'rotate-right'),
      ),
      buttonRow(
        button('Flip H', 'flip-x'),
        button('Flip V', 'flip-y'),
      ),
    ]),
  );

  // Crop
  const cropGrid = createElement('div', 'ie-crop-grid');

  const cropFields = [
    ['X', 'crop-x', '0'],
    ['Y', 'crop-y', '0'],
    ['Width', 'crop-width', '1'],
    ['Height', 'crop-height', '1'],
  ];

  for (const [label, role, initial] of cropFields) {
    const input = createElement('input', '', {
      type: 'number',
      min: role === 'crop-x' || role === 'crop-y' ? '0' : '1',
      value: initial,
      'data-role': role,
      'aria-label': `Crop ${label}`,
    });

    cropGrid.append(field(label, input));
  }

  const cropNote = createElement('p', 'ie-small-note');
  cropNote.textContent =
    'Crop coordinates refer to the original image before rotation.';

  leftSidebar.append(
    section('Crop · source pixels', [
      cropGrid,
      buttonRow(
        button('Apply crop', 'apply-crop'),
        button('Reset', 'reset-crop'),
      ),
      cropNote,
    ]),
  );

  // Mask brush
  const brushSize = rangeControl('brush-size', 2, 200, 32);

  const brushLabel = createElement('span', 'ie-field-label');
  brushLabel.textContent = 'Brush size';

  const brushValue = valueLabel('brush-value', '32 px');
  brushLabel.append(brushValue);

  const brushField = createElement('label', 'ie-field');
  brushField.append(brushLabel, brushSize);

  const maskCheckbox = createElement('input', '', {
    type: 'checkbox',
    'data-role': 'mask-enabled',
  });

  const maskLabel = createElement('label', 'ie-check');
  maskLabel.append(
    maskCheckbox,
    document.createTextNode(' Apply adjustments only to mask'),
  );

  const maskNote = createElement('p', 'ie-small-note');
  maskNote.textContent =
    'Paint directly on the image to define the adjustment area.';

  leftSidebar.append(
    section('Mask brush', [
      button('Enable mask brush', 'toggle-brush'),
      brushField,
      maskLabel,
      button('Clear mask', 'clear-mask'),
      maskNote,
    ]),
  );

  // View
  const zoom = rangeControl('zoom', 25, 400, 100, 5);

  const zoomLabel = createElement('span', 'ie-field-label');
  zoomLabel.textContent = 'Zoom';

  zoomLabel.append(valueLabel('zoom-value', '100%'));

  const zoomField = createElement('label', 'ie-field');
  zoomField.append(zoomLabel, zoom);

  leftSidebar.append(
    section('View', [
      zoomField,
      button('Fit image', 'fit'),
    ]),
  );

  // Workspace
  const workspace = createElement('main', 'ie-workspace', {
    'aria-label': 'Image editing workspace',
  });

  const toolbar = createElement('div', 'ie-workspace-toolbar');

  const documentInfo = createElement('span', '', {
    'data-role': 'document-info',
  });

  documentInfo.textContent = 'No image open';

  const renderInfo = createElement('span', '', {
    'data-role': 'render-info',
  });

  toolbar.append(documentInfo, renderInfo);

  const canvasScroll = createElement('div', 'ie-canvas-scroll', {
    'data-role': 'canvas-scroll',
  });

  const emptyState = createElement('div', 'ie-empty', {
    'data-role': 'empty',
  });

  const emptyTitle = createElement('strong');
  emptyTitle.textContent = 'Open an image to begin';

  const emptyDescription = createElement('p');
  emptyDescription.textContent =
    'Your original image remains unchanged. All edits are stored as project settings.';

  emptyState.append(emptyTitle, emptyDescription);

  const canvasFrame = createElement('div', 'ie-canvas-frame', {
    'data-role': 'canvas-frame',
  });

  canvasFrame.hidden = true;

  const canvas = createElement('canvas', 'ie-main-canvas', {
    'data-role': 'canvas',
    'aria-label': 'Image editing canvas',
  });

  const maskOverlay = createElement('canvas', 'ie-mask-overlay', {
    'data-role': 'mask-overlay',
    'aria-hidden': 'true',
  });

  canvasFrame.append(canvas, maskOverlay);
  canvasScroll.append(emptyState, canvasFrame);

  workspace.append(toolbar, canvasScroll);

  // Right sidebar
  const rightSidebar = createElement('aside', 'ie-sidebar right', {
    'aria-label': 'Image adjustments',
  });

  const filterContainer = createElement('div', '', {
    'data-role': 'filter-controls',
  });

  rightSidebar.append(
    section('Adjustments', [filterContainer]),
  );

  // Text overlay
  const textInput = createElement('input', '', {
    type: 'text',
    'data-role': 'text',
    placeholder: 'Enter text...',
    'aria-label': 'Watermark or caption',
  });

  const textNote = createElement('p', 'ie-small-note');
  textNote.textContent =
    'Text is rendered during preview and export.';

  rightSidebar.append(
    section('Text overlay', [
      field('Bottom watermark / caption', textInput),
      textNote,
    ]),
  );

  // Export quality
  const quality = rangeControl('quality', 10, 100, 92);

  const qualityLabel = createElement('span', 'ie-field-label');
  qualityLabel.textContent = 'Quality';

  qualityLabel.append(valueLabel('quality-value', '92%'));

  const qualityField = createElement('label', 'ie-field');
  qualityField.append(qualityLabel, quality);

  const qualityNote = createElement('p', 'ie-small-note');
  qualityNote.textContent =
    'Quality affects JPEG, WebP and AVIF. PNG is lossless.';

  rightSidebar.append(
    section('Export quality', [
      qualityField,
      qualityNote,
    ]),
  );

  // Project
  rightSidebar.append(
    section('Project', [
      buttonRow(
        button('Reset edits', 'reset'),
        button('Close document', 'close'),
      ),
    ]),
  );

  // Layout
  const layout = createElement('div', 'ie-layout');
  layout.append(leftSidebar, workspace, rightSidebar);

  // Footer
  const footer = createElement('footer', 'ie-footer');

  const engineDescription = createElement('span');
  engineDescription.textContent =
    'Worker rendering · Tiled processing · IndexedDB autosave';

  const engineStatus = createElement('span', '', {
    'data-role': 'engine-status',
    'aria-live': 'polite',
  });

  engineStatus.textContent = 'Checking renderer…';

  footer.append(engineDescription, engineStatus);

  root.append(header, tabs, layout, footer);

  return root;
}

export function buildFilterControls(
  container: HTMLDivElement,
): void {
  const fragment = document.createDocumentFragment();

  for (const definition of FILTER_DEFINITIONS) {
    const wrapper = createElement('label', 'ie-field');

    const header = createElement('span', 'ie-field-label');

    const title = createElement('span');
    title.textContent = definition.label;

    const value = createElement('span', 'ie-value', {
      'data-filter-value': definition.key,
      'aria-live': 'polite',
    });

    value.textContent = '0';

    header.append(title, value);

    const input = rangeControl(
      '',
      definition.min,
      definition.max,
      0,
      definition.step,
    );

    input.removeAttribute('data-role');
    input.setAttribute('data-filter', definition.key);
    input.setAttribute('aria-label', definition.label);

    wrapper.append(header, input);
    fragment.append(wrapper);
  }

  container.replaceChildren(fragment);
}
