import { div, h2, p, a } from '../components/ui/dom';

export function createNotFoundPage(): HTMLElement {
  return div({ className: 'fluent-notfound-card' },
    div({ className: 'fluent-notfound-mark' }, '404'),
    div({ className: 'fluent-notfound-copy' },
      h2({ className: 'fluent-notfound-title' }, 'This page wandered off'),
      p({ className: 'fluent-notfound-text' }, 'The workspace you were looking for isn’t available or may have moved to a new route.')
    ),
    a({ href: '/', className: 'fluent-back-link', 'data-link': '' }, 'Go back home')
  );
}