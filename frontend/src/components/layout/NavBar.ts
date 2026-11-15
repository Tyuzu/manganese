import { a, button, div, nav, span } from '../ui/dom';

function getNavLinkClass(path: string, href: string): string {
  const isActive = path === href || (href !== '/' && (path === href || path.startsWith(`${href}/`)));

  return [
    'nav-link relative inline-flex w-full items-center justify-center rounded px-3.5 py-2 text-xs font-medium transition-colors duration-150 sm:w-auto',
    isActive
      ? 'active-nav bg-sky-600/10 text-sky-400 font-semibold border-b-2 border-sky-500'
      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
  ].join(' ');
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
    clone.classList.remove('w-full');
    clone.classList.add('mobile-preview-link', 'flex-1');
    return clone;
  });

  const overflowItems = navItems.slice(2);

  const navEl = nav({
    className: 'nav-bar relative flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/90 p-2 shadow-sm sm:flex-row sm:flex-wrap sm:items-center',
    role: 'navigation',
    style: { overflow: 'visible' }
  });

  const navPreview = div({ className: 'nav-preview flex w-full items-center gap-2 sm:hidden' }, ...previewItems);

  const navList = div({
    className: 'nav-links hidden w-full flex-col gap-1 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center',
    'data-nav-list': ''
  }, ...navItems);

  const toggleButton = button({
    type: 'button',
    className: 'nav-toggle ml-auto inline-flex w-auto min-w-[100px] items-center justify-between gap-2 rounded border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 sm:hidden',
    'aria-expanded': 'false',
    'aria-label': 'Toggle navigation menu',
    onClick: () => {
      const nextOpen = navEl.dataset.open !== 'true';
      navEl.dataset.open = String(nextOpen);
      toggleButton.setAttribute('aria-expanded', String(nextOpen));
      toggleButton.querySelector('.nav-toggle-caret')?.setAttribute('style', nextOpen ? 'transform: rotate(180deg);' : 'transform: rotate(0deg);');
      navList.classList.toggle('is-open', nextOpen);
      navList.classList.toggle('hidden', !nextOpen);
      navList.classList.toggle('flex', nextOpen);
    }
  },
    `More (${overflowItems.length})`,
    span({ className: 'nav-toggle-caret inline-flex text-xs leading-none transition-transform duration-200', style: { transform: 'rotate(0deg)' } }, '▾')
  );

  navEl.dataset.open = 'false';
  navEl.append(div({ className: 'nav-mobile-row flex w-full items-center gap-2 sm:hidden' }, navPreview, toggleButton), navList);

  return navEl;
}