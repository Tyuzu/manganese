import { appStore, authSelectors, routeStateActions, routeStateSelectors } from '../appState';
import { a as createAnchor, createErrorCard, div, h2 } from '../components/ui/dom';

export type RouteHandler = (params: Record<string, string>) => void | Promise<void>;

export interface RouteDefinition {
  path: string;
  handler: RouteHandler;
  protected?: boolean;
  roles?: string[];
}

interface RouteRecord extends RouteDefinition {
  pattern: RegExp;
  paramNames: string[];
}

export function createRouter() {
  const routes: RouteRecord[] = [];

  window.addEventListener('popstate', () => handleRoute());

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a[data-link]');
    if (target) {
      e.preventDefault();
      const href = target.getAttribute('href');
      if (href) navigate(href);
    }
  });

  function addRoute(route: RouteDefinition): void {
    const paramNames: string[] = [];
    const regexPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    routes.push({
      ...route,
      pattern: new RegExp(`^${regexPath}$`),
      paramNames,
    });
  }

  function add(path: string, handler: RouteHandler, protectedRoute = false, roles: string[] = []): void {
    addRoute({ path, handler, protected: protectedRoute, roles });
  }

  function navigate(path: string): void {
    window.history.pushState(null, '', path);
    void handleRoute();
  }

  async function handleRoute(): Promise<void> {
    const currentPath = window.location.pathname;
    const state = appStore.getState();
    const isAuthenticated = authSelectors.isAuthenticated(state);

    for (const route of routes) {
      const match = currentPath.match(route.pattern);
      if (!match) {
        continue;
      }

      if (route.protected && !isAuthenticated) {
        const encoded = encodeURIComponent(currentPath + window.location.search);
        navigate(`/login?redirect=${encoded}`);
        return;
      }

      if (route.roles && route.roles.length > 0) {
        const hasRequiredRole = authSelectors.hasAnyRole(state, route.roles);
        if (!hasRequiredRole) {
          navigate('/404');
          return;
        }
      }

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });

      const routeKey = route.path;
      const currentRouteState = routeStateSelectors.getRouteState(state, routeKey);
      routeStateActions.set(routeKey, {
        ...currentRouteState,
        lastPath: currentPath,
        params,
        search: window.location.search,
      });

      const app = document.getElementById('app');

      try {
        const viewResult = route.handler(params);
        if (viewResult instanceof Promise && app) {
          app.replaceChildren(
            div({ className: 'card mx-auto max-w-xl text-center' },
              h2({ className: 'text-xl font-semibold text-slate-900' }, 'Loading module...')
            )
          );
          await viewResult;
        }
      } catch (err) {
        console.error('Failed to load route chunk or handler:', err);
        if (app) {
          app.replaceChildren(createErrorCard('Error', 'Failed to load page component.'));
        }
      }
      return;
    }

    const app = document.getElementById('app');
    if (app) {
      app.replaceChildren(
        div({ className: 'card mx-auto max-w-xl text-center' },
          h2({ className: 'text-2xl font-bold tracking-tight text-slate-900' }, '404 - Page Not Found'),
          createAnchor({ href: '/', className: 'mt-4 inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500', 'data-link': '' }, 'Go Home')
        )
      );
    }
  }

  return { add, addRoute, navigate, handleRoute };
}
