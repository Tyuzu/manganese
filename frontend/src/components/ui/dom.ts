export type ChildInput =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | ChildInput[]
  | NodeList
  | HTMLCollection
  | Iterable<ChildInput>;

export type ElementChild = ChildInput;
export type ElementAttributes = Record<string, any>;
export type ClassValue = string | number | boolean | undefined | null | { [key: string]: any } | ClassValue[];

/**
 * Robust class names utility supporting strings, arrays, and conditional objects (clsx-style).
 */
export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input));
    } else if (Array.isArray(input)) {
      const cls = cn(...input);
      if (cls) classes.push(cls);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }
  return classes.join(' ');
}

export function flattenChildren(
  items: ChildInput,
  target: Array<Node | string | number> = []
): Array<Node | string | number> {
  if (items == null || typeof items === 'boolean') {
    return target;
  }

  if (typeof items === 'string' || typeof items === 'number' || items instanceof Node) {
    target.push(items);
    return target;
  }

  if (
    Array.isArray(items) ||
    items instanceof NodeList ||
    items instanceof HTMLCollection ||
    (typeof items === 'object' && Symbol.iterator in items)
  ) {
    for (const item of items as Iterable<ChildInput>) {
      flattenChildren(item, target);
    }
    return target;
  }

  target.push(String(items));
  return target;
}

function isElementAttributes(value: unknown): value is ElementAttributes {
  return (
    !!value &&
    typeof value === 'object' &&
    !(
      value instanceof Node ||
      value instanceof NodeList ||
      value instanceof HTMLCollection ||
      Array.isArray(value) ||
      Symbol.iterator in value
    )
  );
}

const eventNameMap: Record<string, string> = {
  doubleclick: 'dblclick',
  dblclick: 'dblclick',
};

function setAttributes(element: Element, attributes: ElementAttributes): void {
  const isSvg = element instanceof SVGElement;

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }

    // Ref callback: { ref: (el) => { ... } }
    if (key === 'ref' && typeof value === 'function') {
      value(element);
      continue;
    }

    // Event map object: { events: { click: (e) => {} } }
    if (key === 'events' && typeof value === 'object') {
      const eventMap = value as Record<string, EventListenerOrEventListenerObject | undefined>;
      for (const [eventName, listener] of Object.entries(eventMap)) {
        if (listener) {
          const normalizedEvent = eventNameMap[eventName.toLowerCase()] || eventName.toLowerCase();
          element.addEventListener(normalizedEvent, listener);
        }
      }
      continue;
    }

    // Inline styles object: { style: { color: 'red' } }
    if ((key === 'style' || key === 'styles') && typeof value === 'object') {
      if (isSvg) {
        for (const [styleKey, styleVal] of Object.entries(value)) {
          (element as SVGElement).style.setProperty(styleKey, String(styleVal));
        }
      } else {
        Object.assign((element as HTMLElement).style, value);
      }
      continue;
    }

    // Data attributes object: { dataset: { id: '123' } }
    if (key === 'dataset' && typeof value === 'object' && element instanceof HTMLElement) {
      Object.assign(element.dataset, value as Record<string, string>);
      continue;
    }

    // Inline event handlers: { onClick: (e) => {} }
    if (key.startsWith('on') && typeof value === 'function') {
      const rawEvent = key.slice(2).toLowerCase();
      const eventName = eventNameMap[rawEvent] || rawEvent;
      element.addEventListener(eventName, value as EventListener);
      continue;
    }

    // Class name handling
    if (key === 'class' || key === 'className') {
      const className = typeof value === 'string' ? value.trim() : String(value);
      if (isSvg) {
        element.setAttribute('class', className);
      } else {
        (element as HTMLElement).className = className;
      }
      continue;
    }

    // Direct property assignment for HTML elements (skip special attributes)
    if (
      !isSvg &&
      key in element &&
      key !== 'list' &&
      key !== 'type' &&
      key !== 'draggable' &&
      key !== 'value' &&
      key !== 'checked'
    ) {
      (element as unknown as Record<string, unknown>)[key] = value;
      continue;
    }

    // Handle special input value/checked properties correctly
    if (!isSvg && (key === 'value' || key === 'checked')) {
      (element as unknown as Record<string, unknown>)[key] = value;
    }

    // Fallback to standard setAttribute
    element.setAttribute(key, String(value));
  }
}

function appendChildren(element: Element | DocumentFragment, children: ChildInput): void {
  for (const child of flattenChildren(children)) {
    if (child instanceof Node) {
      element.appendChild(child);
    } else if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function fragment(...children: ChildInput[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  appendChildren(frag, children);
  return frag;
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
  if (attributes !== null && !isElementAttributes(attributes)) {
    children = attributes as ChildInput;
    attributes = {};
  }

  const element = document.createElement(tagName);
  if (attributes && isElementAttributes(attributes)) {
    setAttributes(element, attributes);
  }
  appendChildren(element, children);

  return element;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes?: ElementAttributes,
  ...children: ChildInput[]
): HTMLElementTagNameMap[K] {
  return createElement(tagName, attributes, children) as HTMLElementTagNameMap[K];
}

export function svgElement(
  tagName: string,
  attributes?: ElementAttributes,
  ...children: ChildInput[]
): SVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);

  if (attributes) {
    setAttributes(element, attributes);
  }
  appendChildren(element, children);

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
  return div(
    { className: 'card mx-auto max-w-xl text-center' },
    h2({ className: 'text-xl font-semibold text-white' }, title),
    p({ className: 'mt-3 text-sm text-slate-400' }, message)
  );
}

// HTML Tag Shorthands
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

// SVG Tag Shorthands
export const svg = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('svg', attrs, ...children);
export const path = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('path', attrs, ...children);
export const circle = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('circle', attrs, ...children);
export const rect = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('rect', attrs, ...children);
export const g = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('g', attrs, ...children);
export const line = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('line', attrs, ...children);
export const polyline = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('polyline', attrs, ...children);
export const polygon = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('polygon', attrs, ...children);
export const ellipse = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('ellipse', attrs, ...children);
export const text = (attrs?: ElementAttributes, ...children: ElementChild[]) => svgElement('text', attrs, ...children);