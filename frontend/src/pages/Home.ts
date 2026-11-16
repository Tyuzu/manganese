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
      className: 'fluent-metric-card',
    },
    div(
      { className: 'fluent-metric-header' },
      p({ className: 'fluent-metric-label' }, label),
      badge
        ? span(
            {
              className: 'fluent-metric-badge',
            },
            badge
          )
        : null
    ),
    p({ className: 'fluent-metric-value' }, value)
  );
}

export function createHomePage(): HTMLElement {
  // --- HEADER SECTION (Fluent Hub Header) ---
  const headerSection = div(
    { className: 'fluent-header-section' },
    div(
      { className: 'fluent-header-copy' },
      div(
        { className: 'fluent-kicker' },
        span({ className: 'fluent-status-dot' }),
        'FLUENT STUDIO WORKSPACE'
      ),
      h1(
        { className: 'fluent-title' },
        'Creative Command Center'
      ),
      p(
        { className: 'fluent-subtitle' },
        'Manage media pipelines, edit assets, and convert documents in one unified Fluent environment.'
      )
    ),
    div(
      { className: 'fluent-header-actions' },
      button(
        {
          className: 'fluent-primary-button',
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
    { className: 'fluent-metric-row' },
    ...STUDIO_METRICS.map(createFluentMetricCard)
  );

  // --- TOOLBAR / WORKSPACE SELECTOR SECTION ---
  const toolbarSection = div(
    {
      className: 'fluent-toolbar-section',
    },
    createMediaProcessingModeSelector({
      label: 'Workspace Pipeline & Engine Settings',
      className: 'fluent-toolbar-control',
    })
  );

  // --- FEATURE GRID SECTION ---
  const launchpadHeader = div(
    { className: 'fluent-launchpad-header' },
    h2({ className: 'fluent-section-title' }, 'Available Workspaces'),
    span({ className: 'fluent-section-meta' }, '4 Active Modules')
  );

  const featureGridSection = div(
    { className: 'fluent-feature-section' },
    launchpadHeader,
    createFeatureGrid(DASHBOARD_FEATURES, (route) => router.navigate(route), 'fluent-feature-grid')
  );

  // --- ROOT FLUENT CONTAINER ---
  return div(
    {
      className: cn(uiClasses.card, 'fluent-page-shell'),
    },
    headerSection,
    metricsSection,
    toolbarSection,
    featureGridSection
  );
}