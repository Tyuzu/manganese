import { div, header, main, footer, h1, p } from '../ui/dom';
import { appStore } from '../../appState';
import { createNavElement } from './NavBar';

export function renderLayout(): HTMLElement {
  const container = div({ className: 'app-shell flex flex-col gap-5' });

  const headerEl = header({
    className:
      'app-header sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-700/50 bg-slate-950/90 px-5 py-4 text-white shadow-[0_18px_38px_rgba(15,23,42,0.25)] backdrop-blur-lg',
  },
    div({ className: 'brand-block flex items-center gap-3' },
      div({ className: 'brand-mark grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-lg font-black shadow-inner shadow-white/20' }, 'P'),
      div({ className: 'brand-copy flex flex-col' },
        h1({ className: 'm-0 text-xl font-black tracking-tight text-white sm:text-2xl' }, 'PixelForge'),
        p({ className: 'm-0 text-xs text-slate-300' }, 'Creative media workspace')
      )
    )
  );

  const navWrap = div({ className: 'nav-shell w-full' });
  navWrap.appendChild(createNavElement());

  const pageHost = div({ className: 'page-content min-h-[18rem]' });
  const mainEl = main({ className: 'app-main block' }, pageHost);

  const footerEl = footer({
    className:
      'app-footer mt-2 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-slate-200 bg-white/80 px-5 py-4 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-sm',
  },
    p({ className: 'm-0 font-semibold text-slate-700' }, 'PixelForge © 2026'),
    p({ className: 'm-0 text-slate-500' }, 'Edit images, polish video, and process PDFs in one studio')
  );

  container.append(headerEl, navWrap, mainEl, footerEl);

  const unsubscribe = appStore.subscribe(() => {
    const newNav = createNavElement();
    navWrap.replaceChildren(newNav);
  });

  (container as any).__unsubscribe = unsubscribe;
  (container as any).__pageHost = pageHost;
  return container;
}

export function renderPageIntoLayout(container: HTMLElement, contentElement: HTMLElement): void {
  const pageHost = (container as any).__pageHost as HTMLElement | undefined;

  if (!pageHost) {
    container.replaceChildren(contentElement);
    return;
  }

  pageHost.replaceChildren(contentElement);
}