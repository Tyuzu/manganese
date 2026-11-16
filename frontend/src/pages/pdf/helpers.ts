import { div, p } from '../../components/ui/dom';

export function createSectionTitle(title: string, description?: string) {
  return div(
    { className: 'pdf-section-heading' },
    p({ className: 'pdf-section-title' }, title),
    description ? p({ className: 'pdf-section-description' }, description) : '',
  );
}

export function createControlGroup(...children: HTMLElement[]) {
  return div(
    { className: 'pdf-control-group' },
    ...children,
  );
}
