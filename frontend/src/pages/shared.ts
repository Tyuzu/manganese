import { button, cn, createButton, div, h2, p, span, uiClasses } from '../components/ui/dom';

export interface DashboardFeature {
  title: string;
  description: string;
  route: string;
  action: string;
}

export function createFeatureCard(feature: DashboardFeature, onNavigate: (route: string) => void): HTMLElement {
  const card = div({ className: 'flex h-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-[0_18px_36px_rgba(15,23,42,0.22)]' });

  card.append(
    h2({ className: 'm-0 text-xl font-bold text-white' }, feature.title),
    p({ className: 'm-0 text-sm leading-6 text-slate-400' }, feature.description),
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
      p({ className: 'm-0 text-sm text-slate-400' }, span({ className: 'font-bold text-slate-200' }, `${label}: `), value)
    );
  });

  if (title) {
    panel.prepend(
      h2({ className: 'm-0 text-lg font-bold text-white' }, title)
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

export function createEditorTitleRow(
  title: string,
  onReset: () => void,
  onToggleFullscreen: () => void
): { titleRow: HTMLElement; fullscreenButton: HTMLButtonElement; closeButton: HTMLButtonElement } {
  const fullscreenButton = button({
    type: 'button',
    className: 'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-500/40 bg-slate-900/35 text-xl leading-none text-slate-100 transition hover:bg-slate-800/70',
    title: 'Toggle fullscreen editor view',
    onclick: onToggleFullscreen,
  }, '⤢');

  const closeButton = button({
    type: 'button',
    className: 'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-500/40 bg-slate-900/35 text-2xl leading-none text-slate-100 transition hover:bg-slate-800/70',
    onclick: onReset,
  }, '×');

  const titleRow = div({ className: 'flex flex-col gap-3 px-4 pt-5 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6 sm:pb-4' },
    div({ className: 'text-[1.6rem] leading-none font-medium tracking-tight text-slate-50 sm:text-[2rem]' }, title),
    div({ className: 'flex items-center gap-2 self-end sm:self-auto' }, fullscreenButton, closeButton)
  );

  return { titleRow, fullscreenButton, closeButton };
}

export function createEditorFooter(onCancel: () => void, onSave: () => void, saveLabel = 'Save changes'): HTMLElement {
  return div({ className: 'flex items-center justify-end gap-3 px-5 pb-5' },
    button({
      type: 'button',
      className: 'rounded-xl border border-slate-400/50 bg-transparent px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-200 transition hover:border-slate-300 hover:text-white',
      onclick: onCancel,
    }, 'Cancel'),
    button({
      type: 'button',
      className: 'rounded-xl bg-[#4ec7a6] px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 shadow-[0_12px_24px_rgba(78,199,166,0.35)] transition hover:bg-[#5fdcb3]',
      onclick: onSave,
    }, saveLabel)
  );
}
