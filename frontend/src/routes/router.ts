import { appStore } from '../appState';
import { div, h2, a as createAnchor } from '../components/ui/dom';

// Route handlers can return either void or a Promise for lazy loading
export type RouteHandler = (params: Record<string, string>) => void | Promise<void>;

interface Route {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  protected?: boolean;
  roles?: string[];
}

export function createRouter() {
  const routes: Route[] = [];

  window.addEventListener('popstate', () => handleRoute());

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a[data-link]');
    if (target) {
      e.preventDefault();
      const href = target.getAttribute('href');
      if (href) navigate(href);
    }
  });

  function add(path: string, handler: RouteHandler, protectedRoute = false, roles: string[] = []): void {
    const paramNames: string[] = [];
    const regexPath = path.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    const pattern = new RegExp(`^${regexPath}$`);
    routes.push({ pattern, paramNames, handler, protected: protectedRoute, roles });
  }

  function navigate(path: string): void {
    window.history.pushState(null, '', path);
    handleRoute();
  }

  async function handleRoute(): Promise<void> {
    const currentPath = window.location.pathname;
    const state = appStore.getState();
    const isAuthenticated = !!state.token;

    for (const route of routes) {
      const match = currentPath.match(route.pattern);
      if (match) {
        if (route.protected && !isAuthenticated) {
          const encoded = encodeURIComponent(currentPath + window.location.search);
          navigate(`/login?redirect=${encoded}`);
          return;
        }

        if (route.roles && route.roles.length > 0) {
          const hasRequiredRole = route.roles.some((role) => state.roles.includes(role));
          if (!hasRequiredRole) {
            navigate('/unauthorized');
            return;
          }
        }

        const params: Record<string, string> = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });

        const app = document.getElementById('app');

        try {
          const potentialPromise = route.handler(params);
          if (potentialPromise instanceof Promise && app) {
            const loadingCard = div({ className: 'card', style: 'text-align: center;' },
              h2({}, 'Loading module...')
            );
            app.replaceChildren(loadingCard);
            await potentialPromise;
          }
        } catch (err) {
          console.error('Failed to load route chunk or handler:', err);
          if (app) {
            const errorCard = div({ className: 'card error' },
              h2({}, 'Error'),
              pText('Failed to load page component.')
            );
            app.replaceChildren(errorCard);
          }
        }
        return;
      }
    }

    const app = document.getElementById('app');
    if (app) {
      const notFoundCard = div({ className: 'card' },
        h2({}, '404 - Page Not Found'),
        createAnchor({ href: '/', 'data-link': '' }, 'Go Home')
      );
      app.replaceChildren(notFoundCard);
    }
  }

  return { add, navigate, handleRoute };
}

function pText(text: string) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}
