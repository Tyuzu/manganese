export const APP_THEMES = ['dark', 'light', 'midnight', 'aurora', 'sunset', 'forest'] as const;
export type AppTheme = typeof APP_THEMES[number];

export const EDITOR_THEMES = ['midnight', 'aurora', 'sunset', 'forest'] as const;
export type EditorThemeName = typeof EDITOR_THEMES[number];

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