import { div, span, button, a } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';

export function createNavElement(): HTMLElement {
  const state = appStore.getState();
  const baseLink = 'inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold transition-colors duration-200';
  const ghostLink = `${baseLink} text-slate-700 hover:bg-slate-100 hover:text-slate-900`;
  const logoutButton = `${baseLink} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`;
  const navChildren: (Node | string)[] = [
    a({ href: '/', className: `${ghostLink} text-slate-900`, 'data-link': '' }, 'Dashboard')
  ];

  if (state.token) {
    navChildren.push(
      a({ href: '/images', className: ghostLink, 'data-link': '' }, 'Image Studio'),
      a({ href: '/videos', className: ghostLink, 'data-link': '' }, 'Video Editor'),
      a({ href: '/scan', className: ghostLink, 'data-link': '' }, 'Scan'),
      a({ href: '/pdf', className: ghostLink, 'data-link': '' }, 'PDF Workspace')
    );

    navChildren.push(
      span({ className: 'ml-auto inline-flex items-center rounded-full bg-blue-50 px-3 py-2 text-sm font-bold text-slate-800' }, `Hello, ${state.handle || 'Creator'}`),
      button({
        className: logoutButton,
        onClick: () => {
          authActions.logout();
          router.navigate('/login');
        }
      }, 'Logout')
    );
  } else {
    navChildren.push(
      a({ href: '/images', className: ghostLink, 'data-link': '' }, 'Image Studio'),
      a({ href: '/videos', className: ghostLink, 'data-link': '' }, 'Video Editor'),
      a({ href: '/scan', className: ghostLink, 'data-link': '' }, 'Scan'),
      a({ href: '/pdf', className: ghostLink, 'data-link': '' }, 'PDF Workspace'),
      a({ href: '/login', className: ghostLink, 'data-link': '' }, 'Login'),
      button({
        className: logoutButton,
        onClick: () => {
          authActions.guest();
          router.navigate('/');
        }
      }, 'Guest Mode')
    );
  }

  return div({ className: 'nav-bar flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-200 bg-white/85 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm' }, ...navChildren);
}