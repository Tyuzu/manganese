import { a, button, div, nav, span } from '../ui/dom';

/** Compute normalized active link state matching subpaths properly */
function getNavLinkClass(path: string, href: string): string {
  const normalizedPath = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
  const normalizedHref = href.endsWith("/") && href !== "/" ? href.slice(0, -1) : href;
  const isActive = normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);

  return [
    'nav-link',
    isActive ? 'is-active' : ''
  ].filter(Boolean).join(' ');
}

export function createNavElement(): HTMLElement {
  const currentPath = window.location.pathname;

  const navItems = [
    a({ href: '/', className: getNavLinkClass(currentPath, '/'), 'data-link': '' }, 'Dashboard'),
    a({ href: '/images', className: getNavLinkClass(currentPath, '/images'), 'data-link': '' }, 'Image Studio'),
    a({ href: '/videos', className: getNavLinkClass(currentPath, '/videos'), 'data-link': '' }, 'Video Editor'),
    a({ href: '/scan', className: getNavLinkClass(currentPath, '/scan'), 'data-link': '' }, 'Scan'),
    a({ href: '/pdf', className: getNavLinkClass(currentPath, '/pdf'), 'data-link': '' }, 'PDF Workspace')
  ];

  const previewItems = navItems.slice(0, 2).map((item) => {
    const clone = item.cloneNode(true) as HTMLElement;
    clone.classList.add('nav-preview-link');
    return clone;
  });

  const overflowItems = navItems.slice(2);

  const navEl = nav({
    className: 'nav-bar',
    role: 'navigation',
  });

  const navPreview = div({ className: 'nav-preview' }, ...previewItems);

  const navList = div({
    className: 'nav-links',
    'data-nav-list': ''
  }, ...navItems);

  const toggleButton = button({
    type: 'button',
    className: 'nav-toggle',
    'aria-expanded': 'false',
    'aria-label': 'Toggle navigation menu',
    onClick: () => {
      const nextOpen = navEl.dataset.open !== 'true';
      navEl.dataset.open = String(nextOpen);
      toggleButton.setAttribute('aria-expanded', String(nextOpen));
      
      const caret = toggleButton.querySelector('.nav-toggle-caret') as HTMLElement;
      if (caret) {
        caret.style.transform = nextOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      }

      navList.classList.toggle('is-open', nextOpen);
    }
  },
    `More (${overflowItems.length})`,
    span({ className: 'nav-toggle-caret' }, '▾')
  );

  navEl.dataset.open = 'false';
  navEl.append(
    div({ className: 'nav-mobile-row' }, navPreview, toggleButton),
    navList
  );

  return navEl;
}