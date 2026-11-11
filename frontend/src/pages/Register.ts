import { div, h2, form, label, input, button } from '../components/ui/dom';
import { apiFetch } from '../api';
import { router } from '../main';

export function createRegisterPage(): HTMLElement {
  const errorDiv = div({ className: 'error' });
  const usernameInput = input({ type: 'text', required: true });
  const passwordInput = input({ type: 'password', required: true });

  const registerForm = form({
    onSubmit: async (e: Event) => {
      e.preventDefault();
      errorDiv.textContent = '';
      try {
        const username = (usernameInput as HTMLInputElement).value;
        const password = (passwordInput as HTMLInputElement).value;

        await apiFetch('/register', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        alert('Registration successful! Please sign in.');
        router.navigate('/login');
      } catch (err: any) {
        errorDiv.textContent = err.message;
      }
    }
  },
    div({ className: 'form-group' }, label({}, 'Choose Username'), usernameInput),
    div({ className: 'form-group' }, label({}, 'Choose Password'), passwordInput),
    button({ type: 'submit' }, 'Create Account'),
    errorDiv
  );

  return div({ className: 'card' }, h2({}, 'Register'), registerForm);
}