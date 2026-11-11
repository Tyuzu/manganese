import { createRouter } from './router';
import { renderLayout, renderPageIntoLayout } from '../components/layout/AppLayout';

import {
  createHomePage,
  createImageEditorPage,
  createVideoEditorPage,
  createScanPage,
  createPdfScannerPage,
} from '../pages/Home';
import { createLoginPage } from '../pages/Login';
import { createRegisterPage } from '../pages/Register';
import { createProfilePage } from '../pages/Profile';
import { createAdminSettingsPage } from '../pages/AdminSettings';
import { createUnauthorizedPage } from '../pages/Unauthorized';
import { createNotFoundPage } from '../pages/NotFound';

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

  router.add('/', async () => {
    const pageEl = await createHomePage();
    wrap(pageEl);
  }, true, ['user', 'admin']);

  router.add('/dashboard', async () => {
    const pageEl = await createHomePage();
    wrap(pageEl);
  }, true, ['user', 'admin']);

  router.add('/images', async () => {
    const pageEl = await createImageEditorPage();
    wrap(pageEl);
  }, true, ['user', 'admin']);

  router.add('/videos', async () => {
    const pageEl = await createVideoEditorPage();
    wrap(pageEl);
  }, true, ['user', 'admin']);

  router.add('/scan', async () => {
    const pageEl = await createScanPage();
    wrap(pageEl);
  }, true, ['user', 'admin']);

  router.add('/pdf', async () => {
    const pageEl = await createPdfScannerPage();
    wrap(pageEl);
  }, true, ['user', 'admin']);

  router.add('/scanner', async () => {
    const pageEl = await createPdfScannerPage();
    wrap(pageEl);
  }, true, ['user', 'admin']);

  router.add('/login', () => wrap(createLoginPage()));
  router.add('/register', () => wrap(createRegisterPage()));
  router.add('/profile', () => wrap(createProfilePage()), true, ['user', 'admin']);
  router.add('/admin/settings', () => wrap(createAdminSettingsPage()), true, ['admin']);
  router.add('/unauthorized', () => wrap(createUnauthorizedPage()));
  router.add('/404', () => wrap(createNotFoundPage()));

  return router;
}
