export { APP_THEMES, EDITOR_THEMES } from './config/config';
export type { AppTheme, EditorThemeName } from './config/config';

import { APP_THEMES, EDITOR_THEMES, type AppTheme, type EditorThemeName } from './config/config';

export function getPreferredTheme(): AppTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function normalizeTheme(theme: unknown): AppTheme {
  if (typeof theme === 'string' && (APP_THEMES as readonly string[]).includes(theme)) {
    return theme as AppTheme;
  }

  return getPreferredTheme();
}

export function normalizeEditorTheme(theme: unknown): EditorThemeName {
  if (typeof theme === 'string' && (EDITOR_THEMES as readonly string[]).includes(theme)) {
    return theme as EditorThemeName;
  }

  return 'midnight';
}

export function applyTheme(theme: unknown): AppTheme {
  const normalizedTheme = normalizeTheme(theme);

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = normalizedTheme;
    document.documentElement.style.colorScheme = normalizedTheme;
  }

  return normalizedTheme;
}

export function applyEditorTheme(theme: unknown): EditorThemeName {
  const normalizedTheme = normalizeEditorTheme(theme);

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.editorTheme = normalizedTheme;
  }

  return normalizedTheme;
}