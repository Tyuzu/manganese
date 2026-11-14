import { button, cn, div, h2, p, span } from './dom';

export interface ToastOptions {
  message: string;
  variant?: 'info' | 'success' | 'error' | 'warning';
  durationMs?: number;
  onDismiss?: () => void;
}

export function createToast(options: ToastOptions): HTMLElement {
  const { message, variant = 'info', durationMs = 3000, onDismiss } = options;

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

  const dismiss = () => {
    toast.classList.add('translate-y-[-8px]', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
    onDismiss?.();
  };

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  const timer = setTimeout(dismiss, durationMs);
  toast.onclick = () => {
    clearTimeout(timer);
    dismiss();
  };

  return toast;
}

export function createToastStack(options?: { position?: 'top-right' | 'top-left' | 'bottom-right'; className?: string }) {
  const container = div({
    className: cn(
      'pointer-events-none fixed z-50 flex w-full max-w-sm flex-col gap-2.5 px-4',
      options?.position === 'top-left'
        ? 'left-0 top-4 items-start'
        : options?.position === 'bottom-right'
          ? 'bottom-4 right-0 items-end'
          : 'right-0 top-4 items-end',
      options?.className
    ),
  });

  if (typeof document !== 'undefined') {
    document.body.appendChild(container);
  }

  const show = (toastOptions: ToastOptions) => {
    container.appendChild(createToast(toastOptions));
  };

  return { container, show };
}

export const globalToast = createToastStack();

export interface ModalContentOptions {
  title?: string;
  description?: string;
  body: HTMLElement;
  footer?: HTMLElement;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  onClose?: () => void;
}

export function createModal(options: ModalContentOptions): { root: HTMLElement; close: () => void; isOpen: () => boolean } {
  const {
    title,
    description,
    body,
    footer,
    size = 'lg',
    className,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    onClose,
  } = options;

  const root = div({
    className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm',
  });

  const panel = div({
    className: cn(
      'w-full rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl',
      size === 'sm' ? 'max-w-sm' : size === 'md' ? 'max-w-md' : size === 'xl' ? 'max-w-5xl' : 'max-w-2xl',
      className
    )
  });

  const header = title || description
    ? div({ className: 'flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4' },
        div({ className: 'space-y-1' },
          title ? h2({ className: 'm-0 text-lg font-bold text-white' }, title) : '',
          description ? p({ className: 'm-0 text-sm text-slate-400' }, description) : ''
        ),
        button({
          type: 'button',
          className: 'rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-sm text-slate-200 transition hover:bg-slate-700',
          onclick: () => close(),
          'aria-label': 'Close modal',
        }, '✕')
      )
    : null;

  const content = div({ className: 'px-5 py-4' }, body);
  const modalFooter = footer ? div({ className: 'border-t border-slate-800 px-5 py-4' }, footer) : '';

  panel.append(header || '', content, modalFooter || '');
  root.append(panel);

  let isOpen = true;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (closeOnEscape && e.key === 'Escape' && isOpen) {
      close();
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (closeOnBackdropClick && e.target === root && isOpen) {
      close();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeyDown);
    root.addEventListener('click', handleBackdropClick);
    document.body.appendChild(root);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeyDown);
      root.removeEventListener('click', handleBackdropClick);
    }

    root.style.opacity = '0';
    root.style.transition = 'opacity 0.2s ease-out';
    setTimeout(() => {
      root.remove();
      onClose?.();
    }, 180);
  }

  return { root, close, isOpen: () => isOpen };
}

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
