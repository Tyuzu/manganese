import { createStore } from './state/store';
import { withPersistence } from './state/persistence';

export interface AppState {
  token: string | null;
  handle: string | null;
  roles: string[]; // e.g. ['admin', 'farmer']
  theme: 'light' | 'dark';
}

const baseStore = createStore<AppState>({
  token: null,
  handle: null,
  roles: [],
  theme: 'light',
});

// Wrap base store with persistence, debouncing, and schema migration versioning
export const appStore = withPersistence(baseStore, {
  key: 'my_spa_app_state',
  version: 3,
  debounceMs: 300, // Debounce localStorage writes by 300ms for high-frequency updates
  migrations: {
    3: (oldState: any) => ({
      token: oldState.token,
      handle: oldState.handle || null,
      roles: oldState.roles || (oldState.token ? ['user'] : []), // Default role on migrate
      theme: oldState.theme || 'light',
    }),
  },
  pick: (state) => ({
    token: state.token,
    handle: state.handle,
    roles: state.roles,
    theme: state.theme,
  }),
});

// Pure Action helpers for authentication state management
export const authActions = {
  login: (token: string, handle: string, roles: string[]) => {
    appStore.setState({ token, handle, roles });
  },
  logout: () => {
    appStore.setState({ token: null, handle: null, roles: [] });
  },
};