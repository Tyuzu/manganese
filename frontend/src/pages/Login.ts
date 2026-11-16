import { div, h2, form, label, input, button } from '../components/ui/dom';
import { apiFetch } from '../api';
import { authActions } from '../appState';
import { router } from '../main';

export function createLoginPage(): HTMLElement {
  const errorDiv = div({ className: 'fluent-form-error' });
  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect');

  const usernameInput = input({
    type: 'text',
    required: true,
    value: 'admin',
    className: 'fluent-input'
  });

  const passwordInput = input({
    type: 'password',
    required: true,
    value: 'secret',
    className: 'fluent-input'
  });

  const guestButton = button({
    type: 'button',
    className: 'fluent-guest-button'
  }, 'Continue as Guest');

  const loginForm = form({
    className: 'fluent-login-form',
    onSubmit: async (e: Event) => {
      e.preventDefault();
      errorDiv.textContent = '';
      try {
        const username = (usernameInput as HTMLInputElement).value;
        const password = (passwordInput as HTMLInputElement).value;

        const res = await apiFetch<{ token: string }>('/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        const assignedRoles = username === 'admin' ? ['admin', 'user'] : ['user'];
        authActions.login(res.token, username, assignedRoles);

        const destination = redirectTarget ? decodeURIComponent(redirectTarget) : '/profile';
        router.navigate(destination);
      } catch (err: any) {
        errorDiv.textContent = err.message;
      }
    }
  },
    div({ className: 'fluent-field' },
      label({ className: 'fluent-field-label' }, 'Username (try "admin")'),
      usernameInput
    ),
    div({ className: 'fluent-field' },
      label({ className: 'fluent-field-label' }, 'Password (try "secret")'),
      passwordInput
    ),
    button({ type: 'submit', className: 'fluent-primary-button full-width' }, 'Sign In'),
    guestButton,
    errorDiv
  );

  guestButton.addEventListener('click', () => {
    authActions.guest();
    const destination = redirectTarget ? decodeURIComponent(redirectTarget) : '/';
    router.navigate(destination);
  });

  return div({ className: 'fluent-login-card' },
    h2({ className: 'fluent-login-title' }, 'Login'),
    loginForm
  );
}