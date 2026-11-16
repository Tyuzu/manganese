import { button, cn, div, h2, p, span } from './dom';

export interface ToastOptions {
  message: string;
  variant?: 'info' | 'success' | 'error' | 'warning';
  durationMs?: number;
  onDismiss?: () => void;
}

export function createToast(options: ToastOptions): HTMLElement {
  const { message, variant = 'info', durationMs = 3000, onDismiss } = options;

  const variantClass = {
    info: 'is-info',
    success: 'is-success',
    error: 'is-error',
    warning: 'is-warning',
  }[variant];

  const toast = div(
    {
      className: cn('fluent-toast', variantClass),
    },
    span({ className: 'fluent-toast-message' }, message)
  );

  const dismiss = () => {
    toast.classList.add('is-dismissing');
    setTimeout(() => toast.remove(), 300);
    onDismiss?.();
  };

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  const timer = setTimeout(dismiss, durationMs);
  toast.onclick = () => {
    clearTimeout(timer);
    dismiss();
  };

  return toast;
}

export function createToastStack(options?: { position?: 'top-right' | 'top-left' | 'bottom-right'; className?: string }) {
  const positionClass = {
    'top-left': 'is-top-left',
    'bottom-right': 'is-bottom-right',
    'top-right': 'is-top-right',
  }[options?.position || 'top-right'];

  const container = div({
    className: cn('fluent-toast-container', positionClass, options?.className),
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
    className: 'fluent-modal-overlay',
  });

  const sizeClass = {
    sm: 'is-size-sm',
    md: 'is-size-md',
    lg: 'is-size-lg',
    xl: 'is-size-xl',
  }[size];

  const panel = div({
    className: cn('fluent-modal-panel', sizeClass, className),
  });

  const header = title || description
    ? div({ className: 'fluent-modal-header' },
        div({ className: 'fluent-modal-title-wrap' },
          title ? h2({ className: 'fluent-modal-title' }, title) : '',
          description ? p({ className: 'fluent-modal-description' }, description) : ''
        ),
        button({
          type: 'button',
          className: 'fluent-modal-close-btn',
          onclick: () => close(),
          'aria-label': 'Close modal',
        }, '✕')
      )
    : null;

  const content = div({ className: 'fluent-modal-body' }, body);
  const modalFooter = footer ? div({ className: 'fluent-modal-footer' }, footer) : '';

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

    root.classList.add('is-closing');
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

    rootElement.classList.add('is-closing');
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