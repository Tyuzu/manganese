export type AppTheme = 'dark' | 'light' | 'midnight' | 'aurora' | 'sunset' | 'forest';
export type EditorThemeName = 'midnight' | 'aurora' | 'sunset' | 'forest';

export function getPreferredTheme(): AppTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function normalizeTheme(theme: unknown): AppTheme {
  if (theme === 'dark' || theme === 'light' || theme === 'midnight' || theme === 'aurora' || theme === 'sunset' || theme === 'forest') {
    return theme;
  }

  return getPreferredTheme();
}

export function normalizeEditorTheme(theme: unknown): EditorThemeName {
  if (theme === 'aurora' || theme === 'sunset' || theme === 'forest') {
    return theme;
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
