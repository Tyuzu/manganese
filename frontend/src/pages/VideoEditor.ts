import { button, createButton, div, input, label, p, span, svgElement } from '../components/ui/dom';
import { createDetailPanel, createEditorFooter, createEditorTitleRow } from './shared';

type VideoTab = 'timeline' | 'filters' | 'transform' | 'audio' | 'captions' | 'export';
type ClipTransition = 'none' | 'crossfade' | 'dip-to-black' | 'wipe' | 'slide';
type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'soft-light';
type MaskType = 'circle' | 'rect' | 'freehand';

interface TimedCaption {
  id: number;
  start: number;
  end: number;
  text: string;
  style: {
    size: number;
    weight: string;
    background: string;
    shadow: boolean;
    x: number;
    y: number;
  };
}

interface TimelineClipSegment {
  id: number;
  start: number;
  end: number;
  label: string;
}

interface MaskItem {
  id: number;
  type: MaskType;
  points: Array<{ x: number; y: number }>;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  feather: number;
  opacity: number;
  blur: number;
  color: string;
}

interface PlaybackCurve {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

interface VideoEditorState {
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  previewQuality: '1' | '0.5' | '0.25';
  captionText: string;
  captionSegments: TimedCaption[];
  transitionType: ClipTransition;
  clipSegments: TimelineClipSegment[];
  blendMode: BlendMode;
  masks: MaskItem[];
  playbackCurve: PlaybackCurve;
  cubeLut: { size: number; values: number[] } | null;
  captionSize: number;
  captionWeight: string;
  captionBg: string;
  captionShadow: boolean;
  captionX: number;
  captionY: number;
  filters: {
    exposure: number;
    brightness: number;
    contrast: number;
    saturate: number;
    temperature: number;
    tint: number;
    highlights: number;
    shadows: number;
    blur: number;
    sharpen: number;
    grayscale: number;
    sepia: number;
    vignette: number;
    filmGrain: number;
    fade: number;
  };
}

export async function createVideoEditorPage(): Promise<HTMLElement> {
  // State Management
  let videoFile: File | null = null;
  let videoUrl: string | null = null;
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;
  let activeTab: VideoTab = 'timeline';

  // Clip Edit & Canvas State
  let trimStart = 0;
  let trimEnd = 0;
  let playbackRate = 1;
  let aspectRatio: '16:9' | '9:16' | '1:1' | '4:5' = '16:9';
  let rotation = 0;
  let flipH = false;
  let flipV = false;
  let previewQuality: '1' | '0.5' | '0.25' = '1';

  // Caption State
  let captionText = '';
  let captionSegments: TimedCaption[] = [];
  let captionSize = 20;
  let captionWeight = '700';
  let captionBg = 'rgba(0,0,0,0.6)';
  let captionShadow = true;
  let captionX = 50; // percentage
  let captionY = 85; // percentage
  let activeTransition: ClipTransition = 'crossfade';
  let clipSegments: TimelineClipSegment[] = [];
  let activeBlendMode: BlendMode = 'screen';
  let masks: MaskItem[] = [];
  let playbackCurve: PlaybackCurve = {
    p0: { x: 0, y: 0 },
    p1: { x: 0.2, y: 1 },
    p2: { x: 0.8, y: 1 },
    p3: { x: 1, y: 0 },
  };
  let activeMaskTool: MaskType = 'rect';
  let pendingMask: MaskItem | null = null;
  let cubeLut: { size: number; values: number[] } | null = null;

  // Export State
  let exportResolution: '720p' | '1080p' | '4k' = '1080p';
  let exportFps: 24 | 30 | 60 = 30;
  let exportFormat: 'webm' | 'mp4' = 'webm';
  let exportBitrate = 5000000;
  let isRendering = false;
  let renderProgress = 0;
  let mediaRecorder: MediaRecorder | null = null;
  let renderChunks: Blob[] = [];

  const filters = {
    exposure: 100,
    brightness: 100,
    contrast: 100,
    saturate: 100,
    temperature: 0,
    tint: 0,
    highlights: 100,
    shadows: 100,
    blur: 0,
    sharpen: 0,
    grayscale: 0,
    sepia: 0,
    vignette: 0,
    filmGrain: 0,
    fade: 0,
  };

  const viewportZoom = {
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    velocityX: 0,
    velocityY: 0,
  };

  let interactionModeEnabled = false;

  function setInteractionMode(enabled: boolean) {
    interactionModeEnabled = enabled;
    interactionToggleButton.textContent = enabled ? 'Preview Controls: ON' : 'Preview Controls: OFF';
    interactionToggleButton.className = enabled
      ? 'rounded-xl border border-violet-500/70 bg-violet-600/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-100 transition hover:bg-violet-500/20'
      : 'rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300 transition hover:border-slate-500 hover:text-white';
    if (!enabled) {
      viewportZoom.isDragging = false;
    }
  }

  // Undo / Redo History Stack
  let history: VideoEditorState[] = [];
  let historyIndex = -1;
  const projectStoreName = 'video-editor-state';
  let projectDb: IDBDatabase | null = null;

  function openProjectDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }

      const request = window.indexedDB.open('dolomite-video-editor', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(projectStoreName)) {
          db.createObjectStore(projectStoreName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open project database'));
    });
  }

  async function persistProjectState() {
    if (!('indexedDB' in window)) return;

    try {
      const db = projectDb ?? (await openProjectDatabase());
      projectDb = db;

      const videoDataUrl = videoFile
        ? await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(videoFile as File);
          })
        : null;

      const payload = {
        id: 'current-project',
        videoDataUrl,
        fileName: videoFile?.name ?? null,
        fileType: videoFile?.type ?? null,
        savedAt: Date.now(),
        state: {
          trimStart,
          trimEnd,
          playbackRate,
          volume,
          aspectRatio,
          rotation,
          flipH,
          flipV,
          previewQuality,
          captionText,
          captionSegments: captionSegments.map((segment) => ({ ...segment, style: { ...segment.style } })),
          transitionType: activeTransition,
          clipSegments: clipSegments.map((segment) => ({ ...segment })),
          captionSize,
          captionWeight,
          captionBg,
          captionShadow,
          captionX,
          captionY,
          filters: { ...filters },
        },
      };

      const tx = db.transaction(projectStoreName, 'readwrite');
      tx.objectStore(projectStoreName).put(payload);
    } catch (error) {
      console.warn('Unable to save editor state:', error);
    }
  }

  async function hydrateProjectState() {
    if (!('indexedDB' in window)) return;

    try {
      const db = projectDb ?? (await openProjectDatabase());
      projectDb = db;
      const tx = db.transaction(projectStoreName, 'readonly');
      const request = tx.objectStore(projectStoreName).get('current-project');

      request.onsuccess = () => {
        const entry = request.result as { videoDataUrl?: string; state?: Partial<VideoEditorState> } | undefined;
        if (!entry?.state) return;

        const savedState = entry.state as VideoEditorState;
        if (entry.videoDataUrl) {
          videoUrl = entry.videoDataUrl;
          videoElement.src = entry.videoDataUrl;
          videoElement.onloadedmetadata = () => {
            duration = videoElement.duration;
            trimStart = 0;
            trimEnd = duration;
            clipSegments = [{ id: 1, start: 0, end: duration, label: 'Main Clip' }];
            restoreState(savedState);
            updateTrimMarkers();
            renderToolControls();
          };
          return;
        }

        restoreState(savedState);
      };
    } catch (error) {
      console.warn('Unable to restore editor state:', error);
    }
  }

  function cubicBezierValue(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const kT = clampValue(t, 0, 1);
    const u = 1 - kT;
    const tt = kT * kT;
    const uu = u * u;
    return (uu * u * p0) + (3 * uu * kT * p1) + (3 * u * tt * p2) + (tt * kT * p3);
  }

  function getPlaybackRateAtTime(t: number): number {
    const safeT = clampValue(t, 0, 1);
    const y = cubicBezierValue(safeT, playbackCurve.p0.y, playbackCurve.p1.y, playbackCurve.p2.y, playbackCurve.p3.y);
    return 0.25 + y * 3.75;
  }

  function updatePlaybackRateFromCurve() {
    const totalWindow = Math.max(0.01, (trimEnd || duration || 1) - trimStart);
    const normalized = videoElement.duration
      ? clampValue((videoElement.currentTime - trimStart) / totalWindow, 0, 1)
      : 0;
    playbackRate = Number(getPlaybackRateAtTime(normalized).toFixed(2));
    if (videoElement.duration) {
      videoElement.playbackRate = getPlaybackRateAtTime(normalized);
    }
  }

  function parseCubeLut(rawText: string): { size: number; values: number[] } | null {
    const cleaned = rawText.replace(/\r/g, '').split(/\n+/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    let size: number | null = null;
    const values: number[] = [];

    for (const line of cleaned) {
      if (line.startsWith('LUT_3D_SIZE')) {
        const match = line.match(/(\d+)/);
        if (match) size = Number(match[1]);
        continue;
      }

      if (line.startsWith('TITLE') || line.startsWith('DOMAIN_')) {
        continue;
      }

      if (!Number.isNaN(Number(line.split(/\s+/).filter(Boolean)[0]))) {
        const numericValues = line.split(/\s+/).map((part) => Number(part)).filter((number) => !Number.isNaN(number));
        values.push(...numericValues);
      }
    }

    if (!size || values.length === 0) return null;
    return { size, values };
  }

  function exportProjectFile() {
    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: videoFile ? { name: videoFile.name, type: videoFile.type, size: videoFile.size } : null,
      state: {
        trimStart,
        trimEnd,
        playbackRate,
        volume,
        aspectRatio,
        rotation,
        flipH,
        flipV,
        previewQuality,
        captionText,
        captionSegments: captionSegments.map((segment) => ({ ...segment, style: { ...segment.style } })),
        transitionType: activeTransition,
        clipSegments: clipSegments.map((segment) => ({ ...segment })),
        blendMode: activeBlendMode,
        masks: masks.map((mask) => ({ ...mask, points: mask.points.map((point) => ({ ...point })) })),
        playbackCurve: {
          p0: { ...playbackCurve.p0 },
          p1: { ...playbackCurve.p1 },
          p2: { ...playbackCurve.p2 },
          p3: { ...playbackCurve.p3 },
        },
        cubeLut: cubeLut ? { ...cubeLut, values: [...cubeLut.values] } : null,
        captionSize,
        captionWeight,
        captionBg,
        captionShadow,
        captionX,
        captionY,
        filters: { ...filters },
      },
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dolomite-project-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importProjectFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const jsonText = await file.text();
        const parsed = JSON.parse(jsonText) as { state?: Partial<VideoEditorState> };
        const state = parsed.state ?? parsed;
        if (!state) {
          alert('The selected file does not contain valid project data.');
          return;
        }

        restoreState(state as VideoEditorState);
        activeTab = 'timeline';
        renderToolControls();
        if (videoElement.src) {
          updatePlaybackRateFromCurve();
        }
      } catch (error) {
        console.error('Import failed:', error);
        alert('Unable to import project file. Please choose a valid Dolomite JSON project.');
      }
    };
    input.click();
  }

  function pushState() {
    const currentState: VideoEditorState = {
      trimStart,
      trimEnd,
      playbackRate,
      volume,
      aspectRatio,
      rotation,
      flipH,
      flipV,
      previewQuality,
      captionText,
      captionSegments: captionSegments.map((segment) => ({ ...segment, style: { ...segment.style } })),
      transitionType: activeTransition,
      clipSegments: clipSegments.map((segment) => ({ ...segment })),
      blendMode: activeBlendMode,
      masks: masks.map((mask) => ({ ...mask, points: mask.points.map((point) => ({ ...point })) })),
      playbackCurve: {
        p0: { ...playbackCurve.p0 },
        p1: { ...playbackCurve.p1 },
        p2: { ...playbackCurve.p2 },
        p3: { ...playbackCurve.p3 },
      },
      cubeLut: cubeLut ? { ...cubeLut, values: [...cubeLut.values] } : null,
      captionSize,
      captionWeight,
      captionBg,
      captionShadow,
      captionX,
      captionY,
      filters: { ...filters }
    };
    history = history.slice(0, historyIndex + 1);
    history.push(currentState);
    historyIndex = history.length - 1;
    void persistProjectState();
  }

  function restoreState(state: VideoEditorState) {
    trimStart = state.trimStart;
    trimEnd = state.trimEnd;
    playbackRate = state.playbackRate;
    volume = state.volume;
    aspectRatio = state.aspectRatio;
    rotation = state.rotation;
    flipH = state.flipH;
    flipV = state.flipV;
    previewQuality = state.previewQuality;
    captionText = state.captionText;
    captionSegments = Array.isArray(state.captionSegments) ? state.captionSegments.map((segment) => ({
      ...segment,
      style: { ...segment.style }
    })) : [];
    activeTransition = state.transitionType || 'crossfade';
    clipSegments = Array.isArray(state.clipSegments) ? state.clipSegments.map((segment) => ({ ...segment })) : [];
    activeBlendMode = state.blendMode || 'screen';
    masks = Array.isArray(state.masks) ? state.masks.map((mask) => ({
      ...mask,
      points: (mask.points ?? []).map((point) => ({ ...point })),
    })) : [];
    playbackCurve = state.playbackCurve || playbackCurve;
    cubeLut = state.cubeLut ? { ...state.cubeLut, values: [...state.cubeLut.values] } : null;
    captionSize = state.captionSize;
    captionWeight = state.captionWeight;
    captionBg = state.captionBg;
    captionShadow = state.captionShadow;
    captionX = state.captionX;
    captionY = state.captionY;
    Object.assign(filters, state.filters);
    applyMaskOverlay();

    videoElement.playbackRate = playbackRate;
    videoElement.volume = volume;
    volumeSlider.value = volume.toString();
    setAspectRatio(aspectRatio);
    updateTransforms();
    updateCaptions();
    updateTrimMarkers();
    applyVideoFilters();
    renderToolControls();
  }

  function parseSrtText(rawText: string): TimedCaption[] {
    const lines = rawText.replace(/\r/g, '').trim().split(/\n+/);
    const segments: TimedCaption[] = [];
    let current: Partial<TimedCaption> | null = null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) {
        if (current && current.text) {
          segments.push({
            id: current.id ?? segments.length + 1,
            start: Number(current.start ?? 0),
            end: Number(current.end ?? current.start ?? 0),
            text: current.text ?? '',
            style: {
              size: captionSize,
              weight: captionWeight,
              background: captionBg,
              shadow: captionShadow,
              x: captionX,
              y: captionY,
            },
          });
          current = null;
        }
        continue;
      }

      if (/^\d+$/.test(line)) {
        current = current ?? {};
        current.id = Number(line);
        continue;
      }

      const timeMatch = line.match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/);
      if (timeMatch) {
        current = current ?? {};
        current.start = parseSrtTimestamp(timeMatch[1]);
        current.end = parseSrtTimestamp(timeMatch[2]);
        continue;
      }

      if (current) {
        current.text = (current.text ? `${current.text}\n` : '') + line;
      }
    }

    if (current && current.text) {
      segments.push({
        id: current.id ?? segments.length + 1,
        start: Number(current.start ?? 0),
        end: Number(current.end ?? current.start ?? 0),
        text: current.text,
        style: {
          size: captionSize,
          weight: captionWeight,
          background: captionBg,
          shadow: captionShadow,
          x: captionX,
          y: captionY,
        },
      });
    }

    return segments.filter((segment) => segment.text.trim().length > 0);
  }

  function parseSrtTimestamp(vttTime: string): number {
    const normalized = vttTime.replace(',', '.');
    const [hours, minutes, seconds] = normalized.split(':').map((part) => Number(part));
    return hours * 3600 + minutes * 60 + seconds;
  }

  function buildSrtFromSegments(segments: TimedCaption[]): string {
    return segments
      .map((segment) => {
        const start = formatCaptionTimestamp(segment.start);
        const end = formatCaptionTimestamp(segment.end);
        return `${segment.id}\n${start} --> ${end}\n${segment.text.trim()}`;
      })
      .join('\n\n');
  }

  function formatCaptionTimestamp(seconds: number): string {
    const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    const ms = Math.floor((secs % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${Math.floor(secs)
      .toString()
      .padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  function getActiveCaption(): TimedCaption | null {
    const activeCaption = captionSegments.find((segment) => currentTime >= segment.start && currentTime <= segment.end);
    if (activeCaption) return activeCaption;
    if (!captionText.trim()) return null;
    return {
      id: 0,
      start: 0,
      end: duration || 0,
      text: captionText,
      style: {
        size: captionSize,
        weight: captionWeight,
        background: captionBg,
        shadow: captionShadow,
        x: captionX,
        y: captionY,
      },
    };
  }

  function splitClipAtPlayhead() {
    if (!duration || currentTime <= 0 || currentTime >= duration) return;
    const currentSegment = clipSegments.find((segment) => currentTime >= segment.start && currentTime <= segment.end) ?? {
      id: Date.now(),
      start: trimStart,
      end: trimEnd || duration,
      label: 'Segment',
    };
    const left = { ...currentSegment, end: currentTime };
    const right = { id: Date.now() + 1, start: currentTime, end: currentSegment.end, label: `${currentSegment.label} B` };
    const otherSegments = clipSegments.filter((segment) => segment.id !== currentSegment.id);
    clipSegments = [...otherSegments, left, right].sort((a, b) => a.start - b.start);
    trimStart = clipSegments[0]?.start ?? 0;
    trimEnd = clipSegments[clipSegments.length - 1]?.end ?? duration;
    pushState();
    renderToolControls();
  }

  function deleteCurrentClipSegment() {
    if (clipSegments.length <= 1) {
      trimStart = 0;
      trimEnd = duration;
      return;
    }
    const targetIndex = clipSegments.findIndex((segment) => currentTime >= segment.start && currentTime <= segment.end);
    if (targetIndex < 0) return;
    const removed = clipSegments[targetIndex];
    clipSegments = clipSegments.filter((segment) => segment.id !== removed.id);
    trimStart = clipSegments[0]?.start ?? 0;
    trimEnd = clipSegments[clipSegments.length - 1]?.end ?? duration;
    pushState();
    renderToolControls();
  }

  async function importSubtitleFile(file: File) {
    const text = await file.text();
    const segments = parseSrtText(text);
    captionSegments = segments;
    const firstSegment = segments[0];
    if (firstSegment) {
      captionText = firstSegment.text;
      captionSize = firstSegment.style.size;
      captionWeight = firstSegment.style.weight;
      captionBg = firstSegment.style.background;
      captionShadow = firstSegment.style.shadow;
      captionX = firstSegment.style.x;
      captionY = firstSegment.style.y;
    }
    updateCaptions();
    renderToolControls();
    pushState();
  }

  function exportSubtitleFile() {
    if (!captionSegments.length && !captionText.trim()) {
      alert('Add subtitle content before exporting a sidecar file.');
      return;
    }
    const subtitleText = buildSrtFromSegments(captionSegments.length ? captionSegments : [{
      id: 1,
      start: 0,
      end: Math.max(3, duration || 3),
      text: captionText || 'Caption',
      style: {
        size: captionSize,
        weight: captionWeight,
        background: captionBg,
        shadow: captionShadow,
        x: captionX,
        y: captionY,
      },
    }]);

    const blob = new Blob([subtitleText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'captions.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      restoreState(history[historyIndex]);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      restoreState(history[historyIndex]);
    }
  }

  const root = div({
    className: 'min-h-screen p-2 sm:p-8 lg:p-10 flex items-center justify-center'
  });

  const modal = div({
    className: 'editor-surface w-full max-w-[1020px] rounded-[28px] border border-slate-700/70 bg-[#34495e] shadow-[0_25px_60px_rgba(15,23,42,0.3)] overflow-hidden flex flex-col'
  });

  const fileInput = input({
    type: 'file',
    accept: 'video/*',
    className: 'sr-only',
    onchange: (e: Event) => handleVideoUpload(e)
  });

  const interactionToggleButton = button({
    type: 'button',
    className: 'rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300 transition hover:border-slate-500 hover:text-white',
    title: 'Toggle preview interaction mode',
    onclick: () => setInteractionMode(!interactionModeEnabled)
  }, 'Preview Controls: OFF');

  const quickActions = div({ className: 'flex flex-wrap justify-end gap-2 sm:gap-3 items-center' },
    div({ className: 'flex items-center gap-1.5 mr-2' },
      button({
        type: 'button',
        className: 'p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all',
        title: 'Undo (Ctrl+Z)',
        onclick: () => undo()
      }, '↶'),
      button({
        type: 'button',
        className: 'p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all',
        title: 'Redo (Ctrl+Y)',
        onclick: () => redo()
      }, '↷')
    ),
    interactionToggleButton,
    label({ className: 'cursor-pointer inline-flex items-center justify-center rounded-xl bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white border border-slate-700/60' },
      'Import Video',
      fileInput
    ),
    createButton('primary', {
      type: 'button',
      className: 'bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-violet-600/20',
      onclick: () => switchTab('export')
    }, 'Render Video')
  );

  const { titleRow, fullscreenButton } = createEditorTitleRow(
    'Video Studio Pro',
    () => resetEditor(),
    () => toggleEditorFullscreen()
  );

  const sidePanelNav = div({ className: 'flex flex-wrap gap-2 px-3 pb-2 sm:gap-3 sm:px-5 bg-[#2c3e50]/40 pt-3 items-center justify-between' });
  const toolContainer = div({ className: 'space-y-4' });

  const tabs: { id: VideoTab; label: string }[] = [
    { id: 'timeline', label: 'TRIM' },
    { id: 'filters', label: 'FILTERS' },
    { id: 'transform', label: 'CANVAS' },
    { id: 'audio', label: 'AUDIO' },
    { id: 'captions', label: 'TEXT' },
    { id: 'export', label: 'EXPORT' },
  ];

  tabs.forEach((tab) => {
    const btn = button({
      type: 'button',
      className: `editor-tab inline-flex min-w-[70px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[90px] sm:px-3 sm:text-[11px] ${
        activeTab === tab.id
          ? 'border-slate-100/20 bg-slate-900/60 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`,
      onclick: () => switchTab(tab.id)
    }, tab.label);
    sidePanelNav.append(btn);
  });

  const sidePanel = div({ className: 'w-full shrink-0 rounded-[18px] border border-white/5 bg-[#2c3e50]/70 p-4 md:w-[310px] flex flex-col justify-between overflow-y-auto max-h-[540px]' },
    toolContainer
  );

  const stage = div({ className: 'relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-[18px] border border-slate-700/40 bg-[#2c3e50] p-3 min-h-0 sm:p-4' },
    div({ className: 'mb-2 flex justify-end sm:mb-3' }, quickActions)
  );

  // Video Element & Interactive Overlay Container
  const videoElement = document.createElement('video');
  videoElement.className = 'max-h-full max-w-full object-contain rounded-lg shadow-2xl block transition-all duration-75 origin-center';
  videoElement.playsInline = true;

  const videoContainer = div({ className: 'relative flex-1 flex items-center justify-center bg-slate-950 p-2 overflow-hidden min-h-0 sm:p-6 rounded-xl border border-slate-800/60 shadow-inner' });

  const maskOverlay = div({
    className: 'absolute inset-0 z-10 pointer-events-none hidden overflow-hidden rounded-lg',
    style: 'left: 0; top: 0; right: 0; bottom: 0;'
  });

  const captionOverlay = div({
    className: 'absolute text-center cursor-move select-none transition-all px-4 py-1.5 rounded-lg hidden z-20 shadow-xl',
    style: 'left: 50%; top: 85%; transform: translate(-50%, -50%);'
  });

  videoContainer.append(maskOverlay, captionOverlay);

  // Make caption overlay draggable
  let isDraggingCaption = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  captionOverlay.onmousedown = (e: MouseEvent) => {
    isDraggingCaption = true;
    const rect = captionOverlay.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.stopPropagation();
  };

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDraggingCaption) return;
    const parentRect = videoContainer.getBoundingClientRect();
    let newX = ((e.clientX - dragOffsetX - parentRect.left) / parentRect.width) * 100;
    let newY = ((e.clientY - dragOffsetY - parentRect.top) / parentRect.height) * 100;
    captionX = Math.max(0, Math.min(100, newX));
    captionY = Math.max(0, Math.min(100, newY));
    captionOverlay.style.left = `${captionX}%`;
    captionOverlay.style.top = `${captionY}%`;
    captionOverlay.style.transform = 'translate(-50%, -50%)';
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingCaption) {
      isDraggingCaption = false;
      pushState();
    }
  });

  videoContainer.onwheel = (e: WheelEvent) => {
    if (!videoElement.src || !interactionModeEnabled) return;
    e.preventDefault();

    const previousZoom = viewportZoom.zoomLevel;
    const zoomStep = e.deltaY < 0 ? 1.12 : 0.88;
    const nextZoom = Math.min(4, Math.max(1, previousZoom * zoomStep));

    if (nextZoom === previousZoom) return;

    const rect = videoContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = e.clientX - centerX;
    const offsetY = e.clientY - centerY;

    viewportZoom.zoomLevel = nextZoom;
    viewportZoom.panX += offsetX * (1 - previousZoom / nextZoom);
    viewportZoom.panY += offsetY * (1 - previousZoom / nextZoom);
    clampViewportZoom();
    applyVideoFilters();
  };

  videoContainer.onmousedown = (e: MouseEvent) => {
    if (!videoElement.src || !interactionModeEnabled || viewportZoom.zoomLevel <= 1) return;
    e.preventDefault();
    viewportZoom.isDragging = true;
    viewportZoom.startX = e.clientX - viewportZoom.panX;
    viewportZoom.startY = e.clientY - viewportZoom.panY;
    viewportZoom.velocityX = 0;
    viewportZoom.velocityY = 0;
  };

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!interactionModeEnabled || !viewportZoom.isDragging || !videoElement.src || viewportZoom.zoomLevel <= 1) return;
    viewportZoom.panX = e.clientX - viewportZoom.startX;
    viewportZoom.panY = e.clientY - viewportZoom.startY;
    clampViewportZoom();
    applyVideoFilters();
  });

  window.addEventListener('mouseup', () => {
    if (viewportZoom.isDragging) {
      viewportZoom.isDragging = false;
      viewportZoom.velocityX = 0;
      viewportZoom.velocityY = 0;
    }
  });

  const uploadIcon = svgElement('svg', {
    class: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
  },
    svgElement('path', {
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      strokeWidth: '1.5',
      d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    })
  );

  const emptyState = div({ className: 'flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/40 hover:bg-slate-900/70 transition-all cursor-pointer w-full max-w-md' },
    div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-violet-400 border border-slate-700/50' },
      uploadIcon
    ),
    p({ className: 'text-sm font-semibold text-slate-200' }, 'Drop video clip here or click to import'),
    p({ className: 'mt-1 text-xs text-slate-400' }, 'Supports MP4, WebM, MOV, AVI')
  );

  emptyState.onclick = () => fileInput.click();

  videoContainer.append(emptyState);

  // Playback HUD Bar
  const syncPlaybackUI = () => {
    const isActive = !!videoElement.src && !videoElement.paused && !videoElement.ended;
    isPlaying = isActive;
    playPauseBtn.textContent = isPlaying ? '❚❚' : '▶';
    playPauseBtn.title = isPlaying ? 'Pause playback' : 'Play playback';
    playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause video' : 'Play video');
  };

  const playPauseBtn = button({
    type: 'button',
    className: 'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-base font-bold text-white transition hover:border-violet-500 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/60',
    title: 'Play playback',
    ariaLabel: 'Play video',
    onclick: togglePlay
  }, '▶');

  const stepBackwardBtn = button({
    type: 'button',
    className: 'text-slate-400 hover:text-white text-xs px-1.5 py-1',
    title: 'Step backward 1 frame',
    onclick: () => stepFrames(-1)
  }, '⏮');

  const stepForwardBtn = button({
    type: 'button',
    className: 'text-slate-400 hover:text-white text-xs px-1.5 py-1',
    title: 'Step forward 1 frame',
    onclick: () => stepFrames(1)
  }, '⏭');

  const timeDisplay = div({ className: 'min-w-0 flex-shrink-0 font-mono text-[11px] text-slate-300 text-center sm:min-w-[95px]' }, '00:00 / 00:00');

  const seekSlider = input({
    type: 'range',
    min: '0',
    max: '100',
    value: '0',
    step: '0.1',
    className: 'h-1.5 w-full flex-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500',
    oninput: (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (videoElement.duration) {
        videoElement.currentTime = (parseFloat(target.value) / 100) * videoElement.duration;
      }
    }
  });

  const volumeSlider = input({
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: '1',
    className: 'h-1.5 w-16 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500',
    oninput: (e: Event) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      volume = val;
      videoElement.volume = val;
      pushState();
    }
  });

  const playerHud = div({ className: 'flex flex-col gap-2 rounded-xl border border-slate-700/50 bg-slate-900/90 p-3 backdrop-blur-md z-10 sm:min-h-[56px] sm:flex-row sm:items-center sm:gap-3 sm:px-5' },
    div({ className: 'flex items-center gap-2' },
      stepBackwardBtn,
      playPauseBtn,
      stepForwardBtn,
      timeDisplay
    ),
    seekSlider,
    div({ className: 'flex items-center gap-2 text-xs text-slate-400 sm:ml-2' },
      span({ className: 'inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/90 text-sm' }, '🔊'),
      volumeSlider
    )
  );

  // Advanced Interactive Timeline with Thumbnail Strip & Draggable Playhead
  const playheadLine = div({ className: 'absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none shadow-md', style: 'left: 0%' });

  const trimStartMarker = div({
    className: 'absolute top-0 bottom-0 w-2.5 bg-violet-400 border-r-2 border-white cursor-ew-resize z-20 hover:bg-violet-300 transition-colors shadow-lg flex items-center justify-center',
    style: 'left: 0%'
  },
    div({ className: 'w-0.5 h-3 bg-slate-900 rounded-full' })
  );

  const trimEndMarker = div({
    className: 'absolute top-0 bottom-0 w-2.5 bg-violet-400 border-l-2 border-white cursor-ew-resize z-20 hover:bg-violet-300 transition-colors shadow-lg flex items-center justify-center',
    style: 'left: 100%'
  },
    div({ className: 'w-0.5 h-3 bg-slate-900 rounded-full' })
  );

  const trimActiveZone = div({
    className: 'absolute top-0 bottom-0 bg-violet-500/30 border-t border-b border-violet-400/60 pointer-events-none z-10',
    style: 'left: 0%; right: 0%'
  });

  const thumbnailStrip = div({ className: 'absolute inset-0 flex opacity-40 pointer-events-none overflow-hidden' });

  const videoTrackSegment = div({ className: 'relative h-10 rounded-lg bg-slate-800/90 border border-slate-700 flex items-center px-3 text-xs text-slate-300 font-medium overflow-hidden shadow-inner select-none' },
    thumbnailStrip,
    trimStartMarker,
    trimActiveZone,
    trimEndMarker,
    div({ className: 'truncate z-0 text-slate-200 text-[11px] font-semibold drop-shadow-md' }, 'Video Track 1 • Main Source Clip')
  );

  const audioTrackSegment = div({ className: 'relative h-8 rounded-lg bg-cyan-950/50 border border-cyan-800/50 flex items-center px-3 text-xs text-cyan-300 font-medium overflow-hidden shadow-inner select-none' },
    div({ className: 'truncate text-[11px]' }, 'Audio Track 1 • Master Stereo Mix')
  );

  const timelineRuler = div({ className: 'h-6 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between gap-2 px-3 text-[10px] font-mono text-slate-500 select-none sm:px-4' },
    div({}, '00:00'),
    div({}, '00:15'),
    div({}, '00:30'),
    div({}, '00:45'),
    div({}, '01:00')
  );

  let isScrubbingTimeline = false;

  const timelineTrackArea = div({
    className: 'relative flex-1 p-3 space-y-2 overflow-y-auto cursor-pointer bg-slate-900/50',
    onmousedown: (e: MouseEvent) => {
      isScrubbingTimeline = true;
      updatePlayheadFromMouseEvent(e);
    }
  });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isScrubbingTimeline) return;
    updatePlayheadFromMouseEvent(e);
  });

  window.addEventListener('mouseup', () => {
    isScrubbingTimeline = false;
  });

  function updatePlayheadFromMouseEvent(e: MouseEvent) {
    const rect = timelineTrackArea.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    if (videoElement.duration) {
      videoElement.currentTime = ratio * videoElement.duration;
    }
  }

  timelineTrackArea.append(playheadLine, videoTrackSegment, audioTrackSegment);

  const timelineContainer = div({ className: 'h-48 shrink-0 flex flex-col border-t border-slate-700/50 bg-slate-900/80 overflow-hidden rounded-xl' },
    timelineRuler,
    timelineTrackArea
  );

  const zoomInButton = button({
    type: 'button',
    className: 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-lg font-bold text-slate-100 shadow-lg shadow-slate-950/40 transition hover:border-violet-500 hover:text-violet-300',
    title: 'Zoom in',
    onclick: () => zoomViewport(1.15)
  }, '+');

  const zoomOutButton = button({
    type: 'button',
    className: 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-lg font-bold text-slate-100 shadow-lg shadow-slate-950/40 transition hover:border-violet-500 hover:text-violet-300',
    title: 'Zoom out',
    onclick: () => zoomViewport(1 / 1.15)
  }, '−');

  const resetZoomButton = button({
    type: 'button',
    className: 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-xs font-bold uppercase tracking-wider text-slate-200 shadow-lg shadow-slate-950/40 transition hover:border-violet-500 hover:text-violet-300',
    title: 'Reset zoom',
    onclick: () => {
      viewportZoom.zoomLevel = 1;
      viewportZoom.panX = 0;
      viewportZoom.panY = 0;
      applyVideoFilters();
    }
  }, '1:1');

  const zoomControls = div({ className: 'absolute bottom-4 right-4 z-30 flex flex-col gap-2' },
    zoomInButton,
    zoomOutButton,
    resetZoomButton
  );

  stage.append(videoContainer, zoomControls, playerHud, timelineContainer);

  const workspace = div({ className: 'flex flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-6' }, sidePanel, stage);
  const modalFooter = createEditorFooter(() => resetEditor(), () => startVideoExport());

  const modalWrap = div({ className: 'w-full' }, titleRow, sidePanelNav, workspace, modalFooter);
  modal.append(modalWrap);
  root.append(modal);

  const syncFullscreenLayout = () => {
    const isFullscreen = document.fullscreenElement === modal;

    modal.style.maxWidth = isFullscreen ? '100vw' : '';
    modal.style.width = isFullscreen ? '100vw' : '';
    modal.style.height = isFullscreen ? '100vh' : '';
    modal.style.borderRadius = isFullscreen ? '0px' : '';

    sidePanel.style.minHeight = isFullscreen ? '0' : '';
    sidePanel.style.height = isFullscreen ? 'calc(100vh - 180px)' : '';
    sidePanel.style.maxHeight = isFullscreen ? 'calc(100vh - 180px)' : '540px';
    sidePanel.style.overflowY = 'auto';
    sidePanel.style.overflowX = 'hidden';
    sidePanel.style.display = 'flex';
    sidePanel.style.flexDirection = 'column';

    stage.style.minHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.height = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.maxHeight = isFullscreen ? 'calc(100vh - 180px)' : '';
    stage.style.overflowY = 'auto';
    stage.style.overflowX = 'hidden';
    stage.style.display = 'flex';
    stage.style.flexDirection = 'column';
    videoContainer.style.minHeight = isFullscreen ? 'min(68vh, 70vh)' : '';
    videoContainer.style.height = isFullscreen ? 'calc(100vh - 235px)' : '';
    videoContainer.style.maxHeight = isFullscreen ? '100%' : '';
    videoContainer.style.width = isFullscreen ? '100%' : '';
    videoContainer.style.overflow = 'hidden';
    videoContainer.style.display = 'flex';
    videoContainer.style.alignItems = 'center';
    videoContainer.style.justifyContent = 'center';

    if (isFullscreen) {
      videoElement.style.maxWidth = '100%';
      videoElement.style.maxHeight = '100%';
      videoElement.style.width = 'auto';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'contain';
      videoElement.style.margin = '0 auto';
      videoElement.style.display = 'block';
    } else {
      videoElement.style.maxWidth = '';
      videoElement.style.maxHeight = '';
      videoElement.style.width = '';
      videoElement.style.height = '';
      videoElement.style.objectFit = '';
      videoElement.style.margin = '';
      videoElement.style.display = '';
    }
  };

  const updateFullscreenButton = () => {
    const isFullscreen = document.fullscreenElement === modal;
    fullscreenButton.textContent = isFullscreen ? '⤡' : '⤢';
    syncFullscreenLayout();
  };

  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

  // Keyboard Shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
      return;
    }

    if (!interactionModeEnabled) {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomViewport(1.15);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomViewport(1 / 1.15);
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      rotation = (rotation + 90) % 360;
      updateTransforms();
      pushState();
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      flipH = !flipH;
      updateTransforms();
      pushState();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (videoElement.duration) {
        videoElement.currentTime = Math.min(videoElement.duration, videoElement.currentTime + 5);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (videoElement.duration) {
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 5);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  function toggleEditorFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement === modal) {
      void document.exitFullscreen();
      return;
    }
    void modal.requestFullscreen().catch(() => {
      // Ignore fullscreen failures and keep the editor usable in standard layout.
    });
  }

  // Dynamic Inspector Panels
  function renderPlaybackCurveEditor() {
    const editor = div({ className: 'mt-3 rounded-xl border border-slate-700 bg-slate-950/80 p-2' });
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 90;
    canvas.className = 'w-full rounded-lg border border-slate-800 bg-slate-900';

    const redraw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;

      for (let i = 0; i <= 4; i += 1) {
        const x = (i / 4) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i <= 100; i += 1) {
        const t = i / 100;
        const x = cubicBezierValue(t, playbackCurve.p0.x, playbackCurve.p1.x, playbackCurve.p2.x, playbackCurve.p3.x) * w;
        const y = h - cubicBezierValue(t, playbackCurve.p0.y, playbackCurve.p1.y, playbackCurve.p2.y, playbackCurve.p3.y) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.stroke();

      const handles = [playbackCurve.p1, playbackCurve.p2];
      handles.forEach((point) => {
        const hx = point.x * w;
        const hy = h - point.y * h;
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = '#a78bfa';
        ctx.stroke();
      });

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px sans-serif';
      ctx.fillText('0.25x', 8, h - 8);
      ctx.fillText('4x', w - 24, 12);
    };

    let activeHandle: 'p1' | 'p2' | null = null;
    canvas.onpointerdown = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clampValue(1 - (event.clientY - rect.top) / rect.height, 0, 1);
      const handles = [
        { name: 'p1' as const, point: playbackCurve.p1 },
        { name: 'p2' as const, point: playbackCurve.p2 },
      ];
      const hit = handles.reduce((closest, entry) => {
        const distance = Math.hypot(entry.point.x - x, entry.point.y - y);
        return distance < closest.distance ? { distance, entry } : closest;
      }, { distance: 0.12, entry: null as { name: 'p1' | 'p2'; point: { x: number; y: number } } | null });
      activeHandle = hit.entry?.name ?? null;
      if (activeHandle) {
        canvas.setPointerCapture(event.pointerId);
      }
    };
    canvas.onpointermove = (event) => {
      if (!activeHandle) return;
      const rect = canvas.getBoundingClientRect();
      const x = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clampValue(1 - (event.clientY - rect.top) / rect.height, 0, 1);
      playbackCurve[activeHandle].x = x;
      playbackCurve[activeHandle].y = y;
      playbackRate = Number(getPlaybackRateAtTime(0.5).toFixed(2));
      if (videoElement.duration) {
        videoElement.playbackRate = getPlaybackRateAtTime((videoElement.currentTime - trimStart) / Math.max(0.01, (trimEnd || duration) - trimStart));
      }
      redraw();
      pushState();
    };
    canvas.onpointerup = () => {
      activeHandle = null;
    };

    redraw();
    editor.append(canvas);
    return editor;
  }

  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'timeline') {
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Timeline Trim & Speed'),
        createSliderControl('Start Marker (s)', trimStart, 0, Math.max(1, duration), (v) => {
          trimStart = Math.min(v, (trimEnd || duration) - 0.5);
          updateTrimMarkers();
          if (videoElement.currentTime < trimStart) videoElement.currentTime = trimStart;
        }),
        createSliderControl('End Marker (s)', trimEnd || duration, 0, Math.max(1, duration), (v) => {
          trimEnd = Math.max(v, trimStart + 0.5);
          updateTrimMarkers();
        }),
        p({ className: 'mt-3 text-xs font-semibold text-slate-300' }, `Bezier Peak: ${playbackRate.toFixed(2)}x`),
        renderPlaybackCurveEditor(),
        div({ className: 'pt-2 grid grid-cols-2 gap-2.5' },
          createPresetButton('Set Start Here', () => {
            trimStart = videoElement.currentTime;
            updateTrimMarkers();
            pushState();
            renderToolControls();
          }),
          createPresetButton('Set End Here', () => {
            trimEnd = videoElement.currentTime;
            updateTrimMarkers();
            pushState();
            renderToolControls();
          })
        ),
        div({ className: 'pt-2 grid grid-cols-2 gap-2.5' },
          createPresetButton('Split Clip', () => {
            splitClipAtPlayhead();
          }),
          createPresetButton('Ripple Delete', () => {
            deleteCurrentClipSegment();
          })
        ),
        div({ className: 'pt-2' },
          div({ className: 'flex justify-between items-center text-xs' },
            span({ className: 'text-slate-400' }, 'Transition'),
            createSelectDropdown(['none', 'crossfade', 'dip-to-black', 'wipe', 'slide'], activeTransition, (val) => {
              activeTransition = val as ClipTransition;
              pushState();
            })
          )
        )
      );
    } else if (activeTab === 'filters') {
      const presetGrid = div({ className: 'grid grid-cols-2 gap-3 mb-4' },
        createThumbnailPresetCard('Normal', { exposure: 100, brightness: 100, contrast: 100, saturate: 100, temperature: 0, tint: 0, highlights: 100, shadows: 100, blur: 0, sharpen: 0, grayscale: 0, sepia: 0, vignette: 0, filmGrain: 0, fade: 0 }, '✨'),
        createThumbnailPresetCard('Cinematic', { exposure: 105, brightness: 90, contrast: 130, saturate: 115, temperature: -10, tint: 5, highlights: 90, shadows: 110, blur: 0, sharpen: 10, grayscale: 0, sepia: 0, vignette: 20, filmGrain: 15, fade: 5 }, '🎬'),
        createThumbnailPresetCard('Mono Noir', { exposure: 100, brightness: 105, contrast: 140, saturate: 0, temperature: 0, tint: 0, highlights: 100, shadows: 90, blur: 0, sharpen: 15, grayscale: 100, sepia: 0, vignette: 30, filmGrain: 25, fade: 10 }, '🎞️'),
        createThumbnailPresetCard('Warm Vintage', { exposure: 100, brightness: 105, contrast: 105, saturate: 120, temperature: 25, tint: 10, highlights: 105, shadows: 95, blur: 0, sharpen: 0, grayscale: 0, sepia: 25, vignette: 25, filmGrain: 20, fade: 15 }, '🌅')
      );

      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'One-Click Filter Presets'),
        presetGrid,
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Basic Adjustments'),
        createSliderControl('Exposure', filters.exposure, 0, 200, (v) => { filters.exposure = v; applyVideoFilters(); }),
        createSliderControl('Brightness', filters.brightness, 0, 200, (v) => { filters.brightness = v; applyVideoFilters(); }),
        createSliderControl('Contrast', filters.contrast, 0, 200, (v) => { filters.contrast = v; applyVideoFilters(); }),
        createSliderControl('Saturation', filters.saturate, 0, 200, (v) => { filters.saturate = v; applyVideoFilters(); }),
        createSliderControl('Temperature', filters.temperature, -50, 50, (v) => { filters.temperature = v; applyVideoFilters(); }),
        createSliderControl('Tint', filters.tint, -50, 50, (v) => { filters.tint = v; applyVideoFilters(); }),
        createSliderControl('Highlights', filters.highlights, 0, 200, (v) => { filters.highlights = v; applyVideoFilters(); }),
        createSliderControl('Shadows', filters.shadows, 0, 200, (v) => { filters.shadows = v; applyVideoFilters(); }),
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Creative Effects'),
        createSliderControl('Blur (px)', filters.blur, 0, 20, (v) => { filters.blur = v; applyVideoFilters(); }),
        createSliderControl('Sharpen', filters.sharpen, 0, 100, (v) => { filters.sharpen = v; applyVideoFilters(); }),
        createSliderControl('Grayscale (%)', filters.grayscale, 0, 100, (v) => { filters.grayscale = v; applyVideoFilters(); }),
        createSliderControl('Sepia (%)', filters.sepia, 0, 100, (v) => { filters.sepia = v; applyVideoFilters(); }),
        createSliderControl('Vignette', filters.vignette, 0, 100, (v) => { filters.vignette = v; applyVideoFilters(); }),
        createSliderControl('Film Grain', filters.filmGrain, 0, 100, (v) => { filters.filmGrain = v; applyVideoFilters(); }),
        createSliderControl('Fade', filters.fade, 0, 100, (v) => { filters.fade = v; applyVideoFilters(); })
      );
    } else if (activeTab === 'transform') {
      const ratioGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('16:9 Widescreen', () => { setAspectRatio('16:9'); pushState(); }),
        createPresetButton('9:16 Vertical/Reels', () => { setAspectRatio('9:16'); pushState(); }),
        createPresetButton('1:1 Square', () => { setAspectRatio('1:1'); pushState(); }),
        createPresetButton('4:5 Social Feed', () => { setAspectRatio('4:5'); pushState(); })
      );

      const transformGrid = div({ className: 'grid grid-cols-2 gap-2.5 mt-3' },
        createPresetButton('Rotate 90°', () => { rotation = (rotation + 90) % 360; updateTransforms(); pushState(); }),
        createPresetButton('Flip Horizontal', () => { flipH = !flipH; updateTransforms(); pushState(); }),
        createPresetButton('Flip Vertical', () => { flipV = !flipV; updateTransforms(); pushState(); }),
        createPresetButton('Reset Transforms', () => { rotation = 0; flipH = false; flipV = false; updateTransforms(); pushState(); })
      );

      const maskToolGrid = div({ className: 'grid grid-cols-3 gap-2 mt-2' },
        createPresetButton('Circle', () => { activeMaskTool = 'circle'; }),
        createPresetButton('Rect', () => { activeMaskTool = 'rect'; }),
        createPresetButton('Freehand', () => { activeMaskTool = 'freehand'; })
      );

      const lutUploadButton = createPresetButton('Import .cube LUT', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.cube,text/plain';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const rawText = await file.text();
          const parsed = parseCubeLut(rawText);
          if (!parsed) {
            alert('Unable to parse a valid 3D LUT from the selected .cube file.');
            return;
          }
          cubeLut = parsed;
          pushState();
          renderToolControls();
        };
        input.click();
      });

      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Aspect Ratio Presets'),
        ratioGrid,
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Rotation & Mirroring'),
        transformGrid,
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Shape Masks & Feather'),
        maskToolGrid,
        div({ className: 'grid grid-cols-2 gap-2 pt-2' },
          createPresetButton('Add Mask', () => {
            const maskId = Date.now() + Math.floor(Math.random() * 1000);
            const newMask: MaskItem = {
              id: maskId,
              type: activeMaskTool,
              x: 50,
              y: 50,
              width: 45,
              height: 45,
              radius: 28,
              feather: 14,
              opacity: 0.45,
              blur: 6,
              color: '#a78bfa',
              points: [
                { x: 25, y: 20 },
                { x: 72, y: 20 },
                { x: 72, y: 72 },
                { x: 25, y: 72 },
              ],
            };
            pendingMask = newMask;
            masks.push(newMask);
            applyMaskOverlay();
            pushState();
          }),
          createPresetButton('Clear Masks', () => {
            masks = [];
            pendingMask = null;
            applyMaskOverlay();
            pushState();
          })
        ),
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, '3D LUT Grade'),
        lutUploadButton,
        cubeLut ? div({ className: 'mt-2 text-[10px] text-slate-300' }, `Loaded LUT: ${cubeLut.size}³`) : div({ className: 'mt-2 text-[10px] text-slate-500' }, 'No LUT loaded'),
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2 mt-4' }, 'Preview Quality'),
        div({ className: 'grid grid-cols-3 gap-2' },
          createPresetButton('Full (100%)', () => { previewQuality = '1'; pushState(); }),
          createPresetButton('Half (50%)', () => { previewQuality = '0.5'; pushState(); }),
          createPresetButton('Quarter (25%)', () => { previewQuality = '0.25'; pushState(); })
        )
      );
    } else if (activeTab === 'audio') {
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Master Audio Controls'),
        createSliderControl('Volume (%)', volume * 100, 0, 100, (v) => {
          volume = v / 100;
          videoElement.volume = volume;
          volumeSlider.value = volume.toString();
        }),
        div({ className: 'pt-2 grid grid-cols-2 gap-2.5' },
          createPresetButton('Mute Audio', () => {
            volume = 0;
            videoElement.volume = 0;
            volumeSlider.value = '0';
            pushState();
          }),
          createPresetButton('Full Volume', () => {
            volume = 1;
            videoElement.volume = 1;
            volumeSlider.value = '1';
            pushState();
          })
        )
      );
    } else if (activeTab === 'captions') {
      const textInput = input({
        type: 'text',
        placeholder: 'Subtitle / caption text...',
        value: captionText,
        className: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none',
        oninput: (e: Event) => {
          captionText = (e.target as HTMLInputElement).value;
          updateCaptions();
        },
        onchange: () => pushState()
      });

      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Timed Subtitles & Overlay Text'),
        div({ className: 'space-y-4' },
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Caption Content'),
            textInput
          ),
          createSliderControl('Font Size (px)', captionSize, 12, 48, (v) => {
            captionSize = v;
            updateCaptions();
          }),
          div({ className: 'grid grid-cols-2 gap-2 pt-2' },
            createPresetButton('Drop Shadow', () => {
              captionShadow = !captionShadow;
              updateCaptions();
              pushState();
            }),
            createPresetButton('Center Position', () => {
              captionX = 50;
              captionY = 85;
              updateCaptions();
              pushState();
            })
          ),
          div({ className: 'grid grid-cols-2 gap-2 pt-2' },
            createPresetButton('Add Timed Cue', () => {
              captionSegments.push({
                id: captionSegments.length + 1,
                start: Math.max(0, currentTime),
                end: Math.min(duration || currentTime + 3, currentTime + 3),
                text: captionText || 'New caption',
                style: {
                  size: captionSize,
                  weight: captionWeight,
                  background: captionBg,
                  shadow: captionShadow,
                  x: captionX,
                  y: captionY,
                },
              });
              updateCaptions();
              pushState();
              renderToolControls();
            }),
            createPresetButton('Clear Cues', () => {
              captionSegments = [];
              captionText = '';
              updateCaptions();
              pushState();
              renderToolControls();
            })
          ),
          div({ className: 'grid grid-cols-2 gap-2 pt-2' },
            createPresetButton('Import SRT/VTT', () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.srt,.vtt,text/plain';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (file) await importSubtitleFile(file);
              };
              input.click();
            }),
            createPresetButton('Export .SRT', () => {
              exportSubtitleFile();
            })
          )
        )
      );
    } else if (activeTab === 'export') {
      toolContainer.append(
        p({ className: 'text-xs font-bold text-slate-200 uppercase tracking-wider mb-2' }, 'Real-time Export Engine'),
        div({ className: 'space-y-3' },
          div({ className: 'rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-xs space-y-2.5' },
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Resolution'),
              createSelectDropdown(['720p', '1080p', '4k'], exportResolution, (val) => { exportResolution = val as any; })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Framerate'),
              createSelectDropdown(['24', '30', '60'], exportFps.toString(), (val) => { exportFps = parseInt(val) as any; })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Container'),
              createSelectDropdown(['webm', 'mp4'], exportFormat, (val) => { exportFormat = val as any; })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Quality Preset'),
              createSelectDropdown(['Economy (2 Mbps)', 'Balanced (5 Mbps)', 'High (10 Mbps)'], exportBitrate === 2000000 ? 'Economy (2 Mbps)' : exportBitrate === 10000000 ? 'High (10 Mbps)' : 'Balanced (5 Mbps)', (val) => {
                if (val.includes('Economy')) exportBitrate = 2000000;
                else if (val.includes('High')) exportBitrate = 10000000;
                else exportBitrate = 5000000;
              })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Transition'),
              createSelectDropdown(['none', 'crossfade', 'dip-to-black', 'wipe', 'slide'], activeTransition, (val) => {
                activeTransition = val as ClipTransition;
                pushState();
              })
            ),
            div({ className: 'flex justify-between items-center' },
              span({ className: 'text-slate-400' }, 'Blend Mode'),
              createSelectDropdown(['normal', 'screen', 'multiply', 'overlay', 'soft-light'], activeBlendMode, (val) => {
                activeBlendMode = val as BlendMode;
                pushState();
              })
            ),
            div({ className: 'flex justify-between pt-1 border-t border-slate-800' },
              span({ className: 'text-slate-400' }, 'Trim Length'),
              span({ className: 'font-semibold text-violet-300' }, `${(Math.max(0, (trimEnd || duration) - trimStart)).toFixed(1)}s`)
            )
          ),
          div({ className: 'grid grid-cols-2 gap-2 pt-3' },
            createPresetButton('Export JSON', () => exportProjectFile()),
            createPresetButton('Import JSON', () => importProjectFile())
          ),
          isRendering ? div({ className: 'space-y-2 text-center' },
            p({ className: 'text-xs text-violet-300 font-semibold' }, `Rendering Video... ${Math.round(renderProgress)}%`),
            div({ className: 'w-full bg-slate-800 h-2 rounded-full overflow-hidden' },
              div({ className: 'bg-violet-500 h-full transition-all', style: `width: ${renderProgress}%` })
            ),
            createButton('secondary', {
              type: 'button',
              className: 'w-full text-xs py-2 bg-red-600/80 hover:bg-red-600 text-white font-semibold rounded-xl',
              onclick: () => cancelVideoExport()
            }, 'Cancel Rendering')
          ) : createButton('primary', {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-violet-600/20',
            onclick: () => startVideoExport()
          }, 'Start Render Pipeline')
        )
      );
    }

    toolContainer.append(
      div({ className: 'mt-6 border-t border-slate-700/60 pt-4' },
        createDetailPanel('Project Summary', [
          { label: 'Aspect Ratio', value: aspectRatio },
          { label: 'Active Region', value: duration ? `${trimStart.toFixed(1)}s – ${trimEnd.toFixed(1)}s` : '—' },
          { label: 'History Stack', value: `${historyIndex + 1} / ${history.length}` },
        ])
      )
    );
  }

  function handleVideoUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || !target.files[0]) return;

    videoFile = target.files[0];
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(videoFile);

    viewportZoom.zoomLevel = 1;
    viewportZoom.panX = 0;
    viewportZoom.panY = 0;
    videoElement.src = videoUrl;
    videoElement.onloadedmetadata = () => {
      duration = videoElement.duration;
      trimStart = 0;
      trimEnd = duration;
      clipSegments = [{ id: 1, start: 0, end: duration, label: 'Main Clip' }];
      timeDisplay.textContent = `00:00 / ${formatTime(duration)}`;

      videoContainer.innerHTML = '';
      videoContainer.append(maskOverlay, videoElement, captionOverlay);

      generateThumbnailStrip();

      history = [];
      historyIndex = -1;
      pushState();
      updateTrimMarkers();
      applyVideoFilters();
      renderToolControls();
    };

    videoElement.onplay = () => syncPlaybackUI();
    videoElement.onpause = () => syncPlaybackUI();
    videoElement.onended = () => syncPlaybackUI();

    videoElement.ontimeupdate = () => {
      if (isRendering) return;
      currentTime = videoElement.currentTime;
      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      const percent = duration ? (currentTime / duration) * 100 : 0;
      seekSlider.value = percent.toString();
      playheadLine.style.left = `${percent}%`;

      if (trimEnd > 0 && currentTime >= trimEnd) {
        videoElement.currentTime = trimStart;
      }
    };
  }

  function generateThumbnailStrip() {
    thumbnailStrip.innerHTML = '';
    if (!videoUrl || !duration) return;

    const frameCount = 10;
    const canvases: HTMLCanvasElement[] = [];

    for (let index = 0; index < frameCount; index += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      canvas.className = 'h-full w-full border-r border-slate-700/50 bg-slate-900/80 object-cover';
      thumbnailStrip.append(canvas);
      canvases.push(canvas);
    }

    const previewVideo = document.createElement('video');
    previewVideo.src = videoUrl;
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.preload = 'auto';
    previewVideo.crossOrigin = 'anonymous';

    const drawFrame = (canvas: HTMLCanvasElement, seekTime: number) => {
      previewVideo.currentTime = Math.min(Math.max(seekTime, 0), Math.max(0, duration - 0.1));
      const drawSnapshot = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
      };

      previewVideo.onseeked = () => {
        drawSnapshot();
      };
      if (previewVideo.readyState >= 2) {
        drawSnapshot();
      }
    };

    previewVideo.onloadedmetadata = () => {
      canvases.forEach((canvas, index) => {
        const seekTime = (index / Math.max(1, frameCount - 1)) * duration;
        drawFrame(canvas, seekTime);
      });
    };

    previewVideo.load();
  }

  function updateTrimMarkers() {
    if (!duration) return;
    const startPct = (trimStart / duration) * 100;
    const endPct = (trimEnd / duration) * 100;

    trimStartMarker.style.left = `${startPct}%`;
    trimEndMarker.style.left = `${endPct}%`;
    trimActiveZone.style.left = `${startPct}%`;
    trimActiveZone.style.right = `${100 - endPct}%`;
  }

  function clampViewportZoom() {
    const baseWidth = videoElement.offsetWidth || videoContainer.clientWidth || 1;
    const baseHeight = videoElement.offsetHeight || videoContainer.clientHeight || 1;
    const zoomWidth = baseWidth * viewportZoom.zoomLevel;
    const zoomHeight = baseHeight * viewportZoom.zoomLevel;
    const maxPanX = Math.max(0, (zoomWidth - videoContainer.clientWidth) / 2);
    const maxPanY = Math.max(0, (zoomHeight - videoContainer.clientHeight) / 2);

    viewportZoom.panX = Math.min(maxPanX, Math.max(-maxPanX, viewportZoom.panX));
    viewportZoom.panY = Math.min(maxPanY, Math.max(-maxPanY, viewportZoom.panY));
  }

  function zoomViewport(factor: number, x?: number, y?: number) {
    if (!videoElement.src) return;

    const rect = videoContainer.getBoundingClientRect();
    const centerX = typeof x === 'number' ? x : rect.left + rect.width / 2;
    const centerY = typeof y === 'number' ? y : rect.top + rect.height / 2;
    const previousZoom = viewportZoom.zoomLevel;
    const nextZoom = Math.min(4, Math.max(1, previousZoom * factor));

    if (nextZoom === previousZoom) return;

    const offsetX = centerX - (rect.left + rect.width / 2);
    const offsetY = centerY - (rect.top + rect.height / 2);

    viewportZoom.zoomLevel = nextZoom;
    viewportZoom.panX += offsetX * (1 - previousZoom / nextZoom);
    viewportZoom.panY += offsetY * (1 - previousZoom / nextZoom);
    clampViewportZoom();
    applyVideoFilters();
  }

  function clampValue(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function applyMaskOverlay() {
    const visibleMasks = (() => {
      const pending = pendingMask;
      if (!pending) return masks;
      return masks.some((mask) => mask.id === pending.id) ? masks : [...masks, pending];
    })();

    const overlays = visibleMasks.map((mask) => {
      const style: Record<string, string> = {
        position: 'absolute',
        left: `${mask.x}%`,
        top: `${mask.y}%`,
        width: `${Math.max(12, mask.width)}%`,
        height: `${Math.max(12, mask.height)}%`,
        opacity: String(mask.opacity),
        background: `${mask.color}22`,
        border: `2px solid ${mask.color}`,
        borderRadius: mask.type === 'circle' ? '50%' : '12px',
        boxShadow: `0 0 ${mask.blur}px ${mask.color}`,
        filter: `blur(${Math.min(mask.blur, 12)}px)`,
        pointerEvents: 'none',
        transform: 'translate(-50%, -50%)',
      };

      if (mask.type === 'freehand' && mask.points.length > 2) {
        const points = mask.points.map((point) => `${point.x},${point.y}`).join(' ');
        style.clipPath = `polygon(${points})`;
        style.width = '100%';
        style.height = '100%';
        style.left = '50%';
        style.top = '50%';
      }

      const el = div({
        className: 'absolute pointer-events-none',
        style: Object.entries(style).map(([key, value]) => `${key}:${value};`).join(' '),
      });
      return el;
    });

    maskOverlay.innerHTML = '';
    if (!visibleMasks.length) {
      maskOverlay.classList.add('hidden');
      return;
    }

    maskOverlay.classList.remove('hidden');
    overlays.forEach((node) => maskOverlay.append(node));
  }

  function applyVideoFilters() {
    const scaleX = flipH ? -1 : 1;
    const scaleY = flipV ? -1 : 1;
    const zoomScaleX = scaleX * viewportZoom.zoomLevel;
    const zoomScaleY = scaleY * viewportZoom.zoomLevel;

    const exposureBoost = filters.exposure / 100;
    const highlightsBoost = filters.highlights / 100;
    const shadowsBoost = filters.shadows / 100;
    const vignetteAmount = Math.max(0, filters.vignette) / 100;
    const filmGrainAmount = Math.max(0, filters.filmGrain) / 100;
    const fadeAmount = Math.max(0, filters.fade) / 100;

    videoElement.style.filter = `
      brightness(${clampValue(filters.brightness * exposureBoost, 0, 200)}%)
      contrast(${clampValue(filters.contrast * highlightsBoost, 0, 250)}%)
      saturate(${clampValue(filters.saturate * shadowsBoost, 0, 250)}%)
      hue-rotate(${filters.temperature + filters.tint}deg)
      blur(${filters.blur}px)
      grayscale(${filters.grayscale}%)
      sepia(${filters.sepia + filters.fade * 0.2}%)
      drop-shadow(0 0 ${Math.max(0, filters.sharpen)}px rgba(255,255,255,${Math.min(0.6, vignetteAmount)}))
    `.trim();
    videoElement.style.transform = `translate(${viewportZoom.panX}px, ${viewportZoom.panY}px) rotate(${rotation}deg) scale(${zoomScaleX}, ${zoomScaleY})`;

    applyMaskOverlay();

    if (videoElement.parentElement) {
      const overlay = videoElement.parentElement.querySelector('.video-fx-overlay') as HTMLDivElement | null;
      if (overlay) {
        overlay.style.background = `radial-gradient(circle at center, rgba(255,255,255,${Math.min(0.35, fadeAmount)}) 0%, rgba(0,0,0,${Math.min(0.45, filmGrainAmount)}) 60%, rgba(0,0,0,${Math.min(0.7, vignetteAmount)}) 100%)`;
      }
    }
  }

  function updateTransforms() {
    clampViewportZoom();
    applyVideoFilters();
  }

  function togglePlay() {
    if (!videoElement.src) return;

    if (isPlaying) {
      videoElement.pause();
      syncPlaybackUI();
      return;
    }

    const playPromise = videoElement.play();
    if (playPromise) {
      void playPromise.catch(() => {
        syncPlaybackUI();
      });
    }
    syncPlaybackUI();
  }

  function stepFrames(delta: number) {
    if (!videoElement.src) return;
    videoElement.pause();
    syncPlaybackUI();
    const frameDuration = 1 / 30;
    videoElement.currentTime = Math.max(0, Math.min(duration, videoElement.currentTime + delta * frameDuration));
  }

  function setAspectRatio(ratio: typeof aspectRatio) {
    aspectRatio = ratio;
    if (ratio === '16:9') videoElement.style.aspectRatio = '16/9';
    if (ratio === '9:16') videoElement.style.aspectRatio = '9/16';
    if (ratio === '1:1') videoElement.style.aspectRatio = '1/1';
    if (ratio === '4:5') videoElement.style.aspectRatio = '4/5';
    renderToolControls();
  }

  function updateCaptions() {
    const activeCaption = getActiveCaption();
    const resolvedText = activeCaption?.text ?? captionText;

    if (!resolvedText.trim() && !captionSegments.length) {
      captionOverlay.classList.add('hidden');
      return;
    }

    captionOverlay.textContent = resolvedText;
    const styleSource = activeCaption?.style ?? {
      size: captionSize,
      weight: captionWeight,
      background: captionBg,
      shadow: captionShadow,
      x: captionX,
      y: captionY,
    };
    captionOverlay.style.fontSize = `${styleSource.size}px`;
    captionOverlay.style.fontWeight = styleSource.weight;
    captionOverlay.style.backgroundColor = styleSource.background;
    captionOverlay.style.textShadow = styleSource.shadow ? '0 2px 4px rgba(0,0,0,0.8)' : 'none';
    captionOverlay.style.left = `${styleSource.x}%`;
    captionOverlay.style.top = `${styleSource.y}%`;
    captionOverlay.style.transform = 'translate(-50%, -50%)';
    captionOverlay.classList.remove('hidden');
  }

  // Real Export Engine Implementation
  async function startVideoExport() {
    if (!videoFile || !videoUrl) {
      alert('Please import a video before rendering.');
      return;
    }

    isRendering = true;
    renderProgress = 0;
    renderChunks = [];
    renderToolControls();

    if (isPlaying) {
      videoElement.pause();
      isPlaying = false;
      playPauseBtn.textContent = '▶';
    }

    const renderCanvas = document.createElement('canvas');
    let targetWidth = 1920;
    let targetHeight = 1080;

    if (exportResolution === '720p') { targetWidth = 1280; targetHeight = 720; }
    else if (exportResolution === '4k') { targetWidth = 3840; targetHeight = 2160; }

    if (aspectRatio === '9:16') { const temp = targetWidth; targetWidth = targetHeight; targetHeight = temp; }
    else if (aspectRatio === '1:1') { targetWidth = targetHeight; }
    else if (aspectRatio === '4:5') { targetHeight = Math.round(targetWidth * 1.25); }

    renderCanvas.width = targetWidth;
    renderCanvas.height = targetHeight;
    const ctx = renderCanvas.getContext('2d');
    const stream = renderCanvas.captureStream(exportFps);

    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(videoElement);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);
      dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    } catch (err) {
      console.warn('Audio capture stream initialization skipped:', err);
    }

    const supportsWebCodecs = typeof window !== 'undefined' && 'VideoEncoder' in window && 'AudioEncoder' in window;
    if (supportsWebCodecs) {
      const VideoEncoderCtor = (window as typeof window & { VideoEncoder?: typeof VideoEncoder }).VideoEncoder;
      if (VideoEncoderCtor) {
        const encoder = new VideoEncoderCtor({
          output: async (chunk) => {
            const encodedChunk = chunk as any;
            const chunkBuffer = typeof encodedChunk.arrayBuffer === 'function'
              ? await encodedChunk.arrayBuffer()
              : encodedChunk.data ? encodedChunk.data : new Uint8Array();
            renderChunks.push(new Blob([chunkBuffer], { type: 'video/webm' }));
          },
          error: (error) => {
            console.warn('WebCodecs export failed, falling back to MediaRecorder:', error);
          },
        });
        encoder.configure({
          codec: 'vp09.00.10.08',
          width: targetWidth,
          height: targetHeight,
          bitrate: exportBitrate,
          framerate: exportFps,
        });
        const data = new VideoFrame(renderCanvas, { timestamp: 0 });
        encoder.encode(data);
        data.close();
        encoder.flush();
      }
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: exportBitrate });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        renderChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      isRendering = false;
      renderProgress = 100;
      renderToolControls();

      const blob = new Blob(renderChunks, { type: exportFormat === 'mp4' ? 'video/mp4' : 'video/webm' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `rendered-video-${Date.now()}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    videoElement.currentTime = trimStart;
    mediaRecorder.start();
    videoElement.play();

    const checkRenderProgress = () => {
      if (!isRendering) return;
      const current = videoElement.currentTime;
      const totalRange = (trimEnd || duration) - trimStart;
      const progress = Math.min(100, ((current - trimStart) / totalRange) * 100);
      renderProgress = isNaN(progress) ? 0 : progress;
      renderToolControls();

      if (ctx && videoElement.readyState >= 2) {
        ctx.save();
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.filter = videoElement.style.filter;
        ctx.translate(targetWidth / 2, targetHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

        if (activeTransition === 'crossfade' && clipSegments.length > 1) {
          const transitionProgress = Math.min(1, (current - trimStart) / Math.max(0.5, (trimEnd - trimStart) * 0.2));
          ctx.fillStyle = '#000';
          ctx.fillRect(-targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
          ctx.globalAlpha = 1 - transitionProgress;
          ctx.drawImage(videoElement, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
          ctx.globalAlpha = transitionProgress;
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(-targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
        } else {
          ctx.drawImage(videoElement, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
        }
        ctx.restore();

        const activeCaption = getActiveCaption();
        if (activeCaption && activeCaption.text.trim()) {
          const captionStyle = activeCaption.style;
          ctx.font = `${captionStyle.weight} ${Math.max(18, captionStyle.size * (targetWidth / 1280))}px sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(activeCaption.text, (captionStyle.x / 100) * targetWidth, (captionStyle.y / 100) * targetHeight);
        }
      }

      if (current >= (trimEnd || duration) || videoElement.ended) {
        mediaRecorder?.stop();
        videoElement.pause();
        isRendering = false;
        renderToolControls();
        return;
      }

      requestAnimationFrame(checkRenderProgress);
    };

    requestAnimationFrame(checkRenderProgress);
  }

  function cancelVideoExport() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRendering = false;
    renderProgress = 0;
    renderToolControls();
  }

  function switchTab(tab: VideoTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `inline-flex min-w-[70px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[90px] sm:px-3 sm:text-[11px] ${
        isSelected
          ? 'border-slate-100/20 bg-slate-900/60 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`;
    });
    renderToolControls();
  }

  function createSliderControl(title: string, value: number, min: number, max: number, onChange: (val: number) => void) {
    const valDisplay = div({ className: 'text-xs font-mono text-violet-400 font-bold' }, Math.round(value).toString());
    
    return div({ className: 'space-y-1' },
      div({ className: 'flex justify-between items-center' },
        label({ className: 'text-xs font-medium text-slate-300' }, title),
        valDisplay
      ),
      input({
        type: 'range',
        min: min.toString(),
        max: max.toString(),
        value: value.toString(),
        step: '0.1',
        className: 'w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500',
        oninput: (e: Event) => {
          const v = parseFloat((e.target as HTMLInputElement).value);
          valDisplay.textContent = v.toFixed(1);
          onChange(v);
        },
        onchange: () => pushState()
      })
    );
  }

  function createSelectDropdown(options: string[], selected: string, onChange: (val: string) => void) {
    const select = document.createElement('select');
    select.className = 'bg-slate-950 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-500';
    options.forEach(opt => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt.toUpperCase();
      if (opt === selected) optEl.selected = true;
      select.append(optEl);
    });
    select.onchange = (e) => onChange((e.target as HTMLSelectElement).value);
    return select;
  }

  function createPresetButton(name: string, onClick: () => void) {
    return button({
      type: 'button',
      className: 'rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-left text-xs font-medium text-slate-200 hover:border-violet-500 hover:text-white transition-all shadow-sm',
      onclick: onClick
    }, name);
  }

  function createThumbnailPresetCard(name: string, presetValues: Partial<typeof filters>, icon: string) {
    const card = div({
      className: 'flex flex-col items-center justify-center p-3 rounded-xl border border-slate-700 bg-slate-900/70 hover:border-violet-500 hover:bg-slate-900 cursor-pointer transition-all shadow-sm text-center group'
    },
      div({ className: 'text-2xl mb-1 group-hover:scale-110 transition-transform' }, icon),
      p({ className: 'text-xs font-semibold text-slate-200' }, name)
    );

    card.onclick = () => {
      Object.assign(filters, presetValues);
      applyVideoFilters();
      pushState();
      renderToolControls();
    };

    return card;
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function resetEditor() {
    videoElement.pause();
    syncPlaybackUI();
    trimStart = 0;
    trimEnd = duration || 0;
    playbackRate = 1;
    videoElement.playbackRate = 1;
    volume = 1;
    videoElement.volume = 1;
    volumeSlider.value = '1';
    rotation = 0;
    flipH = false;
    flipV = false;
    viewportZoom.zoomLevel = 1;
    viewportZoom.panX = 0;
    viewportZoom.panY = 0;
    captionText = '';
    captionSegments = [];
    clipSegments = duration ? [{ id: 1, start: 0, end: duration, label: 'Main Clip' }] : [];
    masks = [];
    pendingMask = null;
    updateTransforms();
    updateCaptions();
    applyMaskOverlay();
    if (duration) updateTrimMarkers();
    pushState();
    renderToolControls();
  }

  renderToolControls();
  void hydrateProjectState();

  return root;
}