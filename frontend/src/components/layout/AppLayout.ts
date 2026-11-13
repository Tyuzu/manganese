import { div, header, main, footer, h1, p, span, button } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';
import { createNavElement } from './NavBar';

function createHeaderActions(): HTMLElement {
  const state = appStore.getState();
  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn ? (state.handle || 'Creator') : 'Guest';

  return div({ className: 'header-meta flex w-full items-center justify-end gap-3 sm:w-auto' },
    span({
      className: 'header-user-label hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/50 px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md'
    },
      span({ className: 'h-1.5 w-1.5 rounded-full bg-blue-400' }),
      `Guest Creator • ${userName}`
    ),
    span({
      className: 'hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 xl:inline-flex'
    },
      span({ className: 'h-2 w-2 rounded-full bg-emerald-400 animate-pulse' }),
      'Active'
    ),
    button({
      className: 'header-action-btn inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition-all duration-150 hover:bg-blue-500 hover:shadow-md hover:shadow-blue-500/30 active:scale-95 sm:w-auto',
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
  const container = div({ className: 'app-shell w-full min-h-screen text-slate-100 font-sans' });

  const contentPane = div({ className: 'app-content-panel flex min-w-0 w-full flex-col gap-5' });

  const brandRow = div({ className: 'brand-row flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between' },
    div({ className: 'brand-block flex items-center gap-3.5 sm:justify-start' },
      div({
        className: 'brand-mark grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 text-lg font-black text-white shadow-lg shadow-blue-600/25 ring-1 ring-white/20'
      }, 'P'),
      div({ className: 'brand-copy flex flex-col' },
        h1({ className: 'm-0 text-xl font-bold tracking-tight text-white sm:text-2xl' }, 'PixelForge'),
        p({ className: 'm-0 text-[11px] font-medium uppercase tracking-widest text-slate-400' }, 'Creative media workspace')
      )
    ),
    createHeaderActions()
  );

  const navWrap = div({ className: 'nav-shell w-full pt-1' });
  navWrap.appendChild(createNavElement());

  const headerEl = header({
    className:
      'app-header sticky top-4 z-20 flex flex-col gap-2 rounded-[28px] border border-slate-700/70 bg-[#536d7b] shadow-[0_25px_60px_rgba(15,23,42,0.2)] backdrop-blur-2xl',
  },
    brandRow,
    navWrap
  );

  const pageHost = div({ className: 'page-content w-full min-h-[18rem]' });
  const mainEl = main({ className: 'app-main block' }, pageHost);

  const footerEl = footer({
    className:
      'app-footer mt-auto flex flex-col items-start justify-between gap-2 rounded-[24px] border border-slate-700/60 bg-[#536d7b]/80 px-4 py-3 text-xs text-slate-300 backdrop-blur-md sm:flex-row sm:items-center sm:gap-3 sm:px-6 sm:py-4',
  },
    p({ className: 'm-0 font-medium text-slate-200' }, 'PixelForge © 2026'),
    p({ className: 'm-0 text-slate-300/80' }, 'Edit images, polish video, and process PDFs in one unified workspace')
  );

  contentPane.append(headerEl, mainEl, footerEl);
  container.append(contentPane);

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