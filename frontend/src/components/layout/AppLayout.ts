import "../../../css/layout.css";
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
  themeSelect.className = 'header-theme-select';
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
    { className: 'header-meta' },
    span(
      { className: 'workspace-badge' },
      span({ className: 'workspace-dot' }),
      `Workspace • ${userName}`
    ),
    span(
      { className: 'active-status-badge' },
      span({ className: 'active-status-dot' }),
      'Active'
    ),
    div(
      { className: 'header-theme-select-wrap' },
      themeSelect
    ),
    button(
      {
        className: 'header-action-btn',
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
  const container = div({ className: 'app-shell' });
  const contentPane = div({ className: 'app-content-panel' });

  const brandRow = div(
    { className: 'brand-row' },
    div(
      { className: 'brand-block' },
      div({ className: 'brand-mark' }, 'P'),
      div(
        { className: 'brand-copy' },
        h1({}, 'PixelForge Studio'),
        p({}, 'Microsoft Fluent UI Creative Workspace')
      )
    ),
    createHeaderActions()
  );

  const navWrap = div({ className: 'nav-shell' });
  navWrap.appendChild(createNavElement());

  const headerEl = header(
    { className: 'app-header' },
    brandRow,
    navWrap
  );

  const pageHost = div({ className: 'page-content' });
  const mainEl = main({ className: 'app-main' }, pageHost);

  const footerEl = footer(
    { className: 'app-footer' },
    p({}, 'PixelForge © 2026 Microsoft Fluent Integration'),
    p({}, 'Unified Media Workspace & Pipeline')
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