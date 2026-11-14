import { createStore } from './state/store';
import { withPersistence } from './state/persistence';
import { applyEditorTheme, applyTheme, normalizeEditorTheme, normalizeTheme, type AppTheme, type EditorThemeName } from './theme';

export interface RouteStateMap {
  [routeKey: string]: Record<string, unknown>;
}

export interface AppState {
  token: string | null;
  handle: string | null;
  roles: string[];
  theme: AppTheme;
  editorTheme: EditorThemeName;
  isAuthenticated: boolean;
  routeState: RouteStateMap;
}

const normalizeRoles = (roles: unknown): string[] => {
  if (!Array.isArray(roles)) {
    return roles == null ? [] : [String(roles)];
  }

  return Array.from(
    new Set(
      roles
        .filter((role): role is string | number => role !== null && role !== undefined)
        .map((role) => String(role).trim())
        .filter(Boolean)
    )
  );
};

export const normalizeAppState = (state: Partial<AppState> = {}): AppState => {
  const token = typeof state.token === 'string' && state.token.length > 0 ? state.token : null;
  const handle = typeof state.handle === 'string' && state.handle.trim().length > 0 ? state.handle : null;
  const roles = normalizeRoles(state.roles);
  const isAuthenticated = Boolean(token || state.isAuthenticated);

  return {
    token,
    handle,
    roles,
    theme: normalizeTheme(state.theme),
    editorTheme: normalizeEditorTheme(state.editorTheme),
    isAuthenticated,
    routeState:
      state.routeState && typeof state.routeState === 'object' && !Array.isArray(state.routeState)
        ? (state.routeState as RouteStateMap)
        : {},
  };
};

export const DEFAULT_APP_STATE: AppState = normalizeAppState({
  token: null,
  handle: null,
  roles: [],
  theme: 'dark',
  editorTheme: 'midnight',
  isAuthenticated: false,
  routeState: {},
});

export const authSelectors = {
  isAuthenticated: (state: AppState) => Boolean(state.token || state.isAuthenticated),
  hasRole: (state: AppState, role: string) => state.roles.includes(role),
  hasAnyRole: (state: AppState, roles: string[]) => roles.some((role) => state.roles.includes(role)),
  getHandle: (state: AppState) => state.handle,
};

export const routeStateSelectors = {
  getRouteState: (state: AppState, routeKey: string): Record<string, unknown> => {
    const routeState = state.routeState ?? {};
    const candidate = routeState[routeKey];
    return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>)
      : {};
  },
};

const baseStore = createStore<AppState>(DEFAULT_APP_STATE);

export const appStore = withPersistence(baseStore, {
  key: 'my_spa_app_state',
  version: 5,
  debounceMs: 0,
  migrations: {
    5: (oldState: any) =>
      normalizeAppState({
        token: oldState?.token ?? null,
        handle: oldState?.handle ?? null,
        roles: Array.isArray(oldState?.roles) ? oldState.roles : oldState?.token ? ['user'] : [],
        theme: normalizeTheme(oldState?.theme),
        editorTheme: normalizeEditorTheme(oldState?.editorTheme),
        isAuthenticated: Boolean(oldState?.token || oldState?.isAuthenticated),
        routeState: oldState?.routeState ?? {},
      }),
  },
  pick: (state) => ({
    token: state.token,
    handle: state.handle,
    roles: state.roles,
    theme: state.theme,
    editorTheme: state.editorTheme,
    isAuthenticated: state.isAuthenticated,
    routeState: state.routeState,
  }),
});

appStore.subscribe((state) => {
  applyTheme(state.theme);
  applyEditorTheme(state.editorTheme);
});
applyTheme(appStore.getState().theme);
applyEditorTheme(appStore.getState().editorTheme);

export const routeStateActions = {
  set: (routeKey: string, value: Record<string, unknown>) => {
    appStore.setState((currentState) => ({
      ...currentState,
      routeState: {
        ...currentState.routeState,
        [routeKey]: value,
      },
    }));
  },
  clear: (routeKey?: string) => {
    appStore.setState((currentState) => {
      if (!routeKey) {
        return { ...currentState, routeState: {} };
      }

      const nextRouteState = { ...currentState.routeState };
      delete nextRouteState[routeKey];
      return { ...currentState, routeState: nextRouteState };
    });
  },
};

export const authActions = {
  login: (token: string, handle: string, roles: string[]) => {
    appStore.setState((currentState) =>
      normalizeAppState({
        ...currentState,
        token,
        handle,
        roles,
        isAuthenticated: true,
      })
    );
  },
  guest: () => {
    appStore.setState((currentState) =>
      normalizeAppState({
        ...currentState,
        token: 'guest',
        handle: 'Guest',
        roles: ['user'],
        isAuthenticated: true,
      })
    );
  },
  logout: () => {
    appStore.setState((currentState) =>
      normalizeAppState({
        ...currentState,
        token: null,
        handle: null,
        roles: [],
        isAuthenticated: false,
      })
    );
  },
  setTheme: (theme: AppTheme) => {
    const nextTheme = normalizeTheme(theme);

    appStore.setState((currentState) => ({
      ...currentState,
      theme: nextTheme,
    }));
    applyTheme(nextTheme);
  },
  setEditorTheme: (theme: EditorThemeName) => {
    const nextTheme = normalizeEditorTheme(theme);

    appStore.setState((currentState) => ({
      ...currentState,
      editorTheme: nextTheme,
    }));
    applyEditorTheme(nextTheme);
  },
};