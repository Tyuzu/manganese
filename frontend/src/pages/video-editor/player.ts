import { button, div, input, span } from '../../components/ui/dom';

export function createTimelineWidgets({
  onScrubFromClientX,
}: {
  onScrubFromClientX: (clientX: number) => void;
}) {
  const playheadLine = div({
    className: 'timeline-playhead',
    style: 'left:0%',
  });

  const trimStartMarker = div({
    className: 'timeline-trim-marker trim-start',
    style: 'left:0%',
  });

  const trimEndMarker = div({
    className: 'timeline-trim-marker trim-end',
    style: 'left:100%',
  });

  const trimActiveZone = div({
    className: 'timeline-trim-active-zone',
    style: 'left:0%;right:0%;',
  });

  const thumbnailStrip = div({
    className: 'timeline-thumbnail-strip',
  });

  const videoTrackSegment = div(
    {
      className: 'video-track-segment',
    },
    thumbnailStrip,
    trimStartMarker,
    trimActiveZone,
    trimEndMarker,
    div(
      {
        className: 'video-track-title',
      },
      'Video Track • Main Source Clip',
    ),
  );

  const audioTrackSegment = div(
    {
      className: 'audio-track-segment',
    },
    div(
      { className: 'audio-track-title' },
      'Audio Track • Source Audio',
    ),
  );

  const timelineRuler = div(
    {
      className: 'timeline-ruler',
    },
    div({}, '00:00'),
    div({}, '00:15'),
    div({}, '00:30'),
    div({}, '00:45'),
    div({}, '01:00'),
  );

  const timelineTrackArea = div({
    className: 'timeline-track-area',
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
      className: 'playback-time-display',
    },
    '00:00 / 00:00',
  );

  const playPauseBtn = button(
    {
      type: 'button',
      className: 'playback-play-btn',
      title: 'Play playback',
      onclick: onTogglePlay,
    },
    '▶',
  );

  const stepBackwardBtn = button(
    {
      type: 'button',
      className: 'playback-step-btn',
      title: 'Step backward one frame',
      onclick: () => onStepFrames(-1),
    },
    '⏮',
  );

  const stepForwardBtn = button(
    {
      type: 'button',
      className: 'playback-step-btn',
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
    className: 'playback-seek-slider',
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
    className: 'playback-volume-slider',
    oninput: (event: Event) => {
      const value = Number((event.target as HTMLInputElement).value);
      onVolumeChange(value);
    },
  });

  const playerHud = div(
    {
      className: 'player-hud',
    },
    div(
      {
        className: 'playback-controls-group',
      },
      stepBackwardBtn,
      playPauseBtn,
      stepForwardBtn,
      timeDisplay,
    ),
    seekSlider,
    div(
      {
        className: 'playback-volume-group',
      },
      span(
        {
          className: 'playback-speaker-icon',
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