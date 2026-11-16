import '../css/style.css';
import { bootstrapDolomite } from './export';

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

const dolomiteApp = bootstrapDolomite();

export const router = dolomiteApp.router;
export default dolomiteApp;