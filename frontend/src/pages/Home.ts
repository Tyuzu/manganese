import { cn, div, h1, h2, p, span, button, uiClasses } from '../components/ui/dom';
import { createFeatureGrid, createMediaProcessingModeSelector } from './shared';
import { router } from '../main';

interface DashboardFeature {
  title: string;
  description: string;
  route: string;
  action: string;
}

interface StudioMetric {
  label: string;
  value: string;
  badge?: string;
}

const DASHBOARD_FEATURES: DashboardFeature[] = [
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

const STUDIO_METRICS: StudioMetric[] = [
  { label: 'Active Projects', value: '24', badge: '+3 this week' },
  { label: 'Total Exports', value: '9.4k', badge: '99.8% success' },
  { label: 'Avg. Turnaround', value: '4.8m', badge: '-18% faster' },
];

function createFluentMetricCard({ label, value, badge }: StudioMetric): HTMLElement {
  return div(
    {
      className:
        'flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-900/90 p-4 transition-colors hover:border-slate-700',
    },
    div(
      { className: 'flex items-center justify-between' },
      p({ className: 'm-0 text-xs font-semibold uppercase tracking-wider text-slate-400' }, label),
      badge
        ? span(
            {
              className:
                'rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400',
            },
            badge
          )
        : null
    ),
    p({ className: 'm-0 mt-3 text-2xl font-semibold tracking-tight text-white' }, value)
  );
}

export function createHomePage(): HTMLElement {
  // --- HEADER SECTION (Fluent Hub Header) ---
  const headerSection = div(
    { className: 'flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between' },
    div(
      {},
      div(
        { className: 'mb-2 inline-flex items-center gap-2 font-mono text-xs font-semibold text-sky-400' },
        span({ className: 'h-2 w-2 rounded-full bg-sky-500' }),
        'FLUENT STUDIO WORKSPACE'
      ),
      h1(
        { className: 'm-0 text-2xl font-semibold tracking-tight text-white sm:text-3xl' },
        'Creative Command Center'
      ),
      p(
        { className: 'm-0 mt-1 text-sm text-slate-400' },
        'Manage media pipelines, edit assets, and convert documents in one unified Fluent environment.'
      )
    ),
    div(
      { className: 'flex items-center gap-3' },
      button(
        {
          className:
            'inline-flex items-center gap-2 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-950',
          events: {
            click: () => router.navigate('/images'),
          },
        },
        'New Session'
      )
    )
  );

  // --- TELEMETRY / METRICS ROW ---
  const metricsSection = div(
    { className: 'mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3' },
    ...STUDIO_METRICS.map(createFluentMetricCard)
  );

  // --- TOOLBAR / WORKSPACE SELECTOR SECTION ---
  const toolbarSection = div(
    {
      className: 'mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-4',
    },
    createMediaProcessingModeSelector({
      label: 'Workspace Pipeline & Engine Settings',
      className: 'w-full',
    })
  );

  // --- FEATURE GRID SECTION ---
  const launchpadHeader = div(
    { className: 'mb-4 flex items-center justify-between' },
    h2({ className: 'm-0 text-base font-semibold tracking-tight text-white' }, 'Available Workspaces'),
    span({ className: 'font-mono text-xs text-slate-400' }, '4 Active Modules')
  );

  const featureGridSection = div(
    { className: 'mt-8' },
    launchpadHeader,
    createFeatureGrid(DASHBOARD_FEATURES, (route) => router.navigate(route))
  );

  // --- ROOT FLUENT CONTAINER ---
  return div(
    {
      className: cn(
        uiClasses.card,
        'mx-auto max-w-6xl rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-xl sm:p-8'
      ),
    },
    headerSection,
    metricsSection,
    toolbarSection,
    featureGridSection
  );
}