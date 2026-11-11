export type ElementAttributes = Record<string, any>;

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}

export const uiClasses = {
  card: 'rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_18px_38px_rgba(15,23,42,0.08)] backdrop-blur-sm',
  panel: 'rounded-2xl border border-slate-200 bg-slate-50 p-4',
  primaryButton:
    'inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500',
  secondaryButton:
    'inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50',
  linkButton:
    'inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500',
  textMuted: 'text-sm leading-6 text-slate-600',
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes?: ElementAttributes,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'className') {
        element.className = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        const eventName = key.slice(2).toLowerCase();
        element.addEventListener(eventName, value as EventListener);
      } else if (value !== false && value != null) {
        element.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children) {
    if (child != null) {
      element.append(child);
    }
  }

  return element;
}

export function createButton(
  variant: 'primary' | 'secondary' = 'primary',
  attributes?: ElementAttributes,
  ...children: (Node | string)[]
): HTMLButtonElement {
  const variantClass = variant === 'primary' ? uiClasses.primaryButton : uiClasses.secondaryButton;
  return button({ ...attributes, className: cn(variantClass, attributes?.className) }, ...children);
}

export function createPageHeader(title: string, description?: string, className = 'max-w-5xl'): HTMLElement {
  const root = div({ className: cn(uiClasses.card, className) });
  root.append(h1({ className: 'm-0 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl' }, title));

  if (description) {
    root.append(p({ className: 'mt-3 text-sm leading-6 text-slate-600' }, description));
  }

  return root;
}

export function createErrorCard(title = 'Error', message = 'Failed to load page component.'): HTMLElement {
  return div({ className: 'card mx-auto max-w-xl text-center' },
    h2({ className: 'text-xl font-semibold text-slate-900' }, title),
    p({ className: 'mt-3 text-sm text-slate-600' }, message)
  );
}

// Convenient shorthand wrappers for common tags
export const div = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('div', attrs, ...children);
export const article = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('article', attrs, ...children);
export const section = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('section', attrs, ...children);
export const header = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('header', attrs, ...children);
export const main = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('main', attrs, ...children);
export const footer = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('footer', attrs, ...children);
export const button = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('button', attrs, ...children);
export const input = (attrs?: ElementAttributes) => el('input', attrs);
export const p = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('p', attrs, ...children);
export const h1 = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('h1', attrs, ...children);
export const h2 = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('h2', attrs, ...children);
export const form = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('form', attrs, ...children);
export const label = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('label', attrs, ...children);
export const span = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('span', attrs, ...children);
export const nav = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('nav', attrs, ...children);
export const a = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('a', attrs, ...children);
export const img = (attrs?: ElementAttributes) => el('img', attrs);
export const video = (attrs?: ElementAttributes) => el('video', attrs);
export const canvas = (attrs?: ElementAttributes) => el('canvas', attrs);