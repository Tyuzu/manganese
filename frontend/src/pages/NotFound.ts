import { div, h2, a } from '../components/ui/dom';

export function createNotFoundPage(): HTMLElement {
  return div({ className: 'card' },
    h2({}, '404 - Page Not Found'),
    a({ href: '/', 'data-link': '' }, 'Go Home')
  );
}