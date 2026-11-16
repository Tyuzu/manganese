export const APP_THEMES = [
  'light',
  'dark',
  'dimmed',
  'solarized',
  'nord',
  'midnight',
  'emerald',
  'dracula',
  'catppuccin',
  'gruvbox',
  'tokyo-night',
  'cyberpunk',
  'latte',
  'rose-pine',
  'high-contrast',
] as const;

export type AppTheme = typeof APP_THEMES[number];

export const EDITOR_THEMES = [
  'midnight',
  'aurora',
  'sunset',
  'forest',
  'dark',
  'light',
  'dimmed',
  'nord',
  'dracula',
  'catppuccin',
  'tokyo-night',
  'cyberpunk',
] as const;

export type EditorThemeName = typeof EDITOR_THEMES[number];
