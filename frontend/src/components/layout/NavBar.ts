import { a, nav } from '../ui/dom';

function getNavLinkClass(path: string, href: string): string {
  const isActive = path === href || (href !== '/' && (path === href || path.startsWith(`${href}/`)));

  return [
    'nav-link inline-flex items-center justify-center rounded-full px-3.5 py-2 text-sm font-semibold transition-all duration-200',
    isActive
      ? 'active-nav text-white shadow-[0_10px_24px_rgba(79,70,229,0.34)]'
      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
  ].join(' ');
}

export function createNavElement(): HTMLElement {
  const currentPath = window.location.pathname;

  return nav({
    className: 'nav-bar flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-800/90 bg-slate-950/70 p-2 shadow-[0_10px_24px_rgba(15,23,42,0.22)] backdrop-blur-md',
    role: 'navigation'
  },
    a({ href: '/', className: getNavLinkClass(currentPath, '/'), 'data-link': '' }, 'Dashboard'),
    a({ href: '/images', className: getNavLinkClass(currentPath, '/images'), 'data-link': '' }, 'Image Studio'),
    a({ href: '/videos', className: getNavLinkClass(currentPath, '/videos'), 'data-link': '' }, 'Video Editor'),
    a({ href: '/scan', className: getNavLinkClass(currentPath, '/scan'), 'data-link': '' }, 'Scan'),
    a({ href: '/pdf', className: getNavLinkClass(currentPath, '/pdf'), 'data-link': '' }, 'PDF Workspace')
  );
}