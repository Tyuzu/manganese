import { button, createButton, div, h1, input, label, p, uiClasses } from '../components/ui/dom';
import { createDetailPanel } from './shared';

export async function createImageEditorPage(): Promise<HTMLElement> {
  const root = div({ className: uiClasses.card },
    h1({ className: 'm-0 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl' }, 'Image Studio'),
    p({ className: 'mt-3 text-sm leading-6 text-slate-600' }, 'Retouch photos and prepare assets for publishing.')
  );

  const toolbar = div({ className: 'mt-6 flex flex-wrap gap-3' },
    button({ type: 'button', className: uiClasses.secondaryButton }, 'Crop'),
    button({ type: 'button', className: uiClasses.secondaryButton }, 'Filters'),
    button({ type: 'button', className: uiClasses.secondaryButton }, 'Text Overlay'),
    button({ type: 'button', className: uiClasses.secondaryButton }, 'AI Enhance')
  );

  const preview = div({ className: 'mt-6 grid gap-4 lg:grid-cols-[1.5fr_0.9fr]' },
    div({ className: 'flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-100 to-slate-50 text-base font-semibold text-slate-600' }, 'Preview: Poster image'),
    createDetailPanel('Project summary', [
      { label: 'Resolution', value: '4K • 3840×2160' },
      { label: 'Format', value: 'PNG / JPG / WebP' },
      { label: 'Status', value: 'Ready for export' },
    ])
  );

  const controls = div({ className: 'mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center' },
    label({ className: 'text-sm font-semibold text-slate-700' }, 'Upload image'),
    input({ type: 'file', accept: 'image/*', className: 'block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700' }),
    createButton('primary', { type: 'button' }, 'Export image')
  );

  root.append(toolbar, preview, controls);
  return root;
}
