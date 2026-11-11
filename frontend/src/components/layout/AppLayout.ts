import { div, header, main, footer, h1, p } from '../ui/dom';
import { appStore } from '../../appState';
import { createNavElement } from './NavBar';

export function renderLayout(): HTMLElement {
  const container = div({ className: 'app-shell' });

  const headerEl = header({ className: 'app-header' },
    div({ className: 'brand-block' },
      div({ className: 'brand-mark' }, 'P'),
      div({ className: 'brand-copy' },
        h1({}, 'PixelForge'),
        p({}, 'Creative media workspace')
      )
    )
  );

  const navWrap = div({ className: 'nav-shell' });
  navWrap.appendChild(createNavElement());

  const pageHost = div({ className: 'page-content' });
  const mainEl = main({ className: 'app-main' }, pageHost);

  const footerEl = footer({ className: 'app-footer' },
    p({}, 'PixelForge © 2026'),
    p({}, 'Edit images, polish video, and process PDFs in one studio')
  );

  container.append(headerEl, navWrap, mainEl, footerEl);

  const unsubscribe = appStore.subscribe(() => {
    const newNav = createNavElement();
    navWrap.replaceChildren(newNav);
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