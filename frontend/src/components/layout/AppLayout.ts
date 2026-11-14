import { div, header, main, footer, h1, p, span, button } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';
import { createNavElement } from './NavBar';

function createHeaderActions(): HTMLElement {
  const state = appStore.getState();
  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn ? (state.handle || 'Creator') : 'Guest';
  const themeOptions = ['dark', 'light', 'midnight', 'aurora', 'sunset', 'forest'] as const;
  const selectedTheme = themeOptions.includes(state.theme as (typeof themeOptions)[number])
    ? state.theme
    : state.editorTheme;

  const themeSelect = document.createElement('select');
  themeSelect.className = 'header-theme-select';
  themeSelect.setAttribute('aria-label', 'Theme');
  themeSelect.value = selectedTheme;
  themeSelect.onchange = (event) => {
    const value = (event.target as HTMLSelectElement).value as (typeof themeOptions)[number];
    authActions.setTheme(value);

    if (value === 'dark' || value === 'light') {
      authActions.setEditorTheme(state.editorTheme);
      return;
    }

    authActions.setEditorTheme(value);
  };

  themeOptions.forEach((theme) => {
    const option = document.createElement('option');
    option.value = theme;
    option.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
    themeSelect.appendChild(option);
  });

  return div({ className: 'header-meta flex w-full items-center justify-end gap-2 sm:w-auto' },
    span({
      className: 'header-user-label hidden sm:inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-md'
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
    div({ className: 'header-theme-select-wrap inline-flex items-center rounded-xl border border-slate-700/50 bg-slate-900/35 p-1' },
      themeSelect
    ),
    button({
      className: 'header-action-btn header-action-primary inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-150 active:scale-95 sm:w-auto',
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
  const container = div({ className: 'app-shell w-full min-h-screen font-sans' });

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
      'app-header sticky top-4 z-20 flex flex-col gap-2 rounded-[28px] border border-slate-700/70 backdrop-blur-2xl',
  },
    brandRow,
    navWrap
  );

  const pageHost = div({ className: 'page-content w-full min-h-[18rem]' });
  const mainEl = main({ className: 'app-main block' }, pageHost);

  const footerEl = footer({
    className:
      'app-footer mt-auto flex flex-col items-start justify-between gap-2 rounded-[24px] px-4 py-3 text-xs backdrop-blur-md sm:flex-row sm:items-center sm:gap-3 sm:px-6 sm:py-4',
  },
    p({ className: 'm-0 font-medium' }, 'PixelForge © 2026'),
    p({ className: 'm-0 opacity-80' }, 'Edit images, polish video, and process PDFs in one unified workspace')
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