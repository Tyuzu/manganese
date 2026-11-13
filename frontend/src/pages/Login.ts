import { div, h2, form, label, input, button } from '../components/ui/dom';
import { apiFetch } from '../api';
import { authActions } from '../appState';
import { router } from '../main';

export function createLoginPage(): HTMLElement {
  const errorDiv = div({ className: 'mt-2 min-h-5 text-sm font-medium text-red-600' });
  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect');

  const usernameInput = input({
    type: 'text',
    required: true,
    value: 'admin',
    className: 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
  });

  const passwordInput = input({
    type: 'password',
    required: true,
    value: 'secret',
    className: 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
  });

  const guestButton = button({
    type: 'button',
    className: 'w-full rounded-xl border border-slate-300 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700'
  }, 'Continue as Guest');

  const loginForm = form({
    className: 'mt-5 flex flex-col gap-4',
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
    div({ className: 'flex flex-col gap-2' },
      label({ className: 'text-sm font-semibold text-slate-700' }, 'Username (try "admin")'),
      usernameInput
    ),
    div({ className: 'flex flex-col gap-2' },
      label({ className: 'text-sm font-semibold text-slate-700' }, 'Password (try "secret")'),
      passwordInput
    ),
    button({ type: 'submit', className: 'w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500' }, 'Sign In'),
    guestButton,
    errorDiv
  );

  guestButton.addEventListener('click', () => {
    authActions.guest();
    const destination = redirectTarget ? decodeURIComponent(redirectTarget) : '/';
    router.navigate(destination);
  });

  return div({ className: 'card mx-auto w-full max-w-xl rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:p-7' },
    h2({ className: 'text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl' }, 'Login'),
    loginForm
  );
}