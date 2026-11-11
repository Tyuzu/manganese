import { cn, div, h1, p, uiClasses } from '../components/ui/dom';
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
    action: 'Open scanner',
  },
];

export async function createHomePage(): Promise<HTMLElement> {
  const root = div({ className: cn(uiClasses.card, 'max-w-5xl') },
    h1({ className: 'm-0 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl' }, 'Creative Media Dashboard'),
    p({ className: 'mt-3 text-sm leading-6 text-slate-600' }, 'Edit images, refine video, and transform PDFs from one streamlined workspace.')
  );

  root.appendChild(createFeatureGrid(dashboardFeatures, (route) => router.navigate(route)));
  return root;
}