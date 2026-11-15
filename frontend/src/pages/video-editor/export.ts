import type { BlendMode, ClipTransition, VideoEditorState } from './types';
import { createButton, div, p, span } from '../../components/ui/dom';

export type ExportRendererDeps = {
  toolContainer: HTMLElement;
  renderProgress: number;
  isRendering: boolean;
  trimStart: number;
  trimEnd: number;
  duration: number;
  exportResolution: '720p' | '1080p' | '4k';
  exportFps: 24 | 30 | 60;
  exportFormat: 'webm' | 'mp4';
  exportBitrate: number;
  activeTransition: ClipTransition;
  activeBlendMode: BlendMode;
  renderProgressLabel: HTMLElement | null;
  renderProgressFill: HTMLElement | null;
  renderToolControls: () => void;
  setExportResolution: (value: '720p' | '1080p' | '4k') => void;
  setExportFps: (value: 24 | 30 | 60) => void;
  setExportFormat: (value: 'webm' | 'mp4') => void;
  setExportBitrate: (value: number) => void;
  setActiveTransition: (value: ClipTransition) => void;
  setActiveBlendMode: (value: BlendMode) => void;
  createSelectDropdown: (
    options: string[],
    selected: string,
    onChange: (value: string) => void,
  ) => HTMLSelectElement;
  createPresetButton: (
    name: string,
    onClick: () => void,
  ) => HTMLButtonElement;
  pushState: () => void;
  startVideoExport: () => Promise<void> | void;
  cancelVideoExport: () => void;
  exportProjectFile: () => void;
  importProjectFile: () => Promise<void>;
  aspectRatio: VideoEditorState['aspectRatio'];
};

export function createExportPanel(deps: ExportRendererDeps) {
  const {
    toolContainer,
    renderProgress,
    isRendering,
    trimStart,
    trimEnd,
    duration,
    exportResolution,
    exportFps,
    exportFormat,
    exportBitrate,
    activeTransition,
    activeBlendMode,
    setExportResolution,
    setExportFps,
    setExportFormat,
    setExportBitrate,
    setActiveTransition,
    setActiveBlendMode,
    createSelectDropdown,
    createPresetButton,
    pushState,
    startVideoExport,
    cancelVideoExport,
    exportProjectFile,
    importProjectFile,
    aspectRatio,
  } = deps;

  const progressLabel = p(
    {
      className: 've-text-xs ve-text-violet-300 ve-font-semibold',
    },
    isRendering ? `Rendering Video... ${Math.round(renderProgress)}%` : 'Ready to render',
  );

  const progressFill = div({
    className: 've-bg-violet-500 ve-h-full ve-transition-all',
    style: `width:${renderProgress}%`,
  });

  const progressContainer = div(
    {
      className: `space-y-2 text-center ${isRendering ? '' : 've-hidden'}`,
    },
    progressLabel,
    div(
      {
        className: 've-w-full ve-bg-slate-800 ve-h-2 ve-rounded-full ve-overflow-hidden',
      },
      progressFill,
    ),
    createButton(
      'secondary',
      {
        type: 'button',
        className:
          've-w-full ve-text-xs ve-py-2 ve-bg-red-600/80 ve-hover:bg-red-600 ve-text-white ve-font-semibold ve-rounded-xl',
        onclick: cancelVideoExport,
      },
      'Cancel Rendering',
    ),
  );

  const exportSettings = div(
    {
      className:
        've-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-900/80 ve-p-3 ve-text-xs ve-space-y-2.5',
    },
    div(
      {
        className: 've-flex ve-justify-between ve-items-center',
      },
      span({ className: 've-text-slate-400' }, 'Resolution'),
      createSelectDropdown(
        ['720p', '1080p', '4k'],
        exportResolution,
        (value) => {
          setExportResolution(value as '720p' | '1080p' | '4k');
          pushState();
        },
      ),
    ),
    div(
      {
        className: 've-flex ve-justify-between ve-items-center',
      },
      span({ className: 've-text-slate-400' }, 'Framerate'),
      createSelectDropdown(
        ['24', '30', '60'],
        String(exportFps),
        (value) => {
          setExportFps(Number(value) as 24 | 30 | 60);
          pushState();
        },
      ),
    ),
    div(
      {
        className: 've-flex ve-justify-between ve-items-center',
      },
      span({ className: 've-text-slate-400' }, 'Container'),
      createSelectDropdown(
        ['webm', 'mp4'],
        exportFormat,
        (value) => {
          setExportFormat(value as 'webm' | 'mp4');
          pushState();
        },
      ),
    ),
    div(
      {
        className: 've-flex ve-justify-between ve-items-center',
      },
      span({ className: 've-text-slate-400' }, 'Quality Preset'),
      createSelectDropdown(
        ['Economy (2 Mbps)', 'Balanced (5 Mbps)', 'High (10 Mbps)'],
        exportBitrate === 2_000_000
          ? 'Economy (2 Mbps)'
          : exportBitrate === 10_000_000
            ? 'High (10 Mbps)'
            : 'Balanced (5 Mbps)',
        (value) => {
          if (value.includes('Economy')) {
            setExportBitrate(2_000_000);
          } else if (value.includes('High')) {
            setExportBitrate(10_000_000);
          } else {
            setExportBitrate(5_000_000);
          }
          pushState();
        },
      ),
    ),
    div(
      {
        className: 've-flex ve-justify-between ve-items-center',
      },
      span({ className: 've-text-slate-400' }, 'Transition'),
      createSelectDropdown(
        ['none', 'crossfade', 'dip-to-black', 'wipe', 'slide'],
        activeTransition,
        (value) => {
          setActiveTransition(value as ClipTransition);
          pushState();
        },
      ),
    ),
    div(
      {
        className: 've-flex ve-justify-between ve-items-center',
      },
      span({ className: 've-text-slate-400' }, 'Blend Mode'),
      createSelectDropdown(
        ['normal', 'screen', 'multiply', 'overlay', 'soft-light'],
        activeBlendMode,
        (value) => {
          setActiveBlendMode(value as BlendMode);
          pushState();
        },
      ),
    ),
    div(
      {
        className: 've-flex ve-justify-between ve-pt-1 ve-border-t ve-border-slate-800',
      },
      span({ className: 've-text-slate-400' }, 'Trim Length'),
      span(
        { className: 've-font-semibold ve-text-violet-300' },
        `${Math.max(0, (trimEnd || duration) - trimStart).toFixed(1)}s`,
      ),
    ),
  );

  toolContainer.append(
    p(
      {
        className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
      },
      'Export Engine',
    ),
    exportSettings,
    div(
      {
        className: 've-grid ve-grid-cols-2 ve-gap-2 ve-pt-3',
      },
      createPresetButton('Export JSON', exportProjectFile),
      createPresetButton('Import JSON', async () => {
        await importProjectFile();
      }),
    ),
    progressContainer,
    !isRendering
      ? createButton(
          'primary',
          {
            type: 'button',
            className:
              've-w-full ve-text-xs ve-py-2.5 ve-bg-violet-600 ve-hover:bg-violet-500 ve-text-white ve-font-semibold ve-rounded-xl ve-transition-all ve-shadow-lg ve-shadow-violet-600/20',
            onclick: startVideoExport,
          },
          'Start Render Pipeline',
        )
      : div({ className: 've-hidden' }),
    p(
      {
        className: 've-text-[10px] ve-text-slate-500 ve-leading-relaxed ve-mt-2',
      },
      'Browser rendering uses supported MediaRecorder codecs. MP4 is only offered when the browser genuinely supports MP4 recording. Server rendering can use FFmpeg for broader codec support.',
    ),
    div(
      {
        className: 've-mt-6 ve-border-t ve-border-slate-700/60 ve-pt-4',
      },
      p(
        {
          className: 've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
        },
        'Project Summary',
      ),
      div({ className: 've-space-y-2 ve-text-[11px] ve-text-slate-300' },
        div({ className: 've-flex ve-justify-between' },
          span({ className: 've-text-slate-400' }, 'Aspect Ratio'),
          span({ className: 've-font-medium ve-text-slate-100' }, aspectRatio),
        ),
        div({ className: 've-flex ve-justify-between' },
          span({ className: 've-text-slate-400' }, 'Active Region'),
          span({ className: 've-font-medium ve-text-slate-100' }, duration ? `${trimStart.toFixed(1)}s – ${trimEnd.toFixed(1)}s` : '—'),
        ),
      ),
    ),
  );

  return {
    progressLabel,
    progressFill,
    progressContainer,
    exportSettings,
  };
}
