import { a, button, div, nav, span } from '../ui/dom';

function getNavLinkClass(path: string, href: string): string {
  const isActive = path === href || (href !== '/' && (path === href || path.startsWith(`${href}/`)));

  return [
    'nav-link relative inline-flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase transition-all duration-150 sm:w-auto sm:px-4 sm:text-xs',
    isActive
      ? 'active-nav bg-slate-900/40 text-slate-50 shadow-inner ring-1 ring-white/10'
      : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
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

  const navEl = nav({
    className: 'nav-bar relative flex flex-col gap-1.5 border border-slate-700/50 bg-slate-900/30 p-1.5 shadow-lg backdrop-blur-2xl sm:flex-row sm:flex-wrap sm:items-center',
    role: 'navigation',
    style: { overflow: 'visible' }
  });

  const navList = div({
    className: 'nav-links w-full flex-col gap-1.5 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center',
    'data-nav-list': ''
  }, ...navItems);

  const toggleButton = button({
    type: 'button',
    className: 'nav-toggle inline-flex w-full items-center justify-between border border-slate-700/50 bg-slate-900/35 px-3 py-2.5 text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-100 shadow-inner transition hover:bg-slate-800/60 sm:hidden',
    'aria-expanded': 'false',
    'aria-label': 'Toggle navigation menu',
    onClick: () => {
      const nextOpen = navEl.dataset.open !== 'true';
      navEl.dataset.open = String(nextOpen);
      toggleButton.setAttribute('aria-expanded', String(nextOpen));
      toggleButton.querySelector('.nav-toggle-caret')?.setAttribute('style', nextOpen ? 'transform: rotate(180deg);' : 'transform: rotate(0deg);');
      navList.classList.toggle('is-open', nextOpen);
    }
  },
    'Navigation',
    span({ className: 'nav-toggle-caret inline-flex text-base leading-none transition-transform duration-200', style: { transform: 'rotate(0deg)' } }, '▾')
  );

  navEl.dataset.open = 'false';
  navEl.append(toggleButton, navList);

  return navEl;
}