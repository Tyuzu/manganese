import { button, createButton, div, h1, input, label, p, uiClasses } from '../components/ui/dom';
import { createDetailPanel } from './shared';

export async function createPdfScannerPage(): Promise<HTMLElement> {
  const root = div({ className: uiClasses.card },
    h1({ className: 'm-0 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl' }, 'PDF Scanner & Editor'),
    p({ className: 'mt-3 text-sm leading-6 text-slate-600' }, 'Turn paper input into polished, searchable digital documents.')
  );

  const uploadRow = div({ className: 'mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center' },
    label({ className: 'text-sm font-semibold text-slate-700' }, 'Upload PDF or image scan'),
    input({ type: 'file', accept: '.pdf,image/*', className: 'block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700' }),
    createButton('primary', { type: 'button' }, 'Scan document')
  );

  const preview = div({ className: 'mt-6 grid gap-4 lg:grid-cols-[1.5fr_0.9fr]' },
    div({ className: 'flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 text-lg font-semibold text-slate-700' }, 'Scan preview: invoice.pdf'),
    createDetailPanel('Scan summary', [
      { label: 'Pages', value: '4 pages' },
      { label: 'OCR', value: 'Enabled' },
      { label: 'Output', value: 'PDF / JPG / TXT' },
    ])
  );

  root.append(
    uploadRow,
    preview,
    div({ className: 'mt-6 flex flex-wrap gap-3' },
      button({ type: 'button', className: uiClasses.secondaryButton }, 'Deskew'),
      button({ type: 'button', className: uiClasses.secondaryButton }, 'OCR text'),
      createButton('primary', { type: 'button' }, 'Merge PDFs')
    )
  );

  return root;
}
