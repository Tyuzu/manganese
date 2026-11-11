type ElementAttributes = Record<string, any>;

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

// Convenient shorthand wrappers for common tags
export const div = (attrs?: ElementAttributes, ...children: (Node | string)[]) => el('div', attrs, ...children);
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