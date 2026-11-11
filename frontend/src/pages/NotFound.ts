import { div, h2, a } from '../components/ui/dom';

export function createNotFoundPage(): HTMLElement {
  return div({ className: 'card mx-auto max-w-xl text-center' },
    h2({ className: 'text-2xl font-bold tracking-tight text-slate-900' }, '404 - Page Not Found'),
    a({ href: '/', className: 'mt-4 inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500', 'data-link': '' }, 'Go Home')
  );
}