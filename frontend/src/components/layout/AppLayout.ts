import { div, main, footer, p } from '../ui/dom';
import { appStore } from '../../appState';
import { createNavElement } from './NavBar';
import { createAppHeader, createHeaderActions } from './header';

export function renderLayout(): HTMLElement {
  const container = div({ className: 'app-shell' });
  const contentPane = div({ className: 'app-content-panel' });
  const headerEl = createAppHeader();

  const pageHost = div({ className: 'page-content' });
  const mainEl = main({ className: 'app-main' }, pageHost);

  const footerEl = footer(
    { className: 'app-footer' },
    p({}, 'PixelForge © 2026 Microsoft Fluent Integration'),
    p({}, 'Unified Media Workspace & Pipeline')
  );

  contentPane.append(headerEl, mainEl, footerEl);
  container.append(contentPane);

  const unsubscribe = appStore.subscribe(() => {
    const nextHeaderActions = createHeaderActions();
    const currentHeader = headerEl.querySelector('.header-meta');
    if (currentHeader) {
      currentHeader.replaceWith(nextHeaderActions);
    }

    const navShell = headerEl.querySelector('.nav-shell');
    if (navShell) {
      navShell.replaceChildren(createNavElement());
    }
  });

  (container as any).__unsubscribe = unsubscribe;
  (container as any).__pageHost = pageHost;
  return container;
}

export function renderPageIntoLayout(container: HTMLElement, contentElement: HTMLElement): void {
  const pageHost = (container as any).__pageHost as HTMLElement | undefined;

  if (!pageHost) {
    container.replaceChildren(contentElement);
    return;
  }

  pageHost.replaceChildren(contentElement);
}