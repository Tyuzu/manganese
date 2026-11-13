import { a, nav } from '../ui/dom';

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

  return nav({
    className: 'nav-bar flex flex-col gap-1.5 rounded-2xl border border-slate-700/50 bg-slate-900/30 p-1.5 shadow-lg backdrop-blur-2xl sm:flex-row sm:flex-wrap sm:items-center',
    role: 'navigation'
  },
    a({ href: '/', className: getNavLinkClass(currentPath, '/'), 'data-link': '' }, 'Dashboard'),
    a({ href: '/images', className: getNavLinkClass(currentPath, '/images'), 'data-link': '' }, 'Image Studio'),
    a({ href: '/videos', className: getNavLinkClass(currentPath, '/videos'), 'data-link': '' }, 'Video Editor'),
    a({ href: '/scan', className: getNavLinkClass(currentPath, '/scan'), 'data-link': '' }, 'Scan'),
    a({ href: '/pdf', className: getNavLinkClass(currentPath, '/pdf'), 'data-link': '' }, 'PDF Workspace')
  );
}