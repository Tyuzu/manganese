import { div, span, button, a } from '../ui/dom';
import { appStore, authActions } from '../../appState';
import { router } from '../../main';

export function createNavElement(): HTMLElement {
  const state = appStore.getState();

  const navChildren: (Node | string)[] = [
    a({ href: '/', 'data-link': '' }, 'Dashboard')
  ];

  if (state.token) {
    navChildren.push(
      a({ href: '/profile', 'data-link': '' }, 'Profile'),
      a({ href: '/images', 'data-link': '' }, 'Image Studio'),
      a({ href: '/videos', 'data-link': '' }, 'Video Editor'),
      a({ href: '/scan', 'data-link': '' }, 'Scan'),
      a({ href: '/pdf', 'data-link': '' }, 'PDF Workspace')
    );

    if (state.roles.includes('admin')) {
      const adminLink = a({ href: '/admin/settings', 'data-link': '' }, 'Admin');
      adminLink.classList.add('nav-admin-link');
      navChildren.push(adminLink);
    }

    navChildren.push(
      span({ className: 'nav-user-pill' }, `Hello, ${state.handle || 'Creator'}`),
      button({
        className: 'nav-logout',
        onClick: () => {
          authActions.logout();
          router.navigate('/login');
        }
      }, 'Logout')
    );
  } else {
    navChildren.push(
      a({ href: '/images', 'data-link': '' }, 'Image Studio'),
      a({ href: '/videos', 'data-link': '' }, 'Video Editor'),
      a({ href: '/scan', 'data-link': '' }, 'Scan'),
      a({ href: '/pdf', 'data-link': '' }, 'PDF Workspace'),
      a({ href: '/login', 'data-link': '' }, 'Login'),
      a({ href: '/register', 'data-link': '' }, 'Register'),
      button({
        className: 'nav-logout',
        onClick: () => {
          authActions.guest();
          router.navigate('/');
        }
      }, 'Guest Mode')
    );
  }

  return div({ className: 'nav-bar' }, ...navChildren);
}