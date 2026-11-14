import { button, cn, createButton, div, h2, p, span, uiClasses } from '../components/ui/dom';

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
    className: cn(
      'group relative flex h-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-[0_18px_36px_rgba(15,23,42,0.22)] transition-all hover:border-slate-700 hover:bg-slate-900',
      options?.cardClassName
    ),
  });

  const headerRow = div({ className: 'flex items-start justify-between gap-3' },
    div({ className: 'flex items-center gap-3' },
      feature.icon ? div({ className: 'rounded-xl bg-slate-800/80 p-2.5 text-cyan-400 border border-slate-700/50' }, feature.icon) : '',
      h2({ className: 'm-0 text-xl font-bold text-white tracking-tight' }, feature.title)
    ),
    feature.badge
      ? span({ className: 'rounded-full bg-cyan-950/80 px-2.5 py-1 text-[10px] font-mono font-bold text-cyan-300 border border-cyan-800/50' }, feature.badge)
      : ''
  );

  card.append(
    headerRow,
    p({ className: 'm-0 text-sm leading-6 text-slate-400' }, feature.description)
  );

  const actionButton = createButton('primary', {
    type: 'button',
    className: cn('mt-auto w-full transition-all group-hover:shadow-cyan-600/20', options?.actionClassName)
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
  gridClassName = 'mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4'
): HTMLElement {
  const grid = div({ className: gridClassName });
  features.forEach((feature) => {
    grid.appendChild(createFeatureCard(feature, onNavigate));
  });
  return grid;
}

export function createDetailPanel(
  title: string,
  details: Array<{ label: string; value: string | HTMLElement }>,
  panelClassName?: string
): HTMLElement {
  const panel = div({ className: cn(uiClasses.panel, 'flex flex-col gap-3', panelClassName) });

  details.forEach(({ label, value }) => {
    const item = p({ className: 'm-0 text-sm text-slate-400 flex justify-between items-center' },
      span({ className: 'font-semibold text-slate-300' }, `${label}:`),
      typeof value === 'string' ? span({ className: 'text-slate-100 font-mono text-xs' }, value) : value
    );
    panel.append(item);
  });

  if (title) {
    panel.prepend(
      h2({ className: 'm-0 text-lg font-bold text-white tracking-tight mb-1 border-b border-slate-800 pb-2' }, title)
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
  activeClassName = 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner',
  inactiveClassName = 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
): HTMLButtonElement {
  return button({
    type: 'button',
    role: 'tab',
    'aria-selected': isActive.toString(),
    className: cn(
      'editor-tab inline-flex min-w-[75px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-all sm:min-w-[110px] sm:px-3 sm:text-[11px]',
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
  const nav = div({
    role: 'tablist',
    className: options?.containerClassName ?? 'flex flex-wrap gap-1.5 px-3 pb-2 sm:gap-2 sm:px-5'
  });

  tabs.forEach((tab) => {
    nav.append(
      createEditorTabButton(
        tab,
        activeTab === tab.id,
        onSelect,
        options?.activeClassName,
        options?.inactiveClassName
      )
    );
  });

  return nav;
}

export function createEditorTitleRow(
  title: string,
  onReset: () => void,
  onToggleFullscreen: () => void,
  subtitle?: string
): { titleRow: HTMLElement; fullscreenButton: HTMLButtonElement; closeButton: HTMLButtonElement } {
  const fullscreenButton = button({
    type: 'button',
    className: 'flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/50 text-xl leading-none text-slate-200 transition hover:bg-slate-800 hover:text-white shadow-sm',
    title: 'Toggle fullscreen editor view',
    onclick: onToggleFullscreen,
  }, '⤢');

  const closeButton = button({
    type: 'button',
    className: 'flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/50 text-2xl leading-none text-slate-200 transition hover:bg-slate-800 hover:text-white shadow-sm',
    title: 'Close editor',
    onclick: onReset,
  }, '×');

  const titleContent = div({ className: 'flex flex-col gap-0.5' },
    div({ className: 'text-[1.35rem] leading-none font-bold tracking-tight text-slate-50 sm:text-[1.85rem]' }, title),
    subtitle ? p({ className: 'text-xs text-slate-400 m-0' }, subtitle) : ''
  );

  const titleRow = div({ className: 'flex flex-col gap-3 px-3 pt-4 pb-2 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6 sm:pb-4' },
    titleContent,
    div({ className: 'flex items-center gap-2 self-end sm:self-auto' }, fullscreenButton, closeButton)
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
  rootClassName = 'min-h-screen p-2 sm:p-8 lg:p-10 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm',
  modalClassName = 'w-full max-w-[1120px] rounded-[28px] border border-slate-700/70 bg-[#536d7b] shadow-[0_25px_60px_rgba(15,23,42,0.35)] overflow-hidden flex flex-col',
  wrapperClassName = 'w-full flex flex-col'
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

export function createEditorFooter(
  onCancel: () => void,
  onSave: () => void,
  saveLabel = 'Save changes',
  cancelLabel = 'Cancel',
  extraAction?: HTMLElement
): HTMLElement {
  const footerLeft = div({ className: 'flex items-center gap-2' }, extraAction || '');
  const footerRight = div({ className: 'flex items-center gap-3' },
    button({
      type: 'button',
      className: 'rounded-xl border border-slate-400/40 bg-transparent px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-200 transition hover:border-slate-300 hover:bg-slate-900/20 hover:text-white',
      onclick: onCancel,
    }, cancelLabel),
    button({
      type: 'button',
      className: 'rounded-xl bg-[#4ec7a6] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 shadow-[0_12px_24px_rgba(78,199,166,0.35)] transition hover:bg-[#5fdcb3] active:scale-[0.98]',
      onclick: onSave,
    }, saveLabel)
  );

  return div({ className: 'flex items-center justify-between px-5 pb-5 pt-3 border-t border-white/5 bg-black/10' },
    footerLeft,
    footerRight
  );
}

// ==========================================
// NEW: Toast Notification System
// ==========================================

export interface ToastOptions {
  message: string;
  variant?: 'info' | 'success' | 'error' | 'warning';
  durationMs?: number;
}

export function createToastSystem() {
  const container = div({
    className: 'pointer-events-none fixed top-4 right-4 z-50 flex flex-col items-end gap-2.5 max-w-sm w-full px-4',
  });

  if (typeof document !== 'undefined') {
    document.body.appendChild(container);
  }

  function show({ message, variant = 'info', durationMs = 3000 }: ToastOptions) {
    const variantStyles = {
      info: 'border-cyan-500/40 bg-slate-900/95 text-cyan-200 shadow-cyan-950/40',
      success: 'border-emerald-500/40 bg-slate-900/95 text-emerald-300 shadow-emerald-950/40',
      error: 'border-rose-500/40 bg-slate-900/95 text-rose-300 shadow-rose-950/40',
      warning: 'border-amber-500/40 bg-slate-900/95 text-amber-200 shadow-amber-950/40',
    };

    const toast = div(
      {
        className: cn(
          'pointer-events-auto flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-medium shadow-xl backdrop-blur-md transition-all duration-300 translate-y-2 opacity-0',
          variantStyles[variant]
        ),
      },
      span({ className: 'flex-1 pr-2' }, message)
    );

    container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    const dismiss = () => {
      toast.classList.add('translate-y-[-8px]', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    };

    const timer = setTimeout(dismiss, durationMs);
    toast.onclick = () => {
      clearTimeout(timer);
      dismiss();
    };
  }

  return { container, show };
}

// Global shared toast instance
export const globalToast = createToastSystem();

// ==========================================
// NEW: Modal State & Lifecycle Manager
// ==========================================

export interface ModalManagerOptions {
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
}

export function createModalManager(rootElement: HTMLElement, options: ModalManagerOptions = {}) {
  const { onClose, closeOnEscape = true, closeOnBackdropClick = true } = options;
  let isOpen = true;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (closeOnEscape && e.key === 'Escape' && isOpen) {
      close();
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (closeOnBackdropClick && e.target === rootElement && isOpen) {
      close();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeyDown);
    rootElement.addEventListener('click', handleBackdropClick);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeyDown);
      rootElement.removeEventListener('click', handleBackdropClick);
    }

    rootElement.style.opacity = '0';
    rootElement.style.transition = 'opacity 0.2s ease-out';
    setTimeout(() => {
      rootElement.remove();
      onClose?.();
    }, 200);
  }

  return {
    close,
    isOpen: () => isOpen,
  };
}