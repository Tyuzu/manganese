import { button, div, input, span } from '../../components/ui/dom';

export function createTimelineWidgets({
  onScrubFromClientX,
}: {
  onScrubFromClientX: (clientX: number) => void;
}) {
  const playheadLine = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-w-0.5 ve-bg-white ve-z-30 ve-pointer-events-none shadow-md',
    style: 'left:0%',
  });

  const trimStartMarker = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-w-2.5 bg-violet-400 ve-border-r-2 ve-border-white ve-cursor-ew-resize ve-z-20 hover:bg-violet-300 ve-transition-colors ve-shadow-lg',
    style: 'left:0%',
  });

  const trimEndMarker = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-w-2.5 bg-violet-400 ve-border-l-2 ve-border-white ve-cursor-ew-resize ve-z-20 hover:bg-violet-300 ve-transition-colors ve-shadow-lg',
    style: 'left:100%',
  });

  const trimActiveZone = div({
    className:
      've-absolute ve-top-0 ve-bottom-0 ve-bg-violet-500/30 ve-border-t ve-border-b ve-border-violet-400/60 ve-pointer-events-none ve-z-10',
    style: 'left:0%;right:0%;',
  });

  const thumbnailStrip = div({
    className:
      've-absolute ve-inset-0 ve-flex ve-opacity-40 ve-pointer-events-none ve-overflow-hidden',
  });

  const videoTrackSegment = div(
    {
      className:
        've-relative ve-h-10 ve-rounded-lg ve-bg-slate-800/90 ve-border ve-border-slate-700 ve-flex ve-items-center ve-px-3 ve-text-xs ve-text-slate-300 ve-font-medium ve-overflow-hidden ve-shadow-inner ve-select-none',
    },
    thumbnailStrip,
    trimStartMarker,
    trimActiveZone,
    trimEndMarker,
    div(
      {
        className:
          've-truncate ve-relative ve-z-0 ve-text-slate-200 ve-text-[11px] ve-font-semibold ve-drop-shadow-md',
      },
      'Video Track ve-1 • Main Source Clip',
    ),
  );

  const audioTrackSegment = div(
    {
      className:
        've-relative ve-h-8 ve-rounded-lg ve-bg-cyan-950/50 ve-border ve-border-cyan-800/50 ve-flex ve-items-center ve-px-3 ve-text-xs ve-text-cyan-300 ve-font-medium ve-overflow-hidden ve-shadow-inner ve-select-none',
    },
    div(
      { className: 've-truncate ve-text-[11px]' },
      'Audio Track ve-1 • Source Audio',
    ),
  );

  const timelineRuler = div(
    {
      className:
        've-h-6 ve-border-b ve-border-slate-800/80 ve-bg-slate-950 ve-flex ve-items-center ve-justify-between ve-gap-2 ve-px-3 ve-text-[10px] ve-font-mono ve-text-slate-500 ve-select-none ve-sm:px-4',
    },
    div({}, '00:00'),
    div({}, '00:15'),
    div({}, '00:30'),
    div({}, '00:45'),
    div({}, '01:00'),
  );

  const timelineTrackArea = div({
    className:
      've-relative ve-flex-1 ve-p-3 ve-space-y-2 ve-overflow-y-auto ve-cursor-pointer ve-bg-slate-900/50',
    onmousedown: (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('.no-timeline-scrub')) return;
      onScrubFromClientX(event.clientX);
    },
  });

  timelineTrackArea.append(
    playheadLine,
    videoTrackSegment,
    audioTrackSegment,
  );

  return {
    playheadLine,
    trimStartMarker,
    trimEndMarker,
    trimActiveZone,
    thumbnailStrip,
    videoTrackSegment,
    audioTrackSegment,
    timelineRuler,
    timelineTrackArea,
  };
}

export function createPlaybackControls({
  onTogglePlay,
  onStepFrames,
  onSeek,
  onVolumeChange,
  getVolume,
}: {
  onTogglePlay: () => void;
  onStepFrames: (delta: number) => void;
  onSeek: (value: number) => void;
  onVolumeChange: (value: number) => void;
  getVolume: () => number;
}) {
  const timeDisplay = div(
    {
      className:
        've-min-w-0 ve-flex-shrink-0 ve-font-mono ve-text-[11px] ve-text-slate-300 ve-text-center ve-sm:min-w-[95px]',
    },
    '00:00 / 00:00',
  );

  const playPauseBtn = button(
    {
      type: 'button',
      className:
        've-inline-flex ve-h-9 ve-w-9 ve-items-center ve-justify-center ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-800/80 text-base ve-font-bold ve-text-white ve-transition ve-hover:border-violet-500 ve-hover:text-violet-300 ve-focus:outline-none ve-focus:ring-2 ve-focus:ring-violet-500/60',
      title: 'Play playback',
      onclick: onTogglePlay,
    },
    '▶',
  );

  const stepBackwardBtn = button(
    {
      type: 'button',
      className:
        've-text-slate-400 ve-hover:text-white ve-text-xs ve-px-1.5 ve-py-1',
      title: 'Step backward one frame',
      onclick: () => onStepFrames(-1),
    },
    '⏮',
  );

  const stepForwardBtn = button(
    {
      type: 'button',
      className:
        've-text-slate-400 ve-hover:text-white ve-text-xs ve-px-1.5 ve-py-1',
      title: 'Step forward one frame',
      onclick: () => onStepFrames(1),
    },
    '⏭',
  );

  const seekSlider = input({
    type: 'range',
    min: '0',
    max: '100',
    value: '0',
    step: '0.1',
    className:
      've-h-1.5 ve-w-full ve-flex-1 ve-bg-slate-800 ve-rounded-lg ve-appearance-none ve-cursor-pointer ve-accent-violet-500',
    oninput: (event: Event) => {
      const target = event.target as HTMLInputElement;
      onSeek(Number(target.value));
    },
  });

  const volumeSlider = input({
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: String(getVolume()),
    className:
      've-h-1.5 ve-w-16 ve-bg-slate-800 ve-rounded-lg ve-appearance-none ve-cursor-pointer ve-accent-violet-500',
    oninput: (event: Event) => {
      const value = Number((event.target as HTMLInputElement).value);
      onVolumeChange(value);
    },
  });

  const playerHud = div(
    {
      className:
        've-flex ve-flex-col ve-gap-2 ve-rounded-xl ve-border ve-border-slate-700/50 ve-bg-slate-900/90 ve-p-3 ve-backdrop-blur-md ve-z-10 ve-sm:min-h-[56px] ve-sm:flex-row ve-sm:items-center ve-sm:gap-3 ve-sm:px-5',
    },
    div(
      {
        className: 've-flex ve-items-center ve-gap-2',
      },
      stepBackwardBtn,
      playPauseBtn,
      stepForwardBtn,
      timeDisplay,
    ),
    seekSlider,
    div(
      {
        className:
          've-flex ve-items-center ve-gap-2 ve-text-xs ve-text-slate-400 ve-sm:ml-2',
      },
      span(
        {
          className:
            've-inline-flex ve-h-7 ve-w-7 ve-items-center ve-justify-center ve-rounded-lg ve-bg-slate-800/90 ve-text-sm',
        },
        '🔊',
      ),
      volumeSlider,
    ),
  );

  return {
    timeDisplay,
    playPauseBtn,
    stepBackwardBtn,
    stepForwardBtn,
    seekSlider,
    volumeSlider,
    playerHud,
  };
}
