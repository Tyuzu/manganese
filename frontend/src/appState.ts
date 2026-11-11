import { createStore } from './state/store';
import { withPersistence } from './state/persistence';

export type AppTheme = 'light' | 'dark';

export interface AppState {
  token: string | null;
  handle: string | null;
  roles: string[];
  theme: AppTheme;
}

export const DEFAULT_APP_STATE: AppState = {
  token: null,
  handle: null,
  roles: [],
  theme: 'light',
};

export const authSelectors = {
  isAuthenticated: (state: AppState) => Boolean(state.token),
  hasRole: (state: AppState, role: string) => state.roles.includes(role),
  hasAnyRole: (state: AppState, roles: string[]) => roles.some((role) => state.roles.includes(role)),
};

const baseStore = createStore<AppState>(DEFAULT_APP_STATE);

export const appStore = withPersistence(baseStore, {
  key: 'my_spa_app_state',
  version: 3,
  debounceMs: 300,
  migrations: {
    3: (oldState: any) => ({
      token: oldState.token ?? null,
      handle: oldState.handle ?? null,
      roles: Array.isArray(oldState.roles) ? oldState.roles : oldState.token ? ['user'] : [],
      theme: oldState.theme === 'dark' ? 'dark' : 'light',
    }),
  },
  pick: (state) => ({
    token: state.token,
    handle: state.handle,
    roles: state.roles,
    theme: state.theme,
  }),
});

export const authActions = {
  login: (token: string, handle: string, roles: string[]) => {
    appStore.setState({ token, handle, roles, theme: appStore.getState().theme });
  },
  guest: () => {
    appStore.setState({ token: 'guest', handle: 'Guest', roles: ['user'] });
  },
  logout: () => {
    appStore.setState({ token: null, handle: null, roles: [] });
  },
  setTheme: (theme: AppTheme) => {
    appStore.setState({ theme });
  },
};