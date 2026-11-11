import { div, header, main, footer, h1, p, span, button } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';
import { createNavElement } from './NavBar';

function createHeaderActions(): HTMLElement {
  const state = appStore.getState();
  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn ? (state.handle || 'Creator') : 'Guest';

  return div({ className: 'header-meta flex items-center gap-2.5' },
    span({ className: 'header-user-label inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold text-slate-200' }, `Guest Creator • ${userName}`),
    span({ className: 'hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300 sm:inline-flex' },
      span({ className: 'h-2 w-2 rounded-full bg-emerald-400 animate-pulse' }),
      'Active'
    ),
    button({
      className: 'header-action-btn inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800',
      onClick: () => {
        if (isLoggedIn) {
          authActions.logout();
          router.navigate('/login');
          return;
        }

        authActions.guest();
        router.navigate('/');
      }
    }, isLoggedIn ? 'Logout' : 'Guest Mode')
  );
}

export function renderLayout(): HTMLElement {
  const container = div({ className: 'app-shell flex items-start gap-4' });

  const sidebar = div({ className: 'app-sidebar hidden w-[240px] shrink-0 flex-col gap-3 rounded-[28px] border border-slate-800/80 bg-slate-950/75 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.38)] backdrop-blur-xl lg:flex' },
    div({ className: 'sidebar-title px-2 pt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400' }, 'Studio Modules'),
    div({ className: 'sidebar-stack flex flex-col gap-2' },
      div({ className: 'sidebar-item flex items-center justify-between rounded-2xl border border-sky-500/20 bg-sky-500/10 px-3 py-2.5 text-sm font-semibold text-sky-200' },
        div({ className: 'flex items-center gap-2' },
          span({ className: 'h-2.5 w-2.5 rounded-full bg-sky-400' }),
          'Studio'
        ),
        span({ className: 'text-[10px] uppercase tracking-[0.14em] text-sky-300' }, 'Active')
      ),
      div({ className: 'sidebar-item flex items-center justify-between rounded-2xl border border-slate-700/70 bg-slate-900/60 px-3 py-2.5 text-sm font-semibold text-slate-300' },
        div({ className: 'flex items-center gap-2' },
          span({ className: 'h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' }),
          'Live'
        ),
        span({ className: 'text-[10px] uppercase tracking-[0.14em] text-slate-400' }, 'On')
      )
    )
  );

  const contentPane = div({ className: 'app-content-panel flex-1 min-w-0' });

  const brandRow = div({ className: 'flex w-full items-center justify-between gap-4' },
    div({ className: 'brand-block flex items-center gap-3' },
      div({ className: 'brand-mark grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-600 text-lg font-black text-white shadow-[0_12px_24px_rgba(59,130,246,0.35)]' }, 'P'),
      div({ className: 'brand-copy flex flex-col' },
        h1({ className: 'm-0 text-lg font-black tracking-[-0.04em] text-white sm:text-2xl' }, 'PixelForge'),
        p({ className: 'm-0 text-[11px] uppercase tracking-[0.2em] text-slate-400' }, 'Creative media workspace')
      )
    ),
    createHeaderActions()
  );

  const navWrap = div({ className: 'nav-shell w-full' });
  navWrap.appendChild(createNavElement());

  const headerEl = header({
    className:
      'app-header sticky top-3 z-20 flex flex-col gap-4 rounded-[30px] border border-slate-700/80 bg-slate-950/70 px-4 py-3 shadow-[0_18px_38px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:px-5',
  },
    brandRow,
    navWrap
  );

  const pageHost = div({ className: 'page-content min-h-[18rem]' });
  const mainEl = main({ className: 'app-main block' }, pageHost);

  const footerEl = footer({
    className:
      'app-footer mt-1 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-slate-800 bg-slate-950/80 px-5 py-4 text-sm text-slate-400 shadow-[0_10px_30px_rgba(15,23,42,0.24)] backdrop-blur-sm',
  },
    p({ className: 'm-0 font-semibold text-slate-200' }, 'PixelForge © 2026'),
    p({ className: 'm-0 text-slate-500' }, 'Edit images, polish video, and process PDFs in one studio')
  );

  contentPane.append(headerEl, mainEl, footerEl);
  container.append(sidebar, contentPane);

  const unsubscribe = appStore.subscribe(() => {
    const nextHeaderActions = createHeaderActions();
    const currentHeader = headerEl.querySelector('.header-meta');
    if (currentHeader) {
      currentHeader.replaceWith(nextHeaderActions);
    }

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