import { a, nav } from '../ui/dom';

function getNavLinkClass(path: string, href: string): string {
  const isActive = path === href || (href !== '/' && (path === href || path.startsWith(`${href}/`)));

  return [
    'nav-link relative inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-150',
    isActive
      ? 'active-nav bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-white/20'
      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
  ].join(' ');
}

export function createNavElement(): HTMLElement {
  const currentPath = window.location.pathname;

  return nav({
    className: 'nav-bar flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-1.5 shadow-lg backdrop-blur-2xl',
    role: 'navigation'
  },
    a({ href: '/', className: getNavLinkClass(currentPath, '/'), 'data-link': '' }, 'Dashboard'),
    a({ href: '/images', className: getNavLinkClass(currentPath, '/images'), 'data-link': '' }, 'Image Studio'),
    a({ href: '/videos', className: getNavLinkClass(currentPath, '/videos'), 'data-link': '' }, 'Video Editor'),
    a({ href: '/scan', className: getNavLinkClass(currentPath, '/scan'), 'data-link': '' }, 'Scan'),
    a({ href: '/pdf', className: getNavLinkClass(currentPath, '/pdf'), 'data-link': '' }, 'PDF Workspace')
  );
}