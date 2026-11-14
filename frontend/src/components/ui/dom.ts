export type ChildInput =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | ChildInput[]
  | NodeList
  | HTMLCollection;

export type ElementChild = Node | string | number | boolean | null | undefined;
export type ElementAttributes = Record<string, any>;

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}

function flattenChildren(items: ChildInput, target: Array<Node | string | number> = []): Array<Node | string | number> {
  if (items == null || typeof items === 'boolean') {
    return target;
  }

  if (typeof items === 'string' || typeof items === 'number' || items instanceof Node) {
    target.push(items);
    return target;
  }

  if (Array.isArray(items) || items instanceof NodeList || items instanceof HTMLCollection) {
    const length = items.length;
    for (let index = 0; index < length; index += 1) {
      flattenChildren((items as ArrayLike<ChildInput>)[index], target);
    }
    return target;
  }

  target.push(items as never);
  return target;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes?: ElementAttributes | null,
  children?: ChildInput
): HTMLElementTagNameMap[K];
export function createElement<T extends HTMLElement = HTMLElement>(
  tagName: string,
  attributes?: ElementAttributes | null,
  children?: ChildInput
): T;
export function createElement(
  tagName: string,
  attributes: ElementAttributes | null | ChildInput = {},
  children: ChildInput = []
): HTMLElement {
  if (
    attributes !== null &&
    (typeof attributes === 'string' ||
      typeof attributes === 'number' ||
      attributes instanceof Node ||
      Array.isArray(attributes) ||
      attributes instanceof NodeList ||
      attributes instanceof HTMLCollection)
  ) {
    children = attributes as ChildInput;
    attributes = {};
  }

  const element = document.createElement(tagName);
  const safeAttributes = attributes ?? {};

  for (const [key, value] of Object.entries(safeAttributes)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }

    if (key === 'events' && typeof value === 'object') {
      const eventMap = value as Record<string, EventListenerOrEventListenerObject | undefined>;
      for (const [eventName, listener] of Object.entries(eventMap)) {
        if (listener) {
          element.addEventListener(eventName, listener);
        }
      }
      continue;
    }

    if ((key === 'style' || key === 'styles') && typeof value === 'object') {
      Object.assign(element.style, value as Record<string, string>);
      continue;
    }

    if (key === 'class' && typeof value === 'string') {
      element.className = value.trim();
      continue;
    }

    if (key === 'className') {
      element.className = String(value);
      continue;
    }

    if (key === 'dataset' && typeof value === 'object') {
      Object.assign(element.dataset, value as Record<string, string>);
      continue;
    }

    if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value as EventListener);
      continue;
    }

    if (key in element && key !== 'list' && key !== 'type' && key !== 'draggable') {
      (element as unknown as Record<string, unknown>)[key] = value;
      continue;
    }

    element.setAttribute(key, String(value));
  }

  for (const child of flattenChildren(children)) {
    if (child instanceof Node) {
      element.appendChild(child);
    } else if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    }
  }

  return element;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes?: ElementAttributes,
  ...children: (Node | string | number | boolean | null | undefined)[]
): HTMLElementTagNameMap[K] {
  return createElement(tagName, attributes, children) as HTMLElementTagNameMap[K];
}

export function svgElement(
  tagName: string,
  attributes?: ElementAttributes,
  ...children: (Node | string | number | boolean | null | undefined)[]
): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }

      if (key === 'className' || key === 'class') {
        element.setAttribute('class', String(value));
      } else if (key === 'events' && typeof value === 'object') {
        const eventMap = value as Record<string, EventListenerOrEventListenerObject | undefined>;
        for (const [eventName, listener] of Object.entries(eventMap)) {
          if (listener) {
            element.addEventListener(eventName, listener);
          }
        }
      } else if ((key === 'style' || key === 'styles') && typeof value === 'object') {
        Object.assign(element.style, value as Record<string, string>);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(element.dataset, value as Record<string, string>);
      } else if (key.startsWith('on') && typeof value === 'function') {
        const eventName = key.slice(2).toLowerCase();
        element.addEventListener(eventName, value as EventListener);
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children) {
    if (child == null || typeof child === 'boolean') {
      continue;
    }
    if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  }

  return element;
}

export const uiClasses = {
  card: 'rounded-[28px] border border-slate-800 bg-slate-950/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.40)] backdrop-blur-sm',
  panel: 'rounded-2xl border border-slate-800 bg-slate-900/70 p-4',
  primaryButton:
    'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(59,130,246,0.35)] transition hover:brightness-110',
  secondaryButton:
    'inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800',
  linkButton:
    'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110',
  textMuted: 'text-sm leading-6 text-slate-400',
};

export function createButton(
  variant: 'primary' | 'secondary' = 'primary',
  attributes?: ElementAttributes,
  ...children: ElementChild[]
): HTMLButtonElement {
  const variantClass = variant === 'primary' ? uiClasses.primaryButton : uiClasses.secondaryButton;
  return button({ ...attributes, className: cn(variantClass, attributes?.className) }, ...children);
}

export function createPageHeader(title: string, description?: string, className = 'max-w-5xl'): HTMLElement {
  const root = div({ className: cn(uiClasses.card, className) });
  root.append(h1({ className: 'm-0 text-3xl font-black tracking-tight text-white sm:text-4xl' }, title));

  if (description) {
    root.append(p({ className: 'mt-3 text-sm leading-6 text-slate-400' }, description));
  }

  return root;
}

export function createErrorCard(title = 'Error', message = 'Failed to load page component.'): HTMLElement {
  return div({ className: 'card mx-auto max-w-xl text-center' },
    h2({ className: 'text-xl font-semibold text-white' }, title),
    p({ className: 'mt-3 text-sm text-slate-400' }, message)
  );
}

// Convenient shorthand wrappers for common tags
export const div = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('div', attrs, ...children);
export const article = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('article', attrs, ...children);
export const section = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('section', attrs, ...children);
export const header = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('header', attrs, ...children);
export const main = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('main', attrs, ...children);
export const footer = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('footer', attrs, ...children);
export const button = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('button', attrs, ...children);
export const input = (attrs?: ElementAttributes) => el('input', attrs);
export const p = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('p', attrs, ...children);
export const h1 = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('h1', attrs, ...children);
export const h2 = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('h2', attrs, ...children);
export const form = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('form', attrs, ...children);
export const label = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('label', attrs, ...children);
export const span = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('span', attrs, ...children);
export const nav = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('nav', attrs, ...children);
export const a = (attrs?: ElementAttributes, ...children: ElementChild[]) => el('a', attrs, ...children);
export const img = (attrs?: ElementAttributes) => el('img', attrs);
export const video = (attrs?: ElementAttributes) => el('video', attrs);
export const canvas = (attrs?: ElementAttributes) => el('canvas', attrs);
export const svg = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('svg', attrs, ...children);
export const path = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('path', attrs, ...children);