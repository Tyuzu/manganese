import "../../../css/header.css";
import { button, div, h1, header, p, span } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';
import { APP_THEMES, EDITOR_THEMES, type AppTheme, type EditorThemeName } from '../../config/config';
import { createNavElement } from './NavBar';

export function createHeaderActions(): HTMLElement {
  const state = appStore.getState();
  const isLoggedIn = Boolean(state.token);
  const userName = isLoggedIn ? state.handle || 'Creator' : 'Guest';

  // Determine current active theme, defaulting safely
  const selectedTheme: string = state.theme || state.editorTheme || 'dark';

  const themeSelect = document.createElement('select');
  themeSelect.className = 'header-theme-select';
  themeSelect.setAttribute('aria-label', 'Theme Selector');
  themeSelect.value = selectedTheme;

  themeSelect.onchange = (event) => {
    const value = (event.target as HTMLSelectElement).value;

    if ((APP_THEMES as readonly string[]).includes(value)) {
      authActions.setTheme(value as AppTheme);
    }
    if ((EDITOR_THEMES as readonly string[]).includes(value as EditorThemeName)) {
      authActions.setEditorTheme(value as EditorThemeName);
    }
  };

  // Populate App Themes options (or combine with Editor themes if needed)
  APP_THEMES.forEach((theme) => {
    const option = document.createElement('option');
    option.value = theme;
    option.textContent = theme
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    themeSelect.appendChild(option);
  });

  // Ensure select value matches option list if state was an editor theme
  if (themeSelect.querySelector(`option[value="${selectedTheme}"]`)) {
    themeSelect.value = selectedTheme;
  }

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