import { appStore, authActions } from './appState';
import { setupRouter } from './routes';

export interface DolomiteBootstrapOptions {
  mountId?: string;
  root?: HTMLElement | string | null;
  startPath?: string;
  onReady?: (api: DolomiteAppInstance) => void;
}

export interface DolomiteAppInstance {
  router: ReturnType<typeof setupRouter>;
  navigate: (path: string) => void;
  login: (token: string, handle: string, roles?: string[]) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  mount: (target?: HTMLElement | string | null) => HTMLElement;
}

const APP_GLOBAL_KEY = '__DOLMITE_APP__';

function ensureAppRoot(mountId: string, root?: HTMLElement | string | null): HTMLElement {
  if (root && typeof root !== 'string') {
    let appRoot = root.querySelector(`#${mountId}`) as HTMLElement | null;
    if (!appRoot) {
      appRoot = document.createElement('div');
      appRoot.id = mountId;
      root.appendChild(appRoot);
    }
    return appRoot;
  }

  const rootElement = typeof root === 'string' ? document.querySelector(root) as HTMLElement | null : null;
  const existingRoot = rootElement ?? document.getElementById(mountId);

  if (existingRoot) {
    return existingRoot;
  }

  const body = document.body ?? document.documentElement;
  const createdRoot = document.createElement('div');
  createdRoot.id = mountId;
  body.appendChild(createdRoot);
  return createdRoot;
}

export function bootstrapDolomite(options: DolomiteBootstrapOptions = {}): DolomiteAppInstance {
  const mountId = options.mountId ?? 'app';
  const globalWindow = window as Window & {
    [APP_GLOBAL_KEY]?: DolomiteAppInstance;
    Dolomite?: {
      bootstrap: typeof bootstrapDolomite;
      app: DolomiteAppInstance;
    };
  };

  if (globalWindow[APP_GLOBAL_KEY]) {
    return globalWindow[APP_GLOBAL_KEY]!;
  }

  ensureAppRoot(mountId, options.root);

  const router = setupRouter();

  const unauthorizedHandler = () => {
    authActions.logout();
    router.navigate('/login');
  };

  window.addEventListener('auth:unauthorized', unauthorizedHandler);

  const api: DolomiteAppInstance = {
    router,
    navigate: (path: string) => router.navigate(path),
    login: (token: string, handle: string, roles: string[] = []) => {
      authActions.login(token, handle, roles);
      const redirect = new URL(window.location.href).searchParams.get('redirect');
      if (redirect) {
        router.navigate(decodeURIComponent(redirect));
        return;
      }
      router.handleRoute();
    },
    logout: () => {
      authActions.logout();
      router.navigate('/login');
    },
    isAuthenticated: () => {
      const state = appStore.getState();
      return Boolean(state.token || state.isAuthenticated);
    },
    mount: (target) => ensureAppRoot(mountId, target),
  };

  globalWindow[APP_GLOBAL_KEY] = api;
  globalWindow.Dolomite = {
    ...(globalWindow.Dolomite ?? {}),
    bootstrap: bootstrapDolomite,
    app: api,
  };

  if (options.startPath && window.location.pathname === '/') {
    window.history.pushState(null, '', options.startPath);
  }

  void router.handleRoute();
  options.onReady?.(api);

  return api;
}

export default bootstrapDolomite;
