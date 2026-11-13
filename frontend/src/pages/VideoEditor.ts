import { button, createButton, div, input, label, p, svgElement } from '../components/ui/dom';
import { createDetailPanel, createEditorFooter, createEditorTitleRow } from './shared';

type VideoTab = 'timeline' | 'filters' | 'transform' | 'audio' | 'captions' | 'export';

export async function createVideoEditorPage(): Promise<HTMLElement> {
  // State Management
  let videoFile: File | null = null;
  let videoUrl: string | null = null;
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;
  let activeTab: VideoTab = 'timeline';

  // Clip Edit State
  let trimStart = 0;
  let trimEnd = 0;
  let playbackRate = 1;
  let aspectRatio: '16:9' | '9:16' | '1:1' | '4:5' = '16:9';
  let captionText = '';
  let captionColor = '#ffffff';

  const filters = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    blur: 0,
    grayscale: 0,
    sepia: 0,
  };

  const root = div({
    className: 'min-h-screen bg-[#edf0f1] p-2 sm:p-8 lg:p-10 flex items-center justify-center'
  });

  const modal = div({
    className: 'w-full max-w-[980px] rounded-[28px] border border-slate-700/70 bg-[#536d7b] shadow-[0_25px_60px_rgba(15,23,42,0.2)] overflow-hidden'
  });

  const fileInput = input({
    type: 'file',
    accept: 'video/*',
    className: 'sr-only',
    onchange: (e: Event) => handleVideoUpload(e)
  });

  const quickActions = div({ className: 'flex flex-wrap justify-end gap-2 sm:gap-3' },
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
    'Edit your video',
    () => resetEditor(),
    () => toggleEditorFullscreen()
  );

  const sidePanelNav = div({ className: 'flex flex-wrap gap-2 px-3 pb-2 sm:gap-3 sm:px-5' });
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
      className: `editor-tab inline-flex min-w-[78px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[120px] sm:px-3 sm:text-[11px] ${
        activeTab === tab.id
          ? 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`,
      onclick: () => switchTab(tab.id)
    }, tab.label);
    sidePanelNav.append(btn);
  });

  const sidePanel = div({ className: 'w-full shrink-0 rounded-[18px] border border-white/5 bg-[#49677a]/60 p-3 md:w-[270px]' },
    toolContainer
  );

  const stage = div({ className: 'relative flex flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-800/50 bg-[#4f6675] p-2 min-h-0 sm:p-4' },
    div({ className: 'mb-2 flex justify-end sm:mb-3' }, quickActions)
  );

  // HTML5 Video Element & Overlay
  const videoElement = document.createElement('video');
  videoElement.className = 'max-h-full max-w-full object-contain rounded-lg shadow-2xl block transition-all duration-75';
  videoElement.playsInline = true;

  const captionOverlay = div({ className: 'absolute bottom-8 left-1/2 -translate-x-1/2 text-center pointer-events-none transition-all px-4 py-1 rounded bg-black/50 backdrop-blur-xs hidden z-10' });

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

  const emptyState = div({ className: 'flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 transition-all cursor-pointer' },
    div({ className: 'mb-3 rounded-2xl bg-slate-800/80 p-4 text-violet-400 border border-slate-700/50' },
      uploadIcon
    ),
    p({ className: 'text-sm font-semibold text-slate-200' }, 'Drop video clip here or click to import'),
    p({ className: 'mt-1 text-xs text-slate-500' }, 'Supports MP4, WebM, MOV, AVI')
  );

  emptyState.onclick = () => fileInput.click();

  const videoContainer = div({ className: 'relative flex-1 flex items-center justify-center bg-slate-950 p-2 overflow-hidden min-h-0 sm:p-6' },
    emptyState
  );

  // Video Control HUD Bar
  const playPauseBtn = button({
    type: 'button',
    className: 'text-white hover:text-violet-400 font-bold px-2 py-1',
    onclick: togglePlay
  }, '▶');

  const timeDisplay = div({ className: 'min-w-0 flex-shrink-0 font-mono text-[11px] text-slate-300 text-center sm:min-w-[90px]' }, '00:00 / 00:00');

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
    }
  });

  const playerHud = div({ className: 'flex flex-col gap-2 border-t border-slate-800/80 bg-slate-900/90 p-3 backdrop-blur-md z-10 sm:h-12 sm:flex-row sm:items-center sm:gap-3 sm:px-5' },
    div({ className: 'flex items-center gap-2' },
      playPauseBtn,
      timeDisplay
    ),
    seekSlider,
    div({ className: 'flex items-center gap-1.5 text-xs text-slate-400 sm:ml-2' },
      '🔊',
      volumeSlider
    )
  );

  // Bottom Interactive Timeline Panel
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

  const videoTrackSegment = div({ className: 'relative h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center px-3 text-xs text-slate-300 font-medium overflow-hidden shadow-inner select-none' },
    trimStartMarker,
    trimActiveZone,
    trimEndMarker,
    div({ className: 'truncate z-0 text-slate-400 text-[11px]' }, 'Video Track • Active Cut Region')
  );

  const audioTrackSegment = div({ className: 'relative h-8 rounded-lg bg-cyan-950/40 border border-cyan-800/40 flex items-center px-3 text-xs text-cyan-300 font-medium overflow-hidden shadow-inner select-none' },
    div({ className: 'truncate text-[11px]' }, 'Audio Track • Stereo Mix')
  );

  const timelineRuler = div({ className: 'h-6 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between gap-2 px-3 text-[10px] font-mono text-slate-500 select-none sm:px-4' },
    div({}, '00:00'),
    div({}, '00:15'),
    div({}, '00:30'),
    div({}, '00:45'),
    div({}, '01:00')
  );

  const timelineTrackArea = div({
    className: 'relative flex-1 p-3 space-y-2 overflow-y-auto cursor-pointer bg-slate-900/50',
    onclick: (e: MouseEvent) => {
      const rect = timelineTrackArea.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      if (videoElement.duration) {
        videoElement.currentTime = ratio * videoElement.duration;
      }
    }
  },
    playheadLine,
    videoTrackSegment,
    audioTrackSegment
  );

  const timelineContainer = div({ className: 'h-48 shrink-0 flex flex-col border-t border-slate-800/80 bg-slate-900/80 overflow-hidden' },
    timelineRuler,
    timelineTrackArea
  );

  stage.append(videoContainer, playerHud, timelineContainer);

  const workspace = div({ className: 'flex flex-col gap-3 px-2 pb-3 sm:flex-row sm:gap-5 sm:px-5 sm:pb-5' }, sidePanel, stage);
  const modalFooter = createEditorFooter(() => resetEditor(), () => triggerRenderExport());

  const modalWrap = div({ className: 'w-full' }, titleRow, sidePanelNav, workspace, modalFooter);
  modal.append(modalWrap);
  root.append(modal);

  const updateFullscreenButton = () => {
    fullscreenButton.textContent = document.fullscreenElement === modal ? '⤡' : '⤢';
  };

  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();

  function toggleEditorFullscreen() {
    if (!document.fullscreenEnabled) return;

    if (document.fullscreenElement === modal) {
      void document.exitFullscreen();
      return;
    }

    void modal.requestFullscreen();
  }

  // Dynamic Inspector Panels
  function renderToolControls() {
    toolContainer.innerHTML = '';

    if (activeTab === 'timeline') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Timeline Trim Markers (Sec)'),
        createSliderControl('Start Marker', trimStart, 0, Math.max(1, duration), (v) => {
          trimStart = Math.min(v, (trimEnd || duration) - 0.5);
          updateTrimMarkers();
          if (videoElement.currentTime < trimStart) videoElement.currentTime = trimStart;
        }),
        createSliderControl('End Marker', trimEnd || duration, 0, Math.max(1, duration), (v) => {
          trimEnd = Math.max(v, trimStart + 0.5);
          updateTrimMarkers();
        }),
        createSliderControl('Playback Speed', playbackRate, 0.25, 2, (v) => {
          playbackRate = v;
          videoElement.playbackRate = v;
        }),
        div({ className: 'pt-2 grid grid-cols-2 gap-2.5' },
          createPresetButton('Set Start Here', () => {
            trimStart = videoElement.currentTime;
            updateTrimMarkers();
            renderToolControls();
          }),
          createPresetButton('Set End Here', () => {
            trimEnd = videoElement.currentTime;
            updateTrimMarkers();
            renderToolControls();
          }),
          createPresetButton('Reset Markers', () => {
            trimStart = 0;
            trimEnd = duration;
            playbackRate = 1;
            videoElement.playbackRate = 1;
            updateTrimMarkers();
            renderToolControls();
          })
        )
      );
    } else if (activeTab === 'filters') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Video Color & Visual Effects'),
        createSliderControl('Brightness', filters.brightness, 0, 200, (v) => { filters.brightness = v; applyVideoFilters(); }),
        createSliderControl('Contrast', filters.contrast, 0, 200, (v) => { filters.contrast = v; applyVideoFilters(); }),
        createSliderControl('Saturation', filters.saturate, 0, 200, (v) => { filters.saturate = v; applyVideoFilters(); }),
        createSliderControl('Blur', filters.blur, 0, 20, (v) => { filters.blur = v; applyVideoFilters(); }),
        createSliderControl('Grayscale', filters.grayscale, 0, 100, (v) => { filters.grayscale = v; applyVideoFilters(); }),
        createSliderControl('Sepia', filters.sepia, 0, 100, (v) => { filters.sepia = v; applyVideoFilters(); }),
        div({ className: 'pt-2' },
          createPresetButton('Reset All Filters', () => {
            filters.brightness = 100;
            filters.contrast = 100;
            filters.saturate = 100;
            filters.blur = 0;
            filters.grayscale = 0;
            filters.sepia = 0;
            applyVideoFilters();
            renderToolControls();
          })
        )
      );
    } else if (activeTab === 'transform') {
      const ratioGrid = div({ className: 'grid grid-cols-2 gap-2.5' },
        createPresetButton('16:9 Widescreen', () => setAspectRatio('16:9')),
        createPresetButton('9:16 Vertical/Reels', () => setAspectRatio('9:16')),
        createPresetButton('1:1 Square', () => setAspectRatio('1:1')),
        createPresetButton('4:5 Social Feed', () => setAspectRatio('4:5'))
      );
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Video Aspect Ratio Presets'),
        ratioGrid
      );
    } else if (activeTab === 'audio') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Audio Controls'),
        createSliderControl('Master Volume', volume * 100, 0, 100, (v) => {
          volume = v / 100;
          videoElement.volume = volume;
          volumeSlider.value = volume.toString();
        }),
        div({ className: 'pt-2 grid grid-cols-2 gap-2.5' },
          createPresetButton('Mute Audio', () => {
            volume = 0;
            videoElement.volume = 0;
            volumeSlider.value = '0';
          }),
          createPresetButton('Full Volume', () => {
            volume = 1;
            videoElement.volume = 1;
            volumeSlider.value = '1';
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
        }
      });

      toolContainer.append(
        div({ className: 'space-y-4' },
          div({},
            label({ className: 'block text-xs font-medium text-slate-400 mb-1' }, 'Subtitles Overlay'),
            textInput
          )
        )
      );
    } else if (activeTab === 'export') {
      toolContainer.append(
        p({ className: 'text-xs font-semibold text-slate-300 mb-2' }, 'Export Settings'),
        div({ className: 'space-y-3' },
          div({ className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs space-y-2' },
            div({ className: 'flex justify-between' }, span('Format'), span('MP4 (H.264 / AAC)')),
            div({ className: 'flex justify-between' }, span('Resolution'), span(getResolutionByAspect(aspectRatio))),
            div({ className: 'flex justify-between' }, span('Trim Duration'), span(`${(trimEnd - trimStart).toFixed(1)}s`))
          ),
          createButton('primary', {
            type: 'button',
            className: 'w-full text-xs py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-violet-600/20',
            onclick: () => triggerRenderExport()
          }, 'Start Render Pipeline')
        )
      );
    }

    toolContainer.append(
      div({ className: 'mt-6 border-t border-slate-800 pt-5' },
        createDetailPanel('Project summary', [
          { label: 'Aspect ratio', value: aspectRatio },
          { label: 'Active Region', value: duration ? `${trimStart.toFixed(1)}s – ${trimEnd.toFixed(1)}s` : '—' },
          { label: 'Filters', value: filters.grayscale > 0 || filters.blur > 0 ? 'Active' : 'Normal' },
        ])
      )
    );
  }

  // File Upload
  function handleVideoUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || !target.files[0]) return;

    videoFile = target.files[0];
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(videoFile);

    videoElement.src = videoUrl;
    videoElement.onloadedmetadata = () => {
      duration = videoElement.duration;
      trimStart = 0;
      trimEnd = duration;
      timeDisplay.textContent = `00:00 / ${formatTime(duration)}`;

      videoContainer.innerHTML = '';
      videoContainer.append(videoElement, captionOverlay);

      updateTrimMarkers();
      applyVideoFilters();
      renderToolControls();
    };

    videoElement.ontimeupdate = () => {
      currentTime = videoElement.currentTime;
      timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      const percent = (currentTime / duration) * 100;
      seekSlider.value = percent.toString();
      playheadLine.style.left = `${percent}%`;

      if (trimEnd > 0 && currentTime >= trimEnd) {
        videoElement.currentTime = trimStart;
      }
    };
  }

  // Update Visual Crop/Trim Markers on Timeline Track
  function updateTrimMarkers() {
    if (!duration) return;
    const startPct = (trimStart / duration) * 100;
    const endPct = (trimEnd / duration) * 100;

    trimStartMarker.style.left = `${startPct}%`;
    trimEndMarker.style.left = `${endPct}%`;
    trimActiveZone.style.left = `${startPct}%`;
    trimActiveZone.style.right = `${100 - endPct}%`;
  }

  // CSS Filter Pipeline applied dynamically to <video>
  function applyVideoFilters() {
    videoElement.style.filter = `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturate}%)
      blur(${filters.blur}px)
      grayscale(${filters.grayscale}%)
      sepia(${filters.sepia}%)
    `.trim();
  }

  // Media Controls
  function togglePlay() {
    if (!videoElement.src) return;
    if (isPlaying) {
      videoElement.pause();
      playPauseBtn.textContent = '▶';
    } else {
      videoElement.play();
      playPauseBtn.textContent = '⏸';
    }
    isPlaying = !isPlaying;
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
    if (!captionText.trim()) {
      captionOverlay.classList.add('hidden');
    } else {
      captionOverlay.textContent = captionText;
      captionOverlay.style.color = captionColor;
      captionOverlay.classList.remove('hidden');
    }
  }

  function triggerRenderExport() {
    if (!videoFile) return;
    alert(`Rendering project at ${getResolutionByAspect(aspectRatio)} (${aspectRatio}) format...`);
  }

  function switchTab(tab: VideoTab) {
    activeTab = tab;
    sidePanelNav.querySelectorAll('button').forEach((btn, idx) => {
      const isSelected = tabs[idx].id === tab;
      btn.className = `inline-flex min-w-[78px] flex-1 items-center justify-center rounded-xl border px-2 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-colors sm:min-w-[120px] sm:px-3 sm:text-[11px] ${
        isSelected
          ? 'border-slate-100/20 bg-slate-900/40 text-slate-50 shadow-inner'
          : 'border-transparent bg-transparent text-slate-300 hover:text-slate-100'
      }`;
    });
    renderToolControls();
  }

  // Helpers
  function createSliderControl(title: string, value: number, min: number, max: number, onChange: (val: number) => void) {
    const valDisplay = div({ className: 'text-xs font-mono text-violet-400' }, Math.round(value).toString());
    
    return div({ className: 'space-y-1.5' },
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
        }
      })
    );
  }

  function createPresetButton(name: string, onClick: () => void) {
    return button({
      type: 'button',
      className: 'rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-left text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-all shadow-sm',
      onclick: onClick
    }, name);
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function getResolutionByAspect(ratio: typeof aspectRatio): string {
    if (ratio === '9:16') return '1080 × 1920 (Vertical)';
    if (ratio === '1:1') return '1080 × 1080 (Square)';
    if (ratio === '4:5') return '1080 × 1350 (Social)';
    return '1920 × 1080 (Full HD)';
  }

  function span(text: string) {
    const s = document.createElement('span');
    s.textContent = text;
    return s;
  }

  function resetEditor() {
    videoElement.pause();
    isPlaying = false;
    playPauseBtn.textContent = '▶';
    trimStart = 0;
    trimEnd = duration || 0;
    playbackRate = 1;
    if (videoElement) videoElement.playbackRate = 1;
    volume = 1;
    if (videoElement) videoElement.volume = 1;
    captionText = '';
    captionColor = '#ffffff';
    updateCaptions();
    if (duration) updateTrimMarkers();
    renderToolControls();
  }

  renderToolControls();

  return root;
}