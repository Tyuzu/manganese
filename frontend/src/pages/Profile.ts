import { div, h2, p, span, button } from '../components/ui/dom';
import { appStore, authActions } from '../appState';
import { router } from '../main';

export function createProfilePage(): HTMLElement {
  const state = appStore.getState();

  return div({ className: 'card' },
    h2({}, 'User Profile'),
    p({}, span({ style: 'font-weight: bold;' }, 'Username: '), state.handle || 'N/A'),
    p({}, span({ style: 'font-weight: bold;' }, 'Roles: '), state.roles.join(', ') || 'None'),
    p({}, span({ style: 'font-weight: bold;' }, 'Token: '), state.token ? `${state.token.substring(0, 15)}...` : 'None'),
    button({
      onClick: () => {
        authActions.logout();
        router.navigate('/login');
      },
      style: 'background: #dc2626; margin-top: 10px; color: white;'
    }, 'Logout')
  );
}