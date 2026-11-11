import { div, header, main, footer, h1, p, span, button } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';
import { createNavElement } from './NavBar';

function createHeaderActions(): HTMLElement {
  const state = appStore.getState();
  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn ? (state.handle || 'Creator') : 'Guest';

  return div({ className: 'header-meta flex items-center gap-3' },
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
      className: 'header-action-btn inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 transition-all duration-150 hover:bg-blue-500 hover:shadow-md hover:shadow-blue-500/30 active:scale-95',
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
  const container = div({ className: 'app-shell flex items-start gap-5 p-4 md:p-6 bg-slate-950 min-h-screen text-slate-100 font-sans' });

  const sidebar = div({ 
    className: 'app-sidebar hidden w-[260px] shrink-0 flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-900/40 p-4 shadow-xl backdrop-blur-2xl lg:flex sticky top-6' 
  },
    div({ className: 'sidebar-title px-3 pt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400' }, 'Studio Modules'),
    div({ className: 'sidebar-stack flex flex-col gap-1.5' },
      div({ 
        className: 'sidebar-item flex items-center justify-between rounded-2xl border border-blue-500/20 bg-blue-500/10 px-3.5 py-2.5 text-sm font-medium text-blue-200 transition-colors' 
      },
        div({ className: 'flex items-center gap-2.5' },
          span({ className: 'h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]' }),
          'Studio'
        ),
        span({ className: 'text-[10px] uppercase font-semibold tracking-wider text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-md' }, 'Active')
      ),
      div({ 
        className: 'sidebar-item flex items-center justify-between rounded-2xl border border-transparent hover:border-slate-800 hover:bg-slate-900/60 px-3.5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 transition-all' 
      },
        div({ className: 'flex items-center gap-2.5' },
          span({ className: 'h-2 w-2 rounded-full bg-emerald-500' }),
          'Live'
        ),
        span({ className: 'text-[10px] uppercase tracking-wider text-slate-500' }, 'Ready')
      )
    )
  );

  const contentPane = div({ className: 'app-content-panel flex-1 min-w-0 flex flex-col gap-5' });

  const brandRow = div({ className: 'flex w-full items-center justify-between gap-4' },
    div({ className: 'brand-block flex items-center gap-3.5' },
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
      'app-header sticky top-4 z-20 flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-slate-900/75 px-5 py-4 shadow-2xl shadow-slate-950/50 backdrop-blur-2xl',
  },
    brandRow,
    navWrap
  );

  const pageHost = div({ className: 'page-content min-h-[18rem]' });
  const mainEl = main({ className: 'app-main block' }, pageHost);

  const footerEl = footer({
    className:
      'app-footer mt-auto flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-800/60 bg-slate-900/40 px-6 py-4 text-xs text-slate-400 backdrop-blur-md',
  },
    p({ className: 'm-0 font-medium text-slate-300' }, 'PixelForge © 2026'),
    p({ className: 'm-0 text-slate-500' }, 'Edit images, polish video, and process PDFs in one unified workspace')
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