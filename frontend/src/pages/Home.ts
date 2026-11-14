import { cn, div, h1, p, span, uiClasses } from '../components/ui/dom';
import { createFeatureGrid, createMediaProcessingModeSelector } from './shared';
import { router } from '../main';

const dashboardFeatures = [
  {
    title: 'Image Studio',
    description: 'Crop, enhance, annotate, and export high-quality visuals.',
    route: '/images',
    action: 'Launch editor',
  },
  {
    title: 'Video Editor',
    description: 'Trim clips, sync captions, and polish final motion stories.',
    route: '/videos',
    action: 'Open timeline',
  },
  {
    title: 'Scan & Convert',
    description: 'Capture pages, clean them up, and export as PDF or photo output.',
    route: '/scan',
    action: 'Open scanner',
  },
  {
    title: 'PDF Workspace',
    description: 'Scan, merge, sign, and convert documents without leaving the app.',
    route: '/pdf',
    action: 'Open workspace',
  },
];

export async function createHomePage(): Promise<HTMLElement> {
  const hero = div({
    className: cn(
      uiClasses.card,
      'relative max-w-5xl overflow-hidden border border-slate-800/80 bg-slate-950/80 px-6 py-6 sm:px-8 sm:py-8'
    )
  },
    div({ className: 'absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(168,85,247,0.18),transparent_25%)]' }),
    div({ className: 'relative z-10' },
      div({ className: 'mb-6 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300' },
        span({ className: 'h-2 w-2 rounded-full bg-sky-400 animate-pulse' }),
        'Unified Creative Suite'
      ),
      div({ className: 'flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between' },
        div({ className: 'max-w-2xl' },
          h1({ className: 'm-0 text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl' }, 'Build, polish, and ship creative work faster.'),
          p({ className: 'mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base' }, 'Turn scattered media workflows into one streamlined studio for image edits, video polish, and document processing.')
        ),
        div({ className: 'grid grid-cols-2 gap-3 sm:grid-cols-3' },
          div({ className: 'rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2' },
            p({ className: 'm-0 text-[10px] uppercase tracking-[0.2em] text-slate-400' }, 'Projects'),
            p({ className: 'mt-2 text-xl font-bold text-white' }, '24')
          ),
          div({ className: 'rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2' },
            p({ className: 'm-0 text-[10px] uppercase tracking-[0.2em] text-slate-400' }, 'Exports'),
            p({ className: 'mt-2 text-xl font-bold text-white' }, '9.4k')
          ),
          div({ className: 'rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 sm:col-span-1 col-span-2' },
            p({ className: 'm-0 text-[10px] uppercase tracking-[0.2em] text-slate-400' }, 'Avg. time'),
            p({ className: 'mt-2 text-xl font-bold text-white' }, '4.8 min')
          )
        )
      )
    )
  );

  hero.appendChild(createMediaProcessingModeSelector({ label: 'Edit location', className: 'mt-6 max-w-xl' }));
  hero.appendChild(createFeatureGrid(dashboardFeatures, (route) => router.navigate(route)));
  return hero;
}