import { button, div, h1, header, p, span } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';
import { APP_THEMES, AppTheme } from '../../theme';
import { createNavElement } from './NavBar';

export function createHeaderActions(): HTMLElement {
  const state = appStore.getState();
  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn ? state.handle || 'Creator' : 'Guest';

  const selectedTheme: AppTheme = (APP_THEMES as readonly string[]).includes(state.theme)
    ? (state.theme as AppTheme)
    : (state.editorTheme as AppTheme) || 'dark';

  const themeSelect = document.createElement('select');
  themeSelect.className = 'header-theme-select';
  themeSelect.setAttribute('aria-label', 'Theme Selector');
  themeSelect.value = selectedTheme;

  themeSelect.onchange = (event) => {
    const value = (event.target as HTMLSelectElement).value;
    const appTheme = APP_THEMES.includes(value as AppTheme) ? (value as AppTheme) : 'dark';
    authActions.setTheme(appTheme);

    const editorThemes = [
      'aurora',
      'catppuccin',
      'cyberpunk',
      'dark',
      'dimmed',
      'dracula',
      'forest',
      'light',
      'midnight',
      'nord',
      'sunset',
      'tokyo-night'
    ] as const;

    if (editorThemes.includes(value as (typeof editorThemes)[number])) {
      authActions.setEditorTheme(value as (typeof editorThemes)[number]);
      return;
    }

    authActions.setEditorTheme('dark');
  };

  APP_THEMES.forEach((theme) => {
    const option = document.createElement('option');
    option.value = theme;
    option.textContent = theme
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

export function createAppHeader(): HTMLElement {
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

  return header(
    { className: 'app-header' },
    brandRow,
    navWrap
  );
}
