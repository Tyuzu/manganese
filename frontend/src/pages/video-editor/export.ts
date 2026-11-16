import type { BlendMode, ClipTransition, VideoEditorState } from './types';

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

  const progressLabel = document.createElement('p');
  progressLabel.className = 'export-progress-label';
  progressLabel.textContent = isRendering
    ? `Rendering Video... ${Math.round(renderProgress)}%`
    : 'Ready to render';

  const progressFill = document.createElement('div');
  progressFill.className = 'export-progress-fill';
  progressFill.style.width = `${renderProgress}%`;

  const progressBarTrack = document.createElement('div');
  progressBarTrack.className = 'export-progress-track';
  progressBarTrack.append(progressFill);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'export-cancel-btn';
  cancelBtn.textContent = 'Cancel Rendering';
  cancelBtn.onclick = cancelVideoExport;

  const progressContainer = document.createElement('div');
  progressContainer.className = `export-progress-container ${isRendering ? '' : 'export-hidden'}`;
  progressContainer.append(progressLabel, progressBarTrack, cancelBtn);

  const exportSettings = document.createElement('div');
  exportSettings.className = 'export-settings-box';

  function createSettingRow(labelText: string, controlElement: HTMLElement) {
    const row = document.createElement('div');
    row.className = 'export-setting-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'export-setting-label';
    labelSpan.textContent = labelText;

    row.append(labelSpan, controlElement);
    return row;
  }

  const resSelect = createSelectDropdown(
    ['720p', '1080p', '4k'],
    exportResolution,
    (value) => {
      setExportResolution(value as '720p' | '1080p' | '4k');
      pushState();
    },
  );

  const fpsSelect = createSelectDropdown(
    ['24', '30', '60'],
    String(exportFps),
    (value) => {
      setExportFps(Number(value) as 24 | 30 | 60);
      pushState();
    },
  );

  const formatSelect = createSelectDropdown(
    ['webm', 'mp4'],
    exportFormat,
    (value) => {
      setExportFormat(value as 'webm' | 'mp4');
      pushState();
    },
  );

  const qualityPresetSelect = createSelectDropdown(
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
  );

  const transitionSelect = createSelectDropdown(
    ['none', 'crossfade', 'dip-to-black', 'wipe', 'slide'],
    activeTransition,
    (value) => {
      setActiveTransition(value as ClipTransition);
      pushState();
    },
  );

  const blendModeSelect = createSelectDropdown(
    ['normal', 'screen', 'multiply', 'overlay', 'soft-light'],
    activeBlendMode,
    (value) => {
      setActiveBlendMode(value as BlendMode);
      pushState();
    },
  );

  const trimLengthSpan = document.createElement('span');
  trimLengthSpan.className = 'export-trim-value';
  trimLengthSpan.textContent = `${Math.max(0, (trimEnd || duration) - trimStart).toFixed(1)}s`;

  const trimRow = document.createElement('div');
  trimRow.className = 'export-setting-row export-trim-row';
  const trimLabel = document.createElement('span');
  trimLabel.className = 'export-setting-label';
  trimLabel.textContent = 'Trim Length';
  trimRow.append(trimLabel, trimLengthSpan);

  exportSettings.append(
    createSettingRow('Resolution', resSelect),
    createSettingRow('Framerate', fpsSelect),
    createSettingRow('Container', formatSelect),
    createSettingRow('Quality Preset', qualityPresetSelect),
    createSettingRow('Transition', transitionSelect),
    createSettingRow('Blend Mode', blendModeSelect),
    trimRow,
  );

  const engineTitle = document.createElement('p');
  engineTitle.className = 'export-section-title';
  engineTitle.textContent = 'Export Engine';

  const jsonGrid = document.createElement('div');
  jsonGrid.className = 'export-json-grid';
  jsonGrid.append(
    createPresetButton('Export JSON', exportProjectFile),
    createPresetButton('Import JSON', async () => {
      await importProjectFile();
    }),
  );

  const startRenderBtn = document.createElement('button');
  startRenderBtn.type = 'button';
  startRenderBtn.className = 'export-start-btn';
  startRenderBtn.textContent = 'Start Render Pipeline';
  startRenderBtn.onclick = startVideoExport;

  const noticeP = document.createElement('p');
  noticeP.className = 'export-notice-text';
  noticeP.textContent =
    'Browser rendering uses supported MediaRecorder codecs. MP4 is only offered when the browser genuinely supports MP4 recording. Server rendering can use FFmpeg for broader codec support.';

  const summaryTitle = document.createElement('p');
  summaryTitle.className = 'export-section-title export-summary-title';
  summaryTitle.textContent = 'Project Summary';

  const aspectRow = document.createElement('div');
  aspectRow.className = 'export-summary-row';
  const aspectLabel = document.createElement('span');
  aspectLabel.className = 'export-setting-label';
  aspectLabel.textContent = 'Aspect Ratio';
  const aspectVal = document.createElement('span');
  aspectVal.className = 'export-summary-val';
  aspectVal.textContent = aspectRatio;
  aspectRow.append(aspectLabel, aspectVal);

  const activeRegionRow = document.createElement('div');
  activeRegionRow.className = 'export-summary-row';
  const activeRegionLabel = document.createElement('span');
  activeRegionLabel.className = 'export-setting-label';
  activeRegionLabel.textContent = 'Active Region';
  const activeRegionVal = document.createElement('span');
  activeRegionVal.className = 'export-summary-val';
  activeRegionVal.textContent = duration
    ? `${trimStart.toFixed(1)}s – ${trimEnd.toFixed(1)}s`
    : '—';
  activeRegionRow.append(activeRegionLabel, activeRegionVal);

  const summaryContainer = document.createElement('div');
  summaryContainer.className = 'export-summary-box';
  summaryContainer.append(aspectRow, activeRegionRow);

  const summarySection = document.createElement('div');
  summarySection.className = 'export-summary-section';
  summarySection.append(summaryTitle, summaryContainer);

  toolContainer.append(
    engineTitle,
    exportSettings,
    jsonGrid,
    progressContainer,
    !isRendering ? startRenderBtn : document.createElement('div'),
    noticeP,
    summarySection,
  );

  return {
    progressLabel,
    progressFill,
    progressContainer,
    exportSettings,
  };
}