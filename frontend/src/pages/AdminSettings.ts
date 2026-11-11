import { div, h2, p } from '../components/ui/dom';

export function createAdminSettingsPage(): HTMLElement {
  return div({ className: 'card' },
    h2({}, '⚙️ Admin Control Panel'),
    p({}, 'Welcome, administrator. System controls are available here.')
  );
}