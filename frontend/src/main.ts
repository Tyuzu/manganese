import { setupRouter } from './routes';
import { authActions } from './appState';

// 1. Initialize router
const router = setupRouter();
export { router };

// 2. Global unauthorized event listener
window.addEventListener('auth:unauthorized', () => {
  authActions.logout();
  router.navigate('/login');
});

// 3. Initial route resolution on app load
router.handleRoute();