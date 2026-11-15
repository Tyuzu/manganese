import type {
  ClipTransition,
  TimelineClipSegment,
} from './types';
import { clampValue, cubicBezierValue } from './utils';
import { div, p, span } from '../../components/ui/dom';

export type TimelineState = {
  trimStart: number;
  trimEnd: number;
  duration: number;
  playbackRate: number;
  activeTransition: ClipTransition;
  currentTime: number;
  clipSegments: TimelineClipSegment[];
  playbackCurve: {
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    p3: { x: number; y: number };
  };
  videoElement: HTMLVideoElement;
};

export type TimelineRendererDeps = {
  state: TimelineState;
  toolContainer: HTMLElement;
  createSliderControl: (
    title: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
  ) => HTMLElement;
  createSelectDropdown: (
    options: string[],
    selected: string,
    onChange: (value: string) => void,
  ) => HTMLSelectElement;
  createPresetButton: (
    name: string,
    onClick: () => void,
  ) => HTMLButtonElement;
  setTrimStart: (value: number) => void;
  setTrimEnd: (value: number) => void;
  setActiveTransition: (value: ClipTransition) => void;
  setPlaybackCurve: (curve: TimelineState['playbackCurve']) => void;
  setPlaybackRate: (value: number) => void;
  getPlaybackRateAtTime: (t: number) => number;
  updatePlaybackRateFromCurve: () => void;
  renderToolControls: () => void;
  pushState: () => void;
  updateTrimMarkers: () => void;
  updateCaptions: () => void;
  applyVideoFilters: () => void;
  renderTimelineRows: () => void;
};

export function createTimelinePanel(deps: TimelineRendererDeps) {
  const {
    state,
    toolContainer,
    createSliderControl,
    createSelectDropdown,
    createPresetButton,
    setTrimStart,
    setTrimEnd,
    setActiveTransition,
    setPlaybackCurve,
    setPlaybackRate,
    getPlaybackRateAtTime,
    updatePlaybackRateFromCurve,
    renderToolControls,
    pushState,
    updateTrimMarkers,
  } = deps;

  function splitClipAtPlayhead() {
    if (!state.duration || state.currentTime <= 0 || state.currentTime >= state.duration) {
      return;
    }

    const currentSegment = state.clipSegments.find(
      (segment) => state.currentTime > segment.start && state.currentTime < segment.end,
    );

    if (!currentSegment) {
      return;
    }

    const left: TimelineClipSegment = {
      ...currentSegment,
      end: state.currentTime,
    };

    const right: TimelineClipSegment = {
      id: Date.now(),
      start: state.currentTime,
      end: currentSegment.end,
      label: `${currentSegment.label} B`,
    };

    state.clipSegments = [
      ...state.clipSegments.filter((segment) => segment.id !== currentSegment.id),
      left,
      right,
    ].sort((a, b) => a.start - b.start);

    pushState();
    renderToolControls();
  }

  function deleteCurrentClipSegment() {
    if (state.clipSegments.length <= 1) {
      return;
    }

    const targetIndex = state.clipSegments.findIndex(
      (segment) => state.currentTime >= segment.start && state.currentTime < segment.end,
    );

    if (targetIndex < 0) {
      return;
    }

    const removed = state.clipSegments[targetIndex];

    state.clipSegments = state.clipSegments.filter((segment) => segment.id !== removed.id);

    pushState();
    renderToolControls();
  }

  function renderPlaybackCurveEditor(): HTMLDivElement {
    const editor = div({
      className:
        've-mt-3 ve-rounded-xl ve-border ve-border-slate-700 ve-bg-slate-950/80 ve-p-2',
    });

    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 110;
    canvas.className = 've-w-full ve-rounded-lg ve-border ve-border-slate-800 ve-bg-slate-900';

    const redraw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const { p0, p1, p2, p3 } = state.playbackCurve;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;

      for (let index = 0; index <= 4; index += 1) {
        const x = (index / 4) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let index = 0; index <= 4; index += 1) {
        const y = (index / 4) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.beginPath();
      for (let index = 0; index <= 100; index += 1) {
        const t = index / 100;
        const x = cubicBezierValue(t, p0.x, p1.x, p2.x, p3.x) * width;
        const y = height - cubicBezierValue(t, p0.y, p1.y, p2.y, p3.y) * height;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.stroke();

      for (const point of [p1, p2]) {
        ctx.beginPath();
        ctx.arc(point.x * width, height - point.y * height, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = '#a78bfa';
        ctx.stroke();
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px sans-serif';
      ctx.fillText('0.25x', 6, height - 7);
      ctx.fillText('4x', width - 24, 12);
    };

    let activeHandle: 'p1' | 'p2' | null = null;

    canvas.onpointerdown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clampValue(1 - (event.clientY - rect.top) / rect.height, 0, 1);

      const handles = [
        { name: 'p1' as const, point: state.playbackCurve.p1 },
        { name: 'p2' as const, point: state.playbackCurve.p2 },
      ];

      let nearestDistance = 0.15;
      for (const handle of handles) {
        const distance = Math.hypot(handle.point.x - x, handle.point.y - y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          activeHandle = handle.name;
        }
      }

      if (activeHandle) {
        canvas.setPointerCapture(event.pointerId);
      }
    };

    canvas.onpointermove = (event: PointerEvent) => {
      if (!activeHandle) return;

      const rect = canvas.getBoundingClientRect();
      const x = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clampValue(1 - (event.clientY - rect.top) / rect.height, 0, 1);

      const nextCurve = { ...state.playbackCurve };
      if (activeHandle === 'p1') {
        nextCurve.p1 = { x, y };
      } else {
        nextCurve.p2 = { x, y };
      }

      state.playbackCurve = nextCurve;
      setPlaybackCurve(nextCurve);
      state.playbackRate = Number(getPlaybackRateAtTime(0.5).toFixed(2));
      setPlaybackRate(state.playbackRate);
      updatePlaybackRateFromCurve();
      redraw();
    };

    canvas.onpointerup = () => {
      if (!activeHandle) return;
      activeHandle = null;
      pushState();
      renderToolControls();
    };

    canvas.onpointercancel = () => {
      activeHandle = null;
    };

    redraw();
    editor.append(canvas);
    return editor;
  }

  function renderTimelineTab() {
    toolContainer.append(
      p(
        {
          className:
            've-text-xs ve-font-bold ve-text-slate-200 ve-uppercase ve-tracking-wider ve-mb-2',
        },
        'Timeline Trim & Speed',
      ),
      createSliderControl(
        'Start Marker (s)',
        state.trimStart,
        0,
        Math.max(1, state.duration),
        (value) => {
          const nextTrimStart = Math.max(
            0,
            Math.min(value, (state.trimEnd || state.duration) - 0.5),
          );
          state.trimStart = nextTrimStart;
          setTrimStart(nextTrimStart);
          updateTrimMarkers();

          if (state.videoElement.currentTime < state.trimStart) {
            state.videoElement.currentTime = state.trimStart;
          }
        },
      ),
      createSliderControl(
        'End Marker (s)',
        state.trimEnd || state.duration,
        0,
        Math.max(1, state.duration),
        (value) => {
          const nextTrimEnd = Math.min(
            state.duration || state.trimEnd,
            Math.max(value, state.trimStart + 0.5),
          );
          state.trimEnd = nextTrimEnd;
          setTrimEnd(nextTrimEnd);
          updateTrimMarkers();
        },
      ),
      p(
        { className: 've-mt-3 ve-text-xs ve-font-semibold ve-text-slate-300' },
        `Playback Speed: ${state.playbackRate.toFixed(2)}x`,
      ),
      renderPlaybackCurveEditor(),
      div(
        {
          className: 've-pt-2 ve-grid ve-grid-cols-2 ve-gap-2.5',
        },
        createPresetButton('Set Start Here', () => {
          const nextTrimStart = clampValue(state.videoElement.currentTime, 0, state.duration);
          const resolvedTrimStart = state.trimStart >= state.trimEnd
            ? Math.max(0, state.trimEnd - 0.5)
            : nextTrimStart;
          state.trimStart = resolvedTrimStart;
          setTrimStart(resolvedTrimStart);
          updateTrimMarkers();
          pushState();
          renderToolControls();
        }),
        createPresetButton('Set End Here', () => {
          const nextTrimEnd = clampValue(
            state.videoElement.currentTime,
            state.trimStart + 0.5,
            state.duration,
          );
          state.trimEnd = nextTrimEnd;
          setTrimEnd(nextTrimEnd);
          updateTrimMarkers();
          pushState();
          renderToolControls();
        }),
      ),
      div(
        {
          className: 've-pt-2 ve-grid ve-grid-cols-2 ve-gap-2.5',
        },
        createPresetButton('Split Clip', splitClipAtPlayhead),
        createPresetButton('Delete Segment', deleteCurrentClipSegment),
      ),
      div({ className: 've-pt-2' },
        div(
          {
            className: 've-flex ve-justify-between ve-items-center ve-text-xs',
          },
          span({ className: 've-text-slate-400' }, 'Transition'),
          createSelectDropdown(
            ['none', 'crossfade', 'dip-to-black', 'wipe', 'slide'],
            state.activeTransition,
            (value) => {
              const nextTransition = value as ClipTransition;
              state.activeTransition = nextTransition;
              setActiveTransition(nextTransition);
              pushState();
            },
          ),
        ),
      ),
      p(
        {
          className: 've-mt-2 ve-text-[10px] ve-text-slate-500 ve-leading-relaxed',
        },
        'Clip splitting currently stores timeline segment metadata. True multi-clip concatenation and ripple rendering require a multi-source export pipeline.',
      ),
    );
  }

  return {
    renderTimelineTab,
    renderPlaybackCurveEditor,
    splitClipAtPlayhead,
    deleteCurrentClipSegment,
  };
}
