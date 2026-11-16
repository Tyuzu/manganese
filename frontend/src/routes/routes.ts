import { createRouter, type RouteDefinition } from './router';
import { renderLayout, renderPageIntoLayout } from '../components/layout/AppLayout';

interface PageRouteDefinition extends Omit<RouteDefinition, 'handler'> {
  handler: () => Promise<HTMLElement> | HTMLElement;
}

export function setupRouter() {
  const router = createRouter();
  const app = document.getElementById('app')!;
  let appShell: HTMLElement | null = null;

  const ensureAppShell = () => {
    if (!appShell || !app.contains(appShell)) {
      appShell = renderLayout();
      app.replaceChildren(appShell);
    }
    return appShell;
  };

  const wrap = (el: HTMLElement) => {
    const shell = ensureAppShell();
    renderPageIntoLayout(shell, el);
  };

  const registerPageRoute = ({ path, handler, protected: protectedRoute = false, roles = [] }: PageRouteDefinition) => {
    router.addRoute({
      path,
      protected: protectedRoute,
      roles,
      handler: async () => {
        const pageElement = await handler();
        wrap(pageElement);
      },
    });
  };

  registerPageRoute({
    path: '/',
    handler: async () => {
      const { createHomePage } = await import('../pages/Home');
      return createHomePage();
    },
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/images',
    handler: async () => {
      const { createImageEditorPage } = await import('../pages/ImageStudio');
      return createImageEditorPage();
    },
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/videos',
    handler: async () => {
      const { createVideoEditorPage } = await import('../pages/VideoEditor');
      return createVideoEditorPage();
    },
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/scan',
    handler: async () => {
      const { createScanPage } = await import('../pages/ScanCapture');
      return createScanPage();
    },
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/pdf',
    handler: async () => {
      const { createPdfScannerPage } = await import('../pages/PdfWorkspace');
      return createPdfScannerPage();
    },
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/login',
    handler: async () => {
      const { createLoginPage } = await import('../pages/Login');
      return createLoginPage();
    },
  });

  registerPageRoute({
    path: '/404',
    handler: async () => {
      const { createNotFoundPage } = await import('../pages/NotFound');
      return createNotFoundPage();
    },
  });

  return router;
}
