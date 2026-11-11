import { cn, div, h1, p, span, uiClasses } from '../components/ui/dom';
import { createFeatureGrid } from './shared';
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
  const hero = div({ className: cn(uiClasses.card, 'max-w-5xl overflow-hidden border border-slate-800 bg-slate-950/80') },
    div({ className: 'mb-6 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-300' },
      span({ className: 'h-2 w-2 rounded-full bg-sky-400 animate-pulse' }),
      'Unified Creative Suite'
    ),
    h1({ className: 'm-0 text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl' }, 'Creative Media & Document Workspace'),
    p({ className: 'mt-3 max-w-2xl text-sm leading-6 text-slate-400' }, 'Edit images, refine video, and transform PDFs from a single high-performance studio built for fast creative work.')
  );

  hero.appendChild(createFeatureGrid(dashboardFeatures, (route) => router.navigate(route)));
  return hero;
}