import type {
  AudioTrack,
  CaptionStyle,
  CaptionTrack,
  MaskItem,
  MaskType,
  TimedCaption,
  VideoEditorState,
  VideoFilters,
} from './types';
import { cloneCaptionSegments } from './utils';
import { parseCubeLut } from './rendering';
import { fileToDataUrl } from './storage';
import { button, div, input, label, p, span } from '../../components/ui/dom';

export type VideoEditorPanelsDeps = {
  toolContainer: HTMLElement;
  filters: VideoFilters;
  volume: number;
  setVolume: (next: number) => void;
  audioTracks: AudioTrack[];
  setAudioTracks: (next: AudioTrack[]) => void;
  captionTracks: CaptionTrack[];
  setCaptionTracks: (next: CaptionTrack[]) => void;
  captionSegments: TimedCaption[];
  setCaptionSegments: (next: TimedCaption[]) => void;
  captionText: string;
  setCaptionText: (next: string) => void;
  activeCaptionTrackId: number | null;
  setActiveCaptionTrackId: (next: number | null) => void;
  captionSize: number;
  setCaptionSize: (next: number) => void;
  captionWeight: string;
  setCaptionWeight: (next: string) => void;
  captionBg: string;
  setCaptionBg: (next: string) => void;
  captionShadow: boolean;
  setCaptionShadow: (next: boolean) => void;
  setCaptionX: (next: number) => void;
  setCaptionY: (next: number) => void;
  currentTime: number;
  duration: number;
  rotation: number;
  setRotation: (next: number) => void;
  flipH: boolean;
  setFlipH: (next: boolean) => void;
  flipV: boolean;
  setFlipV: (next: boolean) => void;
  setPreviewQuality: (next: VideoEditorState['previewQuality']) => void;
  activeMaskTool: MaskType;
  setActiveMaskTool: (next: MaskType) => void;
  masks: MaskItem[];
  setMasks: (next: MaskItem[]) => void;
  setPendingMask: (next: MaskItem | null) => void;
  cubeLut: VideoEditorState['cubeLut'];
  setCubeLut: (next: VideoEditorState['cubeLut']) => void;
  setAspectRatio: (next: VideoEditorState['aspectRatio']) => void;
  updateTransforms: () => void;
  getCurrentCaptionStyle: () => CaptionStyle;
  ensureCaptionTrack: () => CaptionTrack;
  syncCurrentCaptionTrack: () => void;
  importSubtitleFile: (file: File) => Promise<void>;
  exportSubtitleFile: () => void;
  pushState: () => void;
  renderToolControls: () => void;
  applyVideoFilters: () => void;
  applyMaskOverlay: () => void;
  updateCaptions: () => void;
  videoElement: HTMLVideoElement;
  volumeSlider: HTMLInputElement;
  setActiveTransition: (next: VideoEditorState['transitionType']) => void;
  setActiveBlendMode: (next: VideoEditorState['blendMode']) => void;
  activeTransition: VideoEditorState['transitionType'];
  activeBlendMode: VideoEditorState['blendMode'];
  exportResolution: '720p' | '1080p' | '4k';
  exportFps: 24 | 30 | 60;
  exportFormat: 'webm' | 'mp4';
  exportBitrate: number;
  setExportResolution: (next: '720p' | '1080p' | '4k') => void;
  setExportFps: (next: 24 | 30 | 60) => void;
  setExportFormat: (next: 'webm' | 'mp4') => void;
  setExportBitrate: (next: number) => void;
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
  createThumbnailPresetCard: (
    name: string,
    presetValues: Partial<VideoFilters>,
    icon: string,
  ) => HTMLElement;
};

export function createVideoEditorPanels(deps: VideoEditorPanelsDeps) {
  const {
    toolContainer,
    filters,
    volume,
    setVolume,
    audioTracks,
    setAudioTracks,
    captionTracks,
    setCaptionTracks,
    captionSegments,
    setCaptionSegments,
    captionText,
    setCaptionText,
    activeCaptionTrackId,
    setActiveCaptionTrackId,
    captionSize,
    setCaptionSize,
    captionWeight,
    setCaptionWeight,
    captionBg,
    setCaptionBg,
    captionShadow,
    setCaptionShadow,
    setCaptionX,
    setCaptionY,
    currentTime,
    duration,
    rotation,
    setRotation,
    flipH,
    setFlipH,
    flipV,
    setFlipV,
    setPreviewQuality,
    activeMaskTool,
    setActiveMaskTool,
    masks,
    setMasks,
    setPendingMask,
    cubeLut,
    setCubeLut,
    setAspectRatio,
    updateTransforms,
    getCurrentCaptionStyle,
    ensureCaptionTrack,
    syncCurrentCaptionTrack,
    importSubtitleFile,
    exportSubtitleFile,
    pushState,
    renderToolControls,
    applyVideoFilters,
    applyMaskOverlay,
    updateCaptions,
    videoElement,
    volumeSlider,
    createSliderControl,
    createSelectDropdown,
    createPresetButton,
    createThumbnailPresetCard,
  } = deps;

  function renderFiltersTab() {
    const presetGrid = div(
      {
        className: 'preset-grid',
      },
      createThumbnailPresetCard('Normal', { exposure: 100, brightness: 100, contrast: 100, saturate: 100, temperature: 0, tint: 0, highlights: 100, shadows: 100, blur: 0, sharpen: 0, grayscale: 0, sepia: 0, vignette: 0, filmGrain: 0, fade: 0 }, '✨'),
      createThumbnailPresetCard('Cinematic', {
        exposure: 105,
        brightness: 90,
        contrast: 130,
        saturate: 115,
        temperature: -10,
        tint: 5,
        highlights: 90,
        shadows: 110,
        blur: 0,
        sharpen: 10,
        grayscale: 0,
        sepia: 0,
        vignette: 20,
        filmGrain: 15,
        fade: 5,
      }, '🎬'),
      createThumbnailPresetCard('Mono Noir', {
        exposure: 100,
        brightness: 105,
        contrast: 140,
        saturate: 0,
        temperature: 0,
        tint: 0,
        highlights: 100,
        shadows: 90,
        blur: 0,
        sharpen: 15,
        grayscale: 100,
        sepia: 0,
        vignette: 30,
        filmGrain: 25,
        fade: 10,
      }, '🎞️'),
      createThumbnailPresetCard('Warm Vintage', {
        exposure: 100,
        brightness: 105,
        contrast: 105,
        saturate: 120,
        temperature: 25,
        tint: 10,
        highlights: 105,
        shadows: 95,
        blur: 0,
        sharpen: 0,
        grayscale: 0,
        sepia: 25,
        vignette: 25,
        filmGrain: 20,
        fade: 15,
      }, '🌅'),
    );

    toolContainer.append(
      p({ className: 'section-title' }, 'One-Click Filter Presets'),
      presetGrid,
      p({ className: 'section-title mt-lg' }, 'Basic Adjustments'),
      createSliderControl('Exposure', filters.exposure, 0, 200, (value) => {
        filters.exposure = value;
        applyVideoFilters();
      }),
      createSliderControl('Brightness', filters.brightness, 0, 200, (value) => {
        filters.brightness = value;
        applyVideoFilters();
      }),
      createSliderControl('Contrast', filters.contrast, 0, 200, (value) => {
        filters.contrast = value;
        applyVideoFilters();
      }),
      createSliderControl('Saturation', filters.saturate, 0, 200, (value) => {
        filters.saturate = value;
        applyVideoFilters();
      }),
      createSliderControl('Temperature', filters.temperature, -50, 50, (value) => {
        filters.temperature = value;
        applyVideoFilters();
      }),
      createSliderControl('Tint', filters.tint, -50, 50, (value) => {
        filters.tint = value;
        applyVideoFilters();
      }),
      createSliderControl('Highlights', filters.highlights, 0, 200, (value) => {
        filters.highlights = value;
        applyVideoFilters();
      }),
      createSliderControl('Shadows', filters.shadows, 0, 200, (value) => {
        filters.shadows = value;
        applyVideoFilters();
      }),
      p({ className: 'section-title mt-lg' }, 'Creative Effects'),
      createSliderControl('Blur (px)', filters.blur, 0, 20, (value) => {
        filters.blur = value;
        applyVideoFilters();
      }),
      createSliderControl('Sharpen', filters.sharpen, 0, 100, (value) => {
        filters.sharpen = value;
        applyVideoFilters();
      }),
      createSliderControl('Grayscale (%)', filters.grayscale, 0, 100, (value) => {
        filters.grayscale = value;
        applyVideoFilters();
      }),
      createSliderControl('Sepia (%)', filters.sepia, 0, 100, (value) => {
        filters.sepia = value;
        applyVideoFilters();
      }),
      createSliderControl('Vignette', filters.vignette, 0, 100, (value) => {
        filters.vignette = value;
        applyVideoFilters();
      }),
      createSliderControl('Film Grain', filters.filmGrain, 0, 100, (value) => {
        filters.filmGrain = value;
        applyVideoFilters();
      }),
      createSliderControl('Fade', filters.fade, 0, 100, (value) => {
        filters.fade = value;
        applyVideoFilters();
      }),
      p({ className: 'helper-text' }, 'Some creative effects are stored as settings but need dedicated shader or canvas implementations for accurate rendering.'),
    );
  }

  function renderTransformTab() {
    const ratioGrid = div(
      { className: 'transform-grid' },
      createPresetButton('16:9 Widescreen', () => {
        setAspectRatio('16:9');
        pushState();
      }),
      createPresetButton('9:16 Vertical / Reels', () => {
        setAspectRatio('9:16');
        pushState();
      }),
      createPresetButton('1:1 Square', () => {
        setAspectRatio('1:1');
        pushState();
      }),
      createPresetButton('4:5 Social Feed', () => {
        setAspectRatio('4:5');
        pushState();
      }),
    );

    const transformGrid = div(
      { className: 'transform-grid mt-sm' },
      createPresetButton('Rotate 90°', () => {
        setRotation((rotation + 90) % 360);
        updateTransforms();
        pushState();
      }),
      createPresetButton('Flip Horizontal', () => {
        setFlipH(!flipH);
        updateTransforms();
        pushState();
      }),
      createPresetButton('Flip Vertical', () => {
        setFlipV(!flipV);
        updateTransforms();
        pushState();
      }),
      createPresetButton('Reset Transforms', () => {
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        updateTransforms();
        pushState();
      }),
    );

    const maskToolGrid = div(
      { className: 'mask-tool-grid' },
      createPresetButton('Circle', () => setActiveMaskTool('circle')),
      createPresetButton('Rectangle', () => setActiveMaskTool('rect')),
      createPresetButton('Freehand', () => setActiveMaskTool('freehand')),
    );

    const lutUploadButton = createPresetButton('Import .cube LUT', () => {
      const filePicker = document.createElement('input');
      filePicker.type = 'file';
      filePicker.accept = '.cube,text/plain';
      filePicker.onchange = async () => {
        const file = filePicker.files?.[0];
        if (!file) return;
        const parsed = parseCubeLut(await file.text());
        if (!parsed) {
          alert('Could not parse a valid 3D LUT. Check the .cube file size and RGB data.');
          return;
        }
        setCubeLut(parsed);
        pushState();
        renderToolControls();
      };
      filePicker.click();
    });

    toolContainer.append(
      p({ className: 'section-title' }, 'Aspect Ratio Presets'),
      ratioGrid,
      p({ className: 'section-title mt-lg' }, 'Rotation & Mirroring'),
      transformGrid,
      p({ className: 'section-title mt-lg' }, 'Shape Masks'),
      maskToolGrid,
      div({ className: 'button-pair-grid' },
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
            blur: 0,
            color: '#a78bfa',
            points: [{ x: 25, y: 20 }, { x: 72, y: 20 }, { x: 72, y: 72 }, { x: 25, y: 72 }],
          };
          setMasks([...masks, newMask]);
          setPendingMask(null);
          applyMaskOverlay();
          pushState();
        }),
        createPresetButton('Clear Masks', () => {
          setMasks([]);
          setPendingMask(null);
          applyMaskOverlay();
          pushState();
        }),
      ),
      p({ className: 'section-title mt-lg' }, '3D LUT Grade'),
      lutUploadButton,
      cubeLut ? div({ className: 'helper-text-light' }, `Loaded LUT: ${cubeLut.size}³`) : div({ className: 'helper-text' }, 'No LUT loaded'),
      p({ className: 'section-title mt-lg' }, 'Preview Quality'),
      div({ className: 'quality-grid' },
        createPresetButton('Full 100%', () => {
          setPreviewQuality('1');
          pushState();
        }),
        createPresetButton('Half 50%', () => {
          setPreviewQuality('0.5');
          pushState();
        }),
        createPresetButton('Quarter 25%', () => {
          setPreviewQuality('0.25');
          pushState();
        }),
      ),
      p({ className: 'helper-text' }, 'LUTs and preview quality are saved in the project. Actual LUT color processing and reduced-resolution decoding need a dedicated preview renderer.'),
    );
  }

  function renderAudioTab() {
    const addAudioTrack = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,video/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const dataUrl = await fileToDataUrl(file);
        setAudioTracks([
          ...audioTracks,
          {
            id: Date.now() + Math.floor(Math.random() * 1000),
            label: file.name.replace(/\.[^.]+$/, ''),
            fileName: file.name,
            dataUrl,
            volume: 1,
            trimStart: 0,
            trimEnd: duration || 0,
            enabled: true,
          },
        ]);
        pushState();
        renderToolControls();
      };
      input.click();
    };

    const trackList = div(
      {
        className: 'audio-track-list',
      },
      ...audioTracks.map((track) => div(
        {
          className: 'audio-track-card',
        },
        div(
          {
            className: 'audio-track-header',
          },
          span({ className: 'audio-track-label' }, track.label),
          button(
            {
              type: 'button',
              className: 'remove-track-btn',
              onclick: () => {
                setAudioTracks(audioTracks.filter((item) => item.id !== track.id));
                pushState();
                renderToolControls();
              },
            },
            'Remove',
          ),
        ),
        createSliderControl('Level (%)', track.volume * 100, 0, 200, (value) => {
          const nextTrack = audioTracks.find((item) => item.id === track.id);
          if (!nextTrack) return;
          nextTrack.volume = Math.max(0, Math.min(2, value / 100));
          pushState();
        }),
      )),
    );

    toolContainer.append(
      p({ className: 'section-title' }, 'Master Audio Controls'),
      createSliderControl('Volume (%)', volume * 100, 0, 100, (value) => {
        setVolume(value / 100);
        videoElement.volume = value / 100;
        volumeSlider.value = String(value / 100);
      }),
      div({ className: 'button-pair-grid' },
        createPresetButton('Mute Audio', () => {
          setVolume(0);
          videoElement.volume = 0;
          volumeSlider.value = '0';
          pushState();
          renderToolControls();
        }),
        createPresetButton('Full Volume', () => {
          setVolume(1);
          videoElement.volume = 1;
          volumeSlider.value = '1';
          pushState();
          renderToolControls();
        }),
      ),
      div({ className: 'audio-layers-section' },
        p({ className: 'section-title' }, 'Audio Layers'),
        createPresetButton('Add Audio Track', addAudioTrack),
        audioTracks.length ? trackList : null,
      ),
    );
  }

  function renderCaptionsTab() {
    const captionTrackOptions = captionTracks.map((track) => track.label);
    const selectedCaptionTrack =
      captionTracks.find((track) => track.id === activeCaptionTrackId) ?? captionTracks[0] ?? null;

    if (!selectedCaptionTrack) {
      setCaptionTracks([
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          label: 'Primary Captions',
          color: '#a78bfa',
          enabled: true,
          segments: cloneCaptionSegments(captionSegments),
        },
      ]);
    }

    const activeTrack =
      captionTracks.find((track) => track.id === activeCaptionTrackId) ?? captionTracks[0];

    if (activeTrack) {
      setActiveCaptionTrackId(activeTrack.id);
      setCaptionSegments(cloneCaptionSegments(activeTrack.segments));
    }

    const textInput = input({
      type: 'text',
      placeholder: 'Subtitle / caption text...',
      value: captionText,
      className: 'caption-text-input',
      oninput: (event: Event) => {
        setCaptionText((event.target as HTMLInputElement).value);
        updateCaptions();
      },
      onchange: () => {
        syncCurrentCaptionTrack();
        pushState();
      },
    });

    const weightDropdown = createSelectDropdown(['400', '500', '600', '700', '800', '900'], captionWeight, (value) => {
      setCaptionWeight(value);
      updateCaptions();
      pushState();
    });

    const backgroundDropdown = createSelectDropdown([
      'transparent',
      'rgba(0,0,0,0.4)',
      'rgba(0,0,0,0.6)',
      'rgba(0,0,0,0.8)',
      'rgba(255,255,255,0.6)',
    ], captionBg, (value) => {
      setCaptionBg(value);
      updateCaptions();
      pushState();
    });

    const trackDropdown = createSelectDropdown(
      captionTrackOptions.length ? captionTrackOptions : ['Primary Captions'],
      activeTrack?.label ?? 'Primary Captions',
      (value) => {
        const chosenTrack = captionTracks.find((track) => track.label === value);
        if (!chosenTrack) return;
        setActiveCaptionTrackId(chosenTrack.id);
        setCaptionSegments(cloneCaptionSegments(chosenTrack.segments));
        setCaptionText(chosenTrack.segments[0]?.text ?? captionText);
        updateCaptions();
        renderToolControls();
      },
    );

    toolContainer.append(
      p({ className: 'section-title' }, 'Timed Subtitles & Overlay Text'),
      div({ className: 'caption-container' },
        div({ className: 'caption-field-group' },
          label({ className: 'caption-label' }, 'Active Caption Track'),
          trackDropdown,
        ),
        div({ className: 'button-pair-grid' },
          createPresetButton('New Track', () => {
            const nextId = Date.now() + Math.floor(Math.random() * 1000);
            const newTrack: CaptionTrack = {
              id: nextId,
              label: `Captions ${captionTracks.length + 1}`,
              color: '#c084fc',
              enabled: true,
              segments: [],
            };
            setCaptionTracks([...captionTracks, newTrack]);
            setActiveCaptionTrackId(nextId);
            setCaptionSegments([]);
            setCaptionText('');
            updateCaptions();
            pushState();
            renderToolControls();
          }),
          createPresetButton('Remove Track', () => {
            if (captionTracks.length <= 1) {
              setCaptionSegments([]);
              setCaptionText('');
              const current = captionTracks[0];
              if (current) current.segments = [];
              updateCaptions();
              pushState();
              renderToolControls();
              return;
            }
            const nextTracks = captionTracks.filter((track) => track.id !== activeCaptionTrackId);
            setCaptionTracks(nextTracks);
            setActiveCaptionTrackId(nextTracks[0].id);
            setCaptionSegments(cloneCaptionSegments(nextTracks[0].segments));
            setCaptionText(nextTracks[0].segments[0]?.text ?? '');
            updateCaptions();
            pushState();
            renderToolControls();
          }),
        ),
        div({},
          label({ className: 'caption-label' }, 'Caption Content'),
          textInput,
        ),
        createSliderControl('Font Size (px)', captionSize, 12, 64, (value) => {
          setCaptionSize(value);
          updateCaptions();
        }),
        div({ className: 'caption-field-group' },
          label({ className: 'caption-label' }, 'Font Weight'),
          weightDropdown,
        ),
        div({ className: 'caption-field-group' },
          label({ className: 'caption-label' }, 'Caption Background'),
          backgroundDropdown,
        ),
        div({ className: 'button-pair-grid' },
          createPresetButton('Toggle Shadow', () => {
            setCaptionShadow(!captionShadow);
            updateCaptions();
            pushState();
          }),
          createPresetButton('Center Position', () => {
            setCaptionX(50);
            setCaptionY(85);
            updateCaptions();
            pushState();
          }),
        ),
        div({ className: 'button-pair-grid' },
          createPresetButton('Add Timed Cue', () => {
            const start = Math.max(0, currentTime);
            const end = Math.min(duration || start + 3, start + 3);
            if (end <= start) {
              alert('Move the playhead earlier to create a timed cue.');
              return;
            }
            const track = ensureCaptionTrack();
            const cue: TimedCaption = {
              id: Math.max(0, ...track.segments.map((segment) => segment.id)) + 1,
              start,
              end,
              text: captionText || 'New caption',
              style: getCurrentCaptionStyle(),
            };
            track.segments.push(cue);
            track.segments.sort((a, b) => a.start - b.start);
            setCaptionSegments(cloneCaptionSegments(track.segments));
            updateCaptions();
            pushState();
            renderToolControls();
          }),
          createPresetButton('Clear Cues', () => {
            const track = ensureCaptionTrack();
            track.segments = [];
            setCaptionSegments([]);
            setCaptionText('');
            updateCaptions();
            pushState();
            renderToolControls();
          }),
        ),
        div({ className: 'button-pair-grid' },
          createPresetButton('Import SRT/VTT', () => {
            const filePicker = document.createElement('input');
            filePicker.type = 'file';
            filePicker.accept = '.srt,.vtt,text/plain';
            filePicker.onchange = async () => {
              const file = filePicker.files?.[0];
              if (file) {
                await importSubtitleFile(file);
              }
            };
            filePicker.click();
          }),
          createPresetButton('Export .SRT', exportSubtitleFile),
        ),
      ),
    );
  }

  return {
    renderFiltersTab,
    renderTransformTab,
    renderAudioTab,
    renderCaptionsTab,
  };
}