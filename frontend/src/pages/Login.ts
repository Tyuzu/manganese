import { div, h2, form, label, input, button } from '../components/ui/dom';
import { apiFetch } from '../api';
import { authActions } from '../appState';
import { router } from '../main';

export function createLoginPage(): HTMLElement {
  const errorDiv = div({ className: 'error' });
  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect');

  const usernameInput = input({ type: 'text', required: true, value: 'admin' });
  const passwordInput = input({ type: 'password', required: true, value: 'secret' });

  const loginForm = form({
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
    div({ className: 'form-group' }, label({}, 'Username (try "admin")'), usernameInput),
    div({ className: 'form-group' }, label({}, 'Password (try "secret")'), passwordInput),
    button({ type: 'submit' }, 'Sign In'),
    errorDiv
  );

  return div({ className: 'card' }, h2({}, 'Login'), loginForm);
}