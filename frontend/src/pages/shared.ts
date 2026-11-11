import { button, cn, createButton, div, h2, p, span, uiClasses } from '../components/ui/dom';

export interface DashboardFeature {
  title: string;
  description: string;
  route: string;
  action: string;
}

export function createFeatureCard(feature: DashboardFeature, onNavigate: (route: string) => void): HTMLElement {
  const card = div({ className: 'flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5' });

  card.append(
    h2({ className: 'm-0 text-xl font-bold text-slate-900' }, feature.title),
    p({ className: 'm-0 text-sm leading-6 text-slate-600' }, feature.description),
  );

  const actionButton = createButton('primary', { type: 'button', className: 'mt-auto w-full' }, feature.action);
  actionButton.addEventListener('click', () => onNavigate(feature.route));
  card.appendChild(actionButton);

  return card;
}

export function createFeatureGrid(features: DashboardFeature[], onNavigate: (route: string) => void): HTMLElement {
  const grid = div({ className: 'mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4' });

  features.forEach((feature) => {
    grid.appendChild(createFeatureCard(feature, onNavigate));
  });

  return grid;
}

export function createDetailPanel(title: string, details: Array<{ label: string; value: string }>): HTMLElement {
  const panel = div({ className: cn(uiClasses.panel, 'flex flex-col gap-3') });

  details.forEach(({ label, value }) => {
    panel.append(
      p({ className: 'm-0 text-sm text-slate-600' }, span({ className: 'font-bold text-slate-800' }, `${label}: `), value)
    );
  });

  if (title) {
    panel.prepend(
      h2({ className: 'm-0 text-lg font-bold text-slate-900' }, title)
    );
  }

  return panel;
}

export function createWorkspaceButton(
  variant: 'primary' | 'secondary' = 'primary',
  label: string,
  attributes?: Record<string, any>
): HTMLButtonElement {
  return button({
    ...attributes,
    type: 'button',
    className: cn(variant === 'primary' ? uiClasses.primaryButton : uiClasses.secondaryButton, attributes?.className),
  }, label);
}
