import { div, h2, p, a } from '../components/ui/dom';

export function createNotFoundPage(): HTMLElement {
  return div({ className: 'card mx-auto flex max-w-2xl flex-col items-center gap-5 px-8 py-10 text-center' },
    div({ className: 'grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-2xl font-black text-white shadow-[0_18px_35px_rgba(59,130,246,0.35)]' }, '404'),
    div({ className: 'space-y-3' },
      h2({ className: 'm-0 text-3xl font-black tracking-[-0.05em] text-slate-900 sm:text-4xl' }, 'This page wandered off'),
      p({ className: 'm-0 text-base text-slate-600' }, 'The workspace you were looking for isn’t available or may have moved to a new route.')
    ),
    a({ href: '/', className: 'inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800', 'data-link': '' }, 'Go back home')
  );
}