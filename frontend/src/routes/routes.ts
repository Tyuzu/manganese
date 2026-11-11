import { createRouter, type RouteDefinition } from './router';
import { renderLayout, renderPageIntoLayout } from '../components/layout/AppLayout';

import { createHomePage } from '../pages/Home';
import { createImageEditorPage } from '../pages/ImageStudio';
import { createVideoEditorPage } from '../pages/VideoEditor';
import { createScanPage } from '../pages/ScanCapture';
import { createPdfScannerPage } from '../pages/PdfWorkspace';
import { createLoginPage } from '../pages/Login';
import { createNotFoundPage } from '../pages/NotFound';

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
    handler: createHomePage,
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/images',
    handler: createImageEditorPage,
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/videos',
    handler: createVideoEditorPage,
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/scan',
    handler: createScanPage,
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/pdf',
    handler: createPdfScannerPage,
    protected: true,
    roles: ['user', 'admin'],
  });

  registerPageRoute({
    path: '/login',
    handler: () => createLoginPage(),
  });

  registerPageRoute({
    path: '/404',
    handler: createNotFoundPage,
  });

  return router;
}
