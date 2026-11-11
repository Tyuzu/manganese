import { div, h2, p, a } from '../components/ui/dom';

export function createUnauthorizedPage(): HTMLElement {
  return div({ className: 'card' },
    h2({}, 'Access Denied (403)'),
    p({}, 'Your account role does not have permission to access this page.'),
    a({ href: '/', 'data-link': '' }, 'Return Home')
  );
}