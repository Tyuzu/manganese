import { div, header, main, footer, h1, p, span, button } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';
import { createNavElement } from './NavBar';

const THEME_OPTIONS = ['dark', 'light', 'midnight', 'aurora', 'sunset', 'forest'] as const;
type ThemeOption = (typeof THEME_OPTIONS)[number];

function createHeaderActions(): HTMLElement {
  const state = appStore.getState();
  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn ? state.handle || 'Creator' : 'Guest';
  
  const selectedTheme: ThemeOption = THEME_OPTIONS.includes(state.theme as ThemeOption)
    ? (state.theme as ThemeOption)
    : (state.editorTheme as ThemeOption) || 'dark';

  const themeSelect = document.createElement('select');
  themeSelect.className = 'header-theme-select bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500';
  themeSelect.setAttribute('aria-label', 'Theme Selector');
  themeSelect.value = selectedTheme;
  
  themeSelect.onchange = (event) => {
    const value = (event.target as HTMLSelectElement).value as ThemeOption;
    authActions.setTheme(value);

    if (value === 'dark' || value === 'light') {
      authActions.setEditorTheme(state.editorTheme);
      return;
    }

    authActions.setEditorTheme(value);
  };

  THEME_OPTIONS.forEach((theme) => {
    const option = document.createElement('option');
    option.value = theme;
    option.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
    themeSelect.appendChild(option);
  });

  return div(
    { className: 'header-meta flex w-full items-center justify-end gap-3 sm:w-auto' },
    span(
      {
        className: 'hidden sm:inline-flex items-center gap-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300',
      },
      span({ className: 'h-2 w-2 rounded-full bg-sky-500' }),
      `Workspace • ${userName}`
    ),
    span(
      {
        className: 'hidden items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400 xl:inline-flex',
      },
      span({ className: 'h-2 w-2 rounded-full bg-emerald-400 animate-pulse' }),
      'Active'
    ),
    div(
      { className: 'header-theme-select-wrap inline-flex items-center' },
      themeSelect
    ),
    button(
      {
        className: 'header-action-btn inline-flex items-center justify-center rounded bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-sky-500 active:scale-95',
        onClick: () => {
          if (isLoggedIn) {
            authActions.logout();
            router.navigate('/login');
            return;
          }

          authActions.guest();
          router.navigate('/');
        },
      },
      isLoggedIn ? 'Logout' : 'Guest Mode'
    )
  );
}

export function renderLayout(): HTMLElement {
  const container = div({ className: 'app-shell w-full min-h-screen bg-slate-950 text-slate-100 font-sans' });
  const contentPane = div({ className: 'app-content-panel flex min-w-0 w-full flex-col gap-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8' });

  const brandRow = div(
    { className: 'brand-row flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between' },
    div(
      { className: 'brand-block flex items-center gap-3.5' },
      div(
        {
          className: 'brand-mark flex h-10 w-10 items-center justify-center rounded bg-sky-600 text-base font-bold text-white shadow-sm',
        },
        'P'
      ),
      div(
        { className: 'brand-copy flex flex-col' },
        h1({ className: 'm-0 text-lg font-semibold tracking-tight text-white sm:text-xl' }, 'PixelForge Studio'),
        p({ className: 'm-0 text-xs text-slate-400' }, 'Microsoft Fluent UI Creative Workspace')
      )
    ),
    createHeaderActions()
  );

  const navWrap = div({ className: 'nav-shell w-full border-t border-slate-800 pt-3' });
  navWrap.appendChild(createNavElement());

  const headerEl = header(
    {
      className: 'app-header sticky top-4 z-20 flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/90 p-4 shadow-lg backdrop-blur-md',
    },
    brandRow,
    navWrap
  );

  const pageHost = div({ className: 'page-content w-full min-h-[20rem]' });
  const mainEl = main({ className: 'app-main block' }, pageHost);

  const footerEl = footer(
    {
      className: 'app-footer mt-auto flex flex-col items-start justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-6 py-4 text-xs text-slate-400 sm:flex-row sm:items-center',
    },
    p({ className: 'm-0 font-medium' }, 'PixelForge © 2026 Microsoft Fluent Integration'),
    p({ className: 'm-0' }, 'Unified Media Workspace & Pipeline')
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