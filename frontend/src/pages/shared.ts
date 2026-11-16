import { button, cn, createButton, div, h2, input, p, span, uiClasses } from '../components/ui/dom';
import { appStore, mediaModeActions, type MediaProcessingMode } from '../appState';

export interface DashboardFeature {
  title: string;
  description: string;
  route: string;
  action: string;
  badge?: string;
  icon?: HTMLElement;
}

export function createFeatureCard(
  feature: DashboardFeature,
  onNavigate: (route: string) => void,
  options?: { cardClassName?: string; actionClassName?: string }
): HTMLElement {
  const card = div({
    className: cn('fluent-feature-card', options?.cardClassName),
  });

  const headerRow = div({ className: 'fluent-feature-header' },
    div({ className: 'fluent-feature-heading' },
      feature.icon ? div({ className: 'fluent-feature-icon' }, feature.icon) : '',
      h2({ className: 'fluent-feature-title' }, feature.title)
    ),
    feature.badge
      ? span({ className: 'fluent-feature-badge' }, feature.badge)
      : ''
  );

  card.append(
    headerRow,
    p({ className: 'fluent-feature-desc' }, feature.description)
  );

  const actionButton = createButton('primary', {
    type: 'button',
    className: cn('fluent-feature-action', options?.actionClassName)
  }, feature.action);

  actionButton.addEventListener('click', (e) => {
    e.stopPropagation();
    onNavigate(feature.route);
  });

  card.appendChild(actionButton);
  return card;
}

export function createFeatureGrid(
  features: DashboardFeature[],
  onNavigate: (route: string) => void,
  gridClassName = 'fluent-feature-grid'
): HTMLElement {
  const grid = div({ className: gridClassName });
  features.forEach((feature) => {
    grid.appendChild(createFeatureCard(feature, onNavigate));
  });
  return grid;
}

export function createMediaProcessingModeSelector(options?: { label?: string; className?: string }): HTMLElement {
  const labelText = options?.label ?? 'Edit location';
  const wrapper = div({
    className: cn('fluent-mode-selector', options?.className)
  });

  const title = p({ className: 'fluent-mode-title' }, labelText);
  const buttons = div({ className: 'fluent-mode-buttons' });

  const browserButton = button({
    type: 'button',
    className: 'fluent-mode-button fluent-mode-button-browser',
    onclick: () => mediaModeActions.set('browser')
  }, 'Browser');

  const serverButton = button({
    type: 'button',
    className: 'fluent-mode-button fluent-mode-button-server',
    onclick: () => mediaModeActions.set('server')
  }, 'Server');

  const syncSelection = (nextMode: MediaProcessingMode) => {
    const isBrowser = nextMode === 'browser';
    browserButton.className = cn(
      'fluent-mode-button',
      'fluent-mode-button-browser',
      isBrowser && 'fluent-mode-button-active'
    );
    serverButton.className = cn(
      'fluent-mode-button',
      'fluent-mode-button-server',
      !isBrowser && 'fluent-mode-button-active'
    );
    browserButton.setAttribute('aria-pressed', String(isBrowser));
    serverButton.setAttribute('aria-pressed', String(!isBrowser));
  };

  buttons.append(browserButton, serverButton);
  wrapper.append(title, buttons);
  syncSelection(appStore.getState().mediaProcessingMode ?? 'browser');
  appStore.subscribe((state) => syncSelection(state.mediaProcessingMode ?? 'browser'));

  return wrapper;
}

export function createDetailPanel(
  title: string,
  details: Array<{ label: string; value: string | HTMLElement }>,
  panelClassName?: string
): HTMLElement {
  const panel = div({ className: cn('fluent-detail-panel', uiClasses.panel, panelClassName) });

  details.forEach(({ label, value }) => {
    const item = div({ className: 'fluent-detail-item' },
      span({ className: 'fluent-detail-label' }, `${label}:`),
      typeof value === 'string' ? span({ className: 'fluent-detail-value-text' }, value) : value
    );
    panel.append(item);
  });

  if (title) {
    panel.prepend(
      h2({ className: 'fluent-detail-heading' }, title)
    );
  }

  return panel;
}

export function createWorkspaceButton(
  variant: 'primary' | 'secondary' = 'primary',
  label: string,
  attributes?: Record<string, any>
): HTMLButtonElement {
  return button({
    ...attributes,
    type: 'button',
    className: cn(variant === 'primary' ? uiClasses.primaryButton : uiClasses.secondaryButton, attributes?.className),
  }, label);
}

export function createEditorTabButton<T extends string>(
  tab: { id: T; label: string; icon?: string },
  isActive: boolean,
  onSelect: (tabId: T) => void,
  activeClassName = 'fluent-tab-active',
  inactiveClassName = 'fluent-tab-inactive'
): HTMLButtonElement {
  return button({
    type: 'button',
    role: 'tab',
    'aria-selected': isActive.toString(),
    className: cn(
      'editor-tab',
      isActive ? activeClassName : inactiveClassName
    ),
    onclick: () => onSelect(tab.id)
  }, tab.icon ? `${tab.icon} ${tab.label}` : tab.label);
}

export function createEditorTabNav<T extends string>(
  tabs: Array<{ id: T; label: string; icon?: string }>,
  activeTab: T,
  onSelect: (tabId: T) => void,
  options?: {
    activeClassName?: string;
    inactiveClassName?: string;
    containerClassName?: string;
  }
): HTMLElement {
  const navEl = div({
    role: 'tablist',
    className: options?.containerClassName ?? 'editor-tablist'
  });

  tabs.forEach((tab) => {
    navEl.append(
      createEditorTabButton(
        tab,
        activeTab === tab.id,
        onSelect,
        options?.activeClassName,
        options?.inactiveClassName
      )
    );
  });

  return navEl;
}

export function createEditorTitleRow(
  title: string,
  onReset: () => void,
  onToggleFullscreen: () => void,
  subtitle?: string
): { titleRow: HTMLElement; fullscreenButton: HTMLButtonElement; closeButton: HTMLButtonElement } {
  const fullscreenButton = button({
    type: 'button',
    className: 'editor-title-icon-btn',
    title: 'Toggle fullscreen editor view',
    onclick: onToggleFullscreen,
  }, '⤢');

  const closeButton = button({
    type: 'button',
    className: 'editor-title-icon-btn editor-close-btn',
    title: 'Close editor',
    onclick: onReset,
  }, '×');

  const titleContent = div({ className: 'editor-title-content' },
    div({ className: 'editor-title-heading' }, title),
    subtitle ? p({ className: 'editor-title-subheading' }, subtitle) : ''
  );

  const titleRow = div({ className: 'editor-title-row' },
    titleContent,
    div({ className: 'editor-title-actions-wrap' }, fullscreenButton, closeButton)
  );

  return { titleRow, fullscreenButton, closeButton };
}

export function createEditorShell({
  title,
  subtitle,
  nav,
  workspace,
  footer,
  onReset,
  onToggleFullscreen,
  rootClassName = 'editor-shell-root',
  modalClassName = 'editor-shell-modal',
  wrapperClassName = 'editor-shell-wrapper'
}: {
  title: string;
  subtitle?: string;
  nav: HTMLElement;
  workspace: HTMLElement;
  footer: HTMLElement;
  onReset: () => void;
  onToggleFullscreen: () => void;
  rootClassName?: string;
  modalClassName?: string;
  wrapperClassName?: string;
}): { root: HTMLElement; modal: HTMLElement; titleRow: HTMLElement; fullscreenButton: HTMLButtonElement } {
  const { titleRow, fullscreenButton } = createEditorTitleRow(title, onReset, onToggleFullscreen, subtitle);

  const root = div({ className: rootClassName });
  const modal = div({ className: modalClassName });
  const modalWrap = div({ className: wrapperClassName }, titleRow, nav, workspace, footer);

  modal.append(modalWrap);
  root.append(modal);

  return { root, modal, titleRow, fullscreenButton };
}

export function bindEditorFullscreenButton({
  modal,
  fullscreenButton,
}: {
  modal: HTMLElement;
  fullscreenButton: HTMLButtonElement;
}): { refreshFullscreenButton: () => void; toggleFullscreen: () => void } {
  const refreshFullscreenButton = () => {
    fullscreenButton.textContent = document.fullscreenElement === modal ? '⤡' : '⤢';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement === modal) {
      void document.exitFullscreen();
      return;
    }
    void modal.requestFullscreen();
  };

  document.addEventListener('fullscreenchange', refreshFullscreenButton);
  refreshFullscreenButton();

  return { refreshFullscreenButton, toggleFullscreen };
}

export function createSliderControl(
  title: string,
  value: number,
  min: number,
  max: number,
  onChangeOrUnit: ((value: number) => void) | string,
  maybeOnChange?: (value: number) => void,
  options?: {
    unit?: string;
    labelClassName?: string;
    valueClassName?: string;
    trackClassName?: string;
    containerClassName?: string;
  }
): HTMLElement {
  const unit = typeof onChangeOrUnit === 'string' ? onChangeOrUnit : options?.unit ?? '%';
  const onChange = typeof onChangeOrUnit === 'function' ? onChangeOrUnit : maybeOnChange ?? (() => undefined);

  const valDisplay = span({
    className: cn('fluent-slider-val', options?.valueClassName)
  }, `${value}${unit}`);

  const slider = input({
    type: 'range',
    min: String(min),
    max: String(max),
    value: String(value),
    step: unit === '°' ? '0.5' : '1',
    className: cn(
      'fluent-range-input',
      options?.trackClassName
    ),
    oninput: (e: Event) => {
      const nextValue = parseFloat((e.target as HTMLInputElement).value);
      valDisplay.textContent = `${nextValue}${unit}`;
      onChange(nextValue);
    }
  });

  return div(
    { className: cn('fluent-slider-container', options?.containerClassName) },
    div({ className: 'fluent-slider-header' },
      span({ className: cn('fluent-slider-label', options?.labelClassName) }, title),
      valDisplay
    ),
    slider
  );
}

export function createPresetButton(
  name: string,
  onClickOrIsActive: (() => void) | boolean,
  maybeOnClick?: (() => void) | boolean,
  options?: {
    activeClassName?: string;
    inactiveClassName?: string;
    buttonClassName?: string;
  }
): HTMLButtonElement {
  const hasBooleanSecondArg = typeof onClickOrIsActive === 'boolean';
  const onClick =
    typeof onClickOrIsActive === 'function'
      ? onClickOrIsActive
      : (typeof maybeOnClick === 'function' ? maybeOnClick : (() => undefined));
  const isActive =
    hasBooleanSecondArg
      ? onClickOrIsActive
      : (typeof maybeOnClick === 'boolean' ? maybeOnClick : false);

  return button(
    {
      type: 'button',
      className: cn(
        'fluent-preset-btn',
        isActive
          ? (options?.activeClassName ?? 'is-active')
          : (options?.inactiveClassName ?? 'is-inactive'),
        options?.buttonClassName
      ),
      onclick: onClick,
    },
    name
  );
}

export function createEditorFooter(
  onCancel: () => void,
  onSave: () => void,
  saveLabel = 'Save changes',
  cancelLabel = 'Cancel',
  extraAction?: HTMLElement
): HTMLElement {
  const footerLeft = div({ className: 'editor-footer-left' }, extraAction || '');
  const footerRight = div({ className: 'editor-footer-right' },
    button({
      type: 'button',
      className: 'editor-cancel-btn',
      onclick: onCancel,
    }, cancelLabel),
    button({
      type: 'button',
      className: 'editor-save-btn',
      onclick: onSave,
    }, saveLabel)
  );

  return div({ className: 'editor-footer-root' },
    footerLeft,
    footerRight
  );
}

export type {
  ToastOptions,
  ModalContentOptions,
  ModalManagerOptions,
} from '../components/ui/notifications';

export {
  createToast,
  createToastStack,
  globalToast,
  createModal,
  createModalManager,
} from '../components/ui/notifications';