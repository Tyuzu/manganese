import { bindEditorFullscreenButton, createEditorShell } from './shared';

type Tab = 'adjust' | 'curves' | 'filters' | 'crop' | 'transform' | 'text' | 'brush' | 'layers' | 'export';
type ExportFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'tiff' | 'svg' | 'pdf';

type FilterState = {
  brightness: number; contrast: number; saturate: number; temperature: number;
  exposure: number; highlights: number; shadows: number; whites: number; blacks: number;
  grayscale: number; sepia: number; vignette: number; grain: number; blur: number;
};
type TextLayer = {
  id: string; type: 'text'; name: string; content: string; x: number; y: number;
  fontSize: number; color: string; fontFamily: string; opacity: number;
  rotation: number; visible: boolean;
};
type Layer = TextLayer | { id: string; type: 'image' | 'mask'; name: string; visible: boolean };
type RetouchStroke = { mode:'smudge'|'liquify'; points:{x:number;y:number}[]; size:number };
type Snapshot = {
  retouch: RetouchStroke[]; perspectiveX:number; perspectiveY:number; cropShape:'rect'|'ellipse'; filters: FilterState; rotation: number; flipH: boolean; flipV: boolean;
  crop: { x: number; y: number; width: number; height: number };
  texts: TextLayer[]; activeLayerId: string | null; mask: string;
};

const DEFAULT_FILTERS: FilterState = {
  brightness: 100, contrast: 100, saturate: 100, temperature: 0,
  exposure: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  grayscale: 0, sepia: 0, vignette: 0, grain: 0, blur: 0,
};

const WORKER_SOURCE = `
self.onmessage = ({data}) => {
  const {buffer,width,height,filters,maskBuffer,selective} = data;
  const pixels = new Uint8ClampedArray(buffer);
  const mask = maskBuffer ? new Uint8ClampedArray(maskBuffer) : null;
  const exposure = Math.pow(2, filters.exposure / 100);
  const contrast = filters.contrast / 100;
  const saturation = filters.saturate / 100;
  const temperature = filters.temperature * 0.65;
  const amount = selective ? selective.amount / 100 : 0;
  const clamp = v => Math.max(0, Math.min(255, v));
  for (let i=0, p=0; i<pixels.length; i+=4, p++) {
    const m = mask ? (mask[p*4+3] / 255) * amount : 0;
    const local = (base, target) => base + (target-base)*m;
    let r=pixels[i], g=pixels[i+1], b=pixels[i+2];
    const lum=(r+g+b)/3;
    const lift = (v) => {
      let x = v * exposure;
      x = (x - 128) * contrast + 128;
      x += filters.brightness - 100;
      x += filters.blacks * 0.45;
      x += filters.shadows * Math.max(0, (128-v)/128);
      x += filters.highlights * Math.max(0, (v-128)/127);
      x += filters.whites * Math.max(0, (v-190)/65);
      return x;
    };
    let nr=lift(r), ng=lift(g), nb=lift(b);
    nr += temperature; nb -= temperature;
    const gray=0.2126*nr+0.7152*ng+0.0722*nb;
    nr=gray+(nr-gray)*saturation; ng=gray+(ng-gray)*saturation; nb=gray+(nb-gray)*saturation;
    const gray2=0.299*nr+0.587*ng+0.114*nb;
    nr=nr+(gray2-nr)*(filters.grayscale/100);
    ng=ng+(gray2-ng)*(filters.grayscale/100);
    nb=nb+(gray2-nb)*(filters.grayscale/100);
    const sep=filters.sepia/100;
    const sr=0.393*nr+0.769*ng+0.189*nb;
    const sg=0.349*nr+0.686*ng+0.168*nb;
    const sb=0.272*nr+0.534*ng+0.131*nb;
    nr=nr+(sr-nr)*sep; ng=ng+(sg-ng)*sep; nb=nb+(sb-nb)*sep;
    if (m) {
      const baseR=nr, baseG=ng, baseB=nb;
      if (selective.mode==='saturate' || selective.mode==='desaturate') {
        const s=selective.mode==='saturate'?1.65:0.35;
        const y=0.299*nr+0.587*ng+0.114*nb;
        nr=y+(nr-y)*s; ng=y+(ng-y)*s; nb=y+(nb-y)*s;
      } else { const f=selective.mode==='brighten'?1.25:selective.mode==='dodge'?1.38:selective.mode==='burn'?0.62:0.72; nr*=f; ng*=f; nb*=f; }
      nr=baseR+(nr-baseR)*m; ng=baseG+(ng-baseG)*m; nb=baseB+(nb-baseB)*m;
    }
    pixels[i]=clamp(nr); pixels[i+1]=clamp(ng); pixels[i+2]=clamp(nb);
  }
  self.postMessage({id:data.id,buffer:pixels.buffer}, [pixels.buffer]);
};`;

export async function createImageEditorPage(): Promise<HTMLElement> {
  let sourceImage: HTMLImageElement | null = null;
  let sourceUrl: string | null = null;
  let activeTab: Tab = 'adjust';
  let zoom = 1;
  let rotation = 0;
  let flipH = false;
  let flipV = false;
  let showingOriginal = false;
  let isDraggingCrop = false;
  let isDraggingText = false;
  let dragStart = { x: 0, y: 0, cropX: 0, cropY: 0, textX: 0, textY: 0 };
  let crop = { x: 0, y: 0, width: 1, height: 1 };
  let cropRatio: number | null = null;
  let cropShape: 'rect' | 'ellipse' = 'rect';
  let cropDragMode: 'new' | 'move' | 'nw' | 'ne' | 'sw' | 'se' = 'new';
  let perspectiveX = 0; let perspectiveY = 0;
  let exportWatermark = ''; let exportMetadata = 'remove'; let exportScale = 1;
  let exportDimensions: {width:number;height:number}|null = null; let exportFormat: ExportFormat = 'png';
  let exportQueue: {id:string;name:string;status:'queued'|'done'|'error';detail?:string;file?:File}[] = [];
  let documentName = 'Untitled image';
  const openDocuments = new Map<string,{id:string;name:string;file:File;filters:FilterState;crop:{x:number;y:number;width:number;height:number};rotation:number;flipH:boolean;flipV:boolean;texts:TextLayer[]}>();
  let currentDocumentId: string | null = null;
  let autosaveTimer: number | undefined;
  const autosaveKey = 'image-studio-pro-autosave-v3';
  let filters: FilterState = { ...DEFAULT_FILTERS };
  let texts: TextLayer[] = [];
  let activeLayerId: string | null = null;
  let brushSize = 48;
  let brushMode: 'brighten' | 'darken' | 'dodge' | 'burn' | 'saturate' | 'desaturate' | 'smudge' | 'liquify' = 'brighten';
  let brushAmount = 55;
  let retouchStrokes: RetouchStroke[] = [];
  let activeRetouch: RetouchStroke | null = null;
  let isPainting = false;
  let history: Snapshot[] = [];
  let historyIndex = -1;
  let renderVersion = 0;
  let workerRequestId = 0;
  let worker: Worker | null = null;
  let workerUrl: string | null = null;
  let maskCanvas = document.createElement('canvas');
  let maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  let originalBefore: HTMLCanvasElement | null = null;
  const presetsKey = 'image-studio-pro-presets-v2';

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node;
  };
  const action = (caption: string, fn: () => void, cls = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700') => {
    const b = el('button', cls, caption); b.type = 'button'; b.onclick = fn; return b;
  };
  const fieldLabel = (name: string, value: number, min: number, max: number, step: number, change: (n: number) => void) => {
    const wrap = el('div', 'space-y-1.5');
    const head = el('div', 'flex items-center justify-between'); head.append(el('label', 'text-xs text-slate-300', name), el('span', 'text-[11px] font-mono text-sky-400', String(value)));
    const range = el('input', 'w-full accent-sky-500'); range.type = 'range'; range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(value);
    range.oninput = () => { const n = Number(range.value); head.lastElementChild!.textContent = String(n); change(n); };
    range.onchange = () => commit(); wrap.append(head, range); return wrap;
  };
  const select = (items: string[], value: string, onChange: (v: string) => void) => {
    const s = el('select', 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200');
    items.forEach(v => { const o = el('option', '', v); o.value = v; s.append(o); }); s.value = value; s.onchange = () => onChange(s.value); return s;
  };
  const upload = el('input', 'hidden'); upload.type = 'file'; upload.accept = 'image/*';
  const panel = el('aside', 'w-full shrink-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 md:w-[300px]');
  const panelContent = el('div', 'space-y-4'); panel.append(panelContent);
  const canvas = el('canvas', 'max-h-full max-w-full rounded-lg shadow-2xl');
  const overlay = el('canvas', 'absolute inset-0 m-auto max-h-full max-w-full pointer-events-none');
  const viewport = el('main', 'relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#090d16] p-4');
  const stage = el('div', 'relative flex h-full w-full items-center justify-center'); stage.append(canvas, overlay); viewport.append(stage);
  const empty = el('div', 'flex max-w-sm cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/60 p-12 text-center');
  empty.append(el('div', 'text-4xl', '▧'), el('p', 'text-sm font-semibold text-slate-100', 'Drop an image here or browse'), el('p', 'text-xs text-slate-400', 'PNG, JPG, WebP, AVIF and SVG')); viewport.append(empty); empty.onclick = () => upload.click();
  const tabs: { id: Tab; label: string }[] = [
    { id: 'adjust', label: 'Adjust' }, { id: 'curves', label: 'Tone & RGB' }, { id: 'filters', label: 'Presets' },
    { id: 'crop', label: 'Crop' }, { id: 'transform', label: 'Transform' }, { id: 'brush', label: 'Brush' },
    { id: 'text', label: 'Text' }, { id: 'layers', label: 'Layers' }, { id: 'export', label: 'Export' },
  ];
  const nav = el('nav', 'flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950/80 p-2');
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  const topbar = el('div', 'flex flex-col gap-2');
  const toolbar = el('div', 'flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2');
  const workspace = el('div', 'flex min-h-[560px] flex-col gap-4 p-3 md:flex-row md:p-5'); workspace.append(panel, viewport);
  const footer = el('div', 'flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 text-xs text-slate-400');
  const status = el('span', '', 'No image loaded'); footer.append(status);
  const zoomLabel = el('span', 'font-mono text-sky-400', '100%');
  const zoomGroup = el('div', 'flex items-center gap-2'); zoomGroup.append(action('−', () => setZoom(zoom - .1)), zoomLabel, action('+', () => setZoom(zoom + .1)), action('Fit', () => setZoom(1))); footer.append(zoomGroup);

  tabs.forEach(t => { const b = action(t.label, () => switchTab(t.id), 'shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition'); b.setAttribute('role', 'tab'); tabButtons.set(t.id, b); nav.append(b); });
  topbar.append(nav, toolbar);
  toolbar.append(
    action('Open image', () => upload.click(), 'rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500'),
    action('Undo', undo), action('Redo', redo), action('Compare', toggleCompare),
    action('Save preset', savePreset), action('New document', () => upload.click()), action('Export', () => switchTab('export')),
  );
  const documentPicker=select(['No documents'],'No documents',()=>{});documentPicker.className+=' max-w-[190px]';toolbar.append(documentPicker);
  toolbar.append(action('Restore autosave',restoreAutosave));
  const { root, modal, fullscreenButton } = createEditorShell({
    title: 'Image Studio Pro', nav: topbar, workspace, footer,
    onReset: resetAll, onToggleFullscreen: () => undefined,
    rootClassName: 'min-h-screen bg-slate-950 p-2 text-white sm:p-5',
    modalClassName: 'editor-surface mx-auto flex w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl',
  });
  const { toggleFullscreen } = bindEditorFullscreenButton({ modal, fullscreenButton }); fullscreenButton.onclick = toggleFullscreen;
  root.append(upload);

  function saveCurrentDocument(){if(!sourceImage||!currentDocumentId)return;const prior=openDocuments.get(currentDocumentId);if(prior)openDocuments.set(currentDocumentId,{...prior,filters:{...filters},crop:{...crop},rotation,flipH,flipV,texts:texts.map(t=>({...t}))});renderDocumentPicker();}
  function renderDocumentPicker(){if(!documentPicker)return;const current=currentDocumentId||'';documentPicker.replaceChildren();openDocuments.forEach(d=>{const o=el('option','',d.name);o.value=d.id;documentPicker.append(o);});documentPicker.value=current;documentPicker.onchange=()=>{const d=openDocuments.get(documentPicker.value);if(d)loadFile(d.file,d.id);};}
  function createWorker() {
    if (worker || typeof Worker === 'undefined') return;
    try { workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' })); worker = new Worker(workerUrl); }
    catch { worker = null; }
  }
  createWorker();

  function snapshot(): Snapshot {
    return { retouch: retouchStrokes.map(s=>({...s,points:s.points.map(p=>({...p}))})), perspectiveX,perspectiveY,cropShape, filters: { ...filters }, rotation, flipH, flipV, crop: { ...crop }, texts: texts.map(t => ({ ...t })), activeLayerId, mask: maskCanvas.toDataURL('image/png') };
  }
  function commit() {
    if (!sourceImage) return;
    history = history.slice(0, historyIndex + 1); history.push(snapshot());
    if (history.length > 60) history.shift(); historyIndex = history.length - 1; updateStatus(); scheduleAutosave(); if(currentDocumentId){const d=openDocuments.get(currentDocumentId);if(d)openDocuments.set(currentDocumentId,{...d,filters:{...filters},crop:{...crop},rotation,flipH,flipV,texts:texts.map(t=>({...t}))});}
  }
  function restore(s: Snapshot) {
    retouchStrokes=s.retouch||[]; perspectiveX=s.perspectiveX||0;perspectiveY=s.perspectiveY||0;cropShape=s.cropShape||'rect'; filters = { ...s.filters }; rotation = s.rotation; flipH = s.flipH; flipV = s.flipV;
    crop = { ...s.crop }; texts = s.texts.map(t => ({ ...t })); activeLayerId = s.activeLayerId;
    const image = new Image(); image.onload = () => { maskCanvas.width = image.width; maskCanvas.height = image.height; maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!; maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height); maskCtx.drawImage(image, 0, 0); render(); renderPanel(); }; image.src = s.mask;
  }
  function undo() { if (historyIndex > 0) { historyIndex--; restore(history[historyIndex]); } }
  function redo() { if (historyIndex < history.length - 1) { historyIndex++; restore(history[historyIndex]); } }
  function updateStatus() { if (!sourceImage) return; status.textContent = `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight} px  ·  History ${historyIndex + 1}/${history.length}${showingOriginal ? '  ·  Original preview' : ''}`; }
  function setZoom(v: number) { zoom = Math.max(.1, Math.min(4, v)); zoomLabel.textContent = `${Math.round(zoom * 100)}%`; canvas.style.transform = `scale(${zoom})`; overlay.style.transform = `scale(${zoom})`; }
  function switchTab(tab: Tab) { activeTab = tab; tabButtons.forEach((b, id) => { b.className = id === tab ? 'shrink-0 rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-300 ring-1 ring-sky-500/30' : 'shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white'; }); renderPanel(); render(); }

  function drawSourceCanvas(cropPreview = false): HTMLCanvasElement | null {
    if (!sourceImage) return null;
    const sx = cropPreview ? 0 : Math.round(crop.x * sourceImage.naturalWidth);
    const sy = cropPreview ? 0 : Math.round(crop.y * sourceImage.naturalHeight);
    const sw = Math.max(1, Math.round(sourceImage.naturalWidth * (cropPreview ? 1 : crop.width)));
    const sh = Math.max(1, Math.round(sourceImage.naturalHeight * (cropPreview ? 1 : crop.height)));
    const cropped = document.createElement('canvas'); cropped.width = sw; cropped.height = sh;
    const c = cropped.getContext('2d'); if (!c) return null;
    c.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
    const effectiveRotation = cropPreview ? 0 : rotation;
    const effectiveFlipH = cropPreview ? false : flipH; const effectiveFlipV = cropPreview ? false : flipV;
    const sideways = Math.abs(effectiveRotation % 180) === 90;
    const out = document.createElement('canvas'); out.width = sideways ? sh : sw; out.height = sideways ? sw : sh;
    const o = out.getContext('2d'); if (!o) return null;
    o.translate(out.width / 2, out.height / 2); o.rotate(effectiveRotation * Math.PI / 180); o.scale(effectiveFlipH ? -1 : 1, effectiveFlipV ? -1 : 1); o.drawImage(cropped, -sw / 2, -sh / 2);
    return out;
  }
  async function processPixels(inputCanvas: HTMLCanvasElement, useSelective: boolean): Promise<ImageData> {
    const ctx = inputCanvas.getContext('2d', { willReadFrequently: true })!;
    const imageData = ctx.getImageData(0, 0, inputCanvas.width, inputCanvas.height);
    const maskData = useSelective && maskCanvas.width && maskCanvas.height ? (() => {
      const m = document.createElement('canvas'); m.width = inputCanvas.width; m.height = inputCanvas.height;
      const mc = m.getContext('2d')!;
      const sx = crop.x * maskCanvas.width, sy = crop.y * maskCanvas.height;
      const sw = Math.max(1, crop.width * maskCanvas.width), sh = Math.max(1, crop.height * maskCanvas.height);
      const croppedMask = document.createElement('canvas'); croppedMask.width = Math.round(sw); croppedMask.height = Math.round(sh);
      croppedMask.getContext('2d')!.drawImage(maskCanvas, sx, sy, sw, sh, 0, 0, croppedMask.width, croppedMask.height);
      const sideways = Math.abs(rotation % 180) === 90;
      mc.translate(m.width / 2, m.height / 2); mc.rotate(rotation * Math.PI / 180); mc.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      mc.drawImage(croppedMask, -croppedMask.width / 2, -croppedMask.height / 2, sideways ? m.height : m.width, sideways ? m.width : m.height);
      return mc.getImageData(0, 0, m.width, m.height).data;
    })() : null;
    if (worker) {
      try {
        const result = await new Promise<ArrayBuffer>((resolve, reject) => {
          const id = ++workerRequestId;
          const onMessage = (e: MessageEvent) => { if (e.data.id !== id) return; worker!.removeEventListener('message', onMessage); worker!.removeEventListener('error', onError); resolve(e.data.buffer); };
          const onError = (e: ErrorEvent) => { worker!.removeEventListener('message', onMessage); worker!.removeEventListener('error', onError); reject(e.error); };
          worker!.addEventListener('message', onMessage); worker!.addEventListener('error', onError);
          const buffer = imageData.data.buffer.slice(0); const mb = maskData ? maskData.buffer.slice(0) : null;
          worker!.postMessage({ id, buffer, width: imageData.width, height: imageData.height, filters, maskBuffer: mb, selective: { mode: brushMode, amount: brushAmount } }, mb ? [buffer, mb] : [buffer]);
        });
        return new ImageData(new Uint8ClampedArray(result), imageData.width, imageData.height);
      } catch { /* fall through to main-thread processing */ }
    }
    const data = imageData.data; const mask = maskData; const exposure = Math.pow(2, filters.exposure / 100); const contrast = filters.contrast / 100; const saturation = filters.saturate / 100; const temperature = filters.temperature * .65;
    const clamp = (v:number) => Math.max(0, Math.min(255, v));
    for (let i=0,p=0;i<data.length;i+=4,p++) {
      const m=mask?(mask[p*4+3]/255)*(brushAmount/100):0; const lift=(v:number)=>{let x=v*exposure;x=(x-128)*contrast+128;x+=filters.brightness-100;x+=filters.blacks*.45;x+=filters.shadows*Math.max(0,(128-v)/128);x+=filters.highlights*Math.max(0,(v-128)/127);x+=filters.whites*Math.max(0,(v-190)/65);return x;};
      let r=lift(data[i]),g=lift(data[i+1]),b=lift(data[i+2]);r+=temperature;b-=temperature;const gray=.2126*r+.7152*g+.0722*b;r=gray+(r-gray)*saturation;g=gray+(g-gray)*saturation;b=gray+(b-gray)*saturation;
      const gray2=.299*r+.587*g+.114*b;const gs=filters.grayscale/100;r+=(gray2-r)*gs;g+=(gray2-g)*gs;b+=(gray2-b)*gs;
      const sep=filters.sepia/100,sr=.393*r+.769*g+.189*b,sg=.349*r+.686*g+.168*b,sb=.272*r+.534*g+.131*b;r+=(sr-r)*sep;g+=(sg-g)*sep;b+=(sb-b)*sep;
      if(m){if(brushMode==='saturate'||brushMode==='desaturate'){const sat=brushMode==='saturate'?1.65:.35,y=.299*r+.587*g+.114*b;r=y+(r-y)*sat;g=y+(g-y)*sat;b=y+(b-y)*sat;}else{const f=brushMode==='brighten'?1.25:brushMode==='dodge'?1.38:brushMode==='burn'?.62:.72;r*=f;g*=f;b*=f;}const baseR=data[i],baseG=data[i+1],baseB=data[i+2];r=baseR+(r-baseR)*m;g=baseG+(g-baseG)*m;b=baseB+(b-baseB)*m;}
      data[i]=clamp(r);data[i+1]=clamp(g);data[i+2]=clamp(b);
    }
    return imageData;
  }
  function applyRetouch(ctx:CanvasRenderingContext2D,target:HTMLCanvasElement){for(const stroke of retouchStrokes){for(let i=1;i<stroke.points.length;i++){const a=stroke.points[i-1],b=stroke.points[i];const dx=(b.x-a.x)*target.width,dy=(b.y-a.y)*target.height;if(Math.hypot(dx,dy)<.5)continue;const radius=Math.max(2,stroke.size*Math.max(target.width,target.height)/Math.max(canvas.width,canvas.height)/2);const temp=document.createElement('canvas');temp.width=target.width;temp.height=target.height;temp.getContext('2d')!.drawImage(target,0,0);ctx.save();ctx.beginPath();ctx.arc(b.x*target.width,b.y*target.height,radius,0,Math.PI*2);ctx.clip();ctx.globalAlpha=stroke.mode==='smudge'?.58:.92;ctx.drawImage(temp,dx,dy);ctx.restore();}}}
  async function renderToCanvas(fullResolution = false): Promise<HTMLCanvasElement | null> {
    if (!sourceImage) return null;
    const base = drawSourceCanvas(activeTab === 'crop' && !fullResolution); if (!base) return null;
    const target = document.createElement('canvas'); target.width = base.width; target.height = base.height;
    const ctx = target.getContext('2d', { willReadFrequently: true })!;
    if(perspectiveX || perspectiveY){ const tmp=document.createElement('canvas'); tmp.width=base.width; tmp.height=base.height; tmp.getContext('2d')!.drawImage(base,0,0); const skewX=perspectiveX/100, skewY=perspectiveY/100; ctx.setTransform(1,skewY,skewX,1,-skewX*base.height/2,-skewY*base.width/2); ctx.drawImage(tmp,0,0); ctx.setTransform(1,0,0,1,0,0); } else ctx.drawImage(base,0,0);
    applyRetouch(ctx,target);
    ctx.filter = filters.blur ? `blur(${filters.blur}px)` : 'none'; if(!perspectiveX && !perspectiveY) ctx.drawImage(base, 0, 0); ctx.filter = 'none';
    const imageData = await processPixels(target, !(activeTab === 'crop' && !fullResolution)); ctx.putImageData(imageData, 0, 0);
    if (filters.vignette > 0) { const g = ctx.createRadialGradient(target.width/2,target.height/2,Math.min(target.width,target.height)*.2,target.width/2,target.height/2,Math.max(target.width,target.height)*.75); g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${filters.vignette/120})`); ctx.fillStyle=g; ctx.fillRect(0,0,target.width,target.height); }
    if (filters.grain > 0) { const d=ctx.getImageData(0,0,target.width,target.height); let seed=1337; const rand=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }; const a=filters.grain*.35; for(let i=0;i<d.data.length;i+=4){const n=(rand()-.5)*a;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;} ctx.putImageData(d,0,0); }
    if(cropShape==='ellipse' && activeTab!=='crop'){ctx.globalCompositeOperation='destination-in';ctx.beginPath();ctx.ellipse(target.width/2,target.height/2,target.width/2,target.height/2,0,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';}
    texts.filter(t=>t.visible).forEach(t=>{ ctx.save(); ctx.globalAlpha=t.opacity; ctx.translate(t.x*target.width,t.y*target.height); ctx.rotate(t.rotation*Math.PI/180); ctx.font=`700 ${Math.max(8,t.fontSize*(target.width/Math.max(1,canvas.width||target.width)))}px ${t.fontFamily}`; ctx.textBaseline='middle'; ctx.shadowColor='rgba(0,0,0,.7)'; ctx.shadowBlur=8; ctx.fillStyle=t.color; ctx.fillText(t.content,0,0); ctx.restore(); });
    return target;
  }
  async function render() {
    if (!sourceImage) return; const version = ++renderVersion;
    const result = showingOriginal ? (() => { const c=document.createElement('canvas'); c.width=sourceImage!.naturalWidth; c.height=sourceImage!.naturalHeight; c.getContext('2d')!.drawImage(sourceImage!,0,0); return Promise.resolve(c); })() : renderToCanvas();
    const out = await result; if (!out || version !== renderVersion) return;
    canvas.width=out.width; canvas.height=out.height; canvas.getContext('2d')!.drawImage(out,0,0);
    canvas.style.width = `${Math.min(out.width, 1200)}px`; canvas.style.height = `${Math.min(out.height, 760)}px`;
    overlay.width=out.width; overlay.height=out.height; overlay.style.width=canvas.style.width; overlay.style.height=canvas.style.height;
    drawOverlay(); updateStatus();
  }
  function drawOverlay() {
    const c=overlay.getContext('2d'); if(!c) return; c.clearRect(0,0,overlay.width,overlay.height);
    if(activeTab==='crop' && sourceImage) { c.fillStyle='rgba(0,0,0,.55)'; c.fillRect(0,0,overlay.width,overlay.height); if(cropShape==='ellipse'){c.save();c.globalCompositeOperation='destination-out';c.beginPath();c.ellipse((crop.x+crop.width/2)*overlay.width,(crop.y+crop.height/2)*overlay.height,crop.width*overlay.width/2,crop.height*overlay.height/2,0,0,Math.PI*2);c.fill();c.restore();}else c.clearRect(crop.x*overlay.width,crop.y*overlay.height,crop.width*overlay.width,crop.height*overlay.height); c.strokeStyle='#38bdf8'; c.lineWidth=Math.max(2,overlay.width/700); if(cropShape==='ellipse') c.strokeRect(crop.x*overlay.width,crop.y*overlay.height,crop.width*overlay.width,crop.height*overlay.height); else c.strokeRect(crop.x*overlay.width,crop.y*overlay.height,crop.width*overlay.width,crop.height*overlay.height); c.fillStyle='#38bdf8'; [[crop.x,crop.y],[crop.x+crop.width,crop.y],[crop.x,crop.y+crop.height],[crop.x+crop.width,crop.y+crop.height]].forEach(([x,y])=>{c.fillRect(x*overlay.width-5,y*overlay.height-5,10,10)}); }
    if(activeTab==='brush') { c.globalAlpha=.28; c.drawImage(maskCanvas,0,0,overlay.width,overlay.height); c.globalAlpha=1; }
    if(activeTab==='text') { const t=texts.find(x=>x.id===activeLayerId); if(t){c.strokeStyle='#38bdf8';c.lineWidth=2;c.strokeRect(t.x*overlay.width-4,t.y*overlay.height-t.fontSize/2-4,Math.max(80,t.content.length*t.fontSize*.55),t.fontSize+8);} }
  }

  function renderPanel() {
    panelContent.replaceChildren();
    const heading=(s:string)=>panelContent.append(el('h3','text-xs font-bold uppercase tracking-widest text-slate-400',s));
    const add=(node:HTMLElement)=>panelContent.append(node);
    const group='space-y-3';
    if(activeTab==='adjust') {
      heading('Basic adjustments');
      (['brightness','contrast','saturate','temperature','blur'] as const).forEach(k=>add(fieldLabel(({brightness:'Brightness',contrast:'Contrast',saturate:'Saturation',temperature:'Temperature',blur:'Blur'} as any)[k],filters[k],k==='temperature'?-100:0,k==='temperature'?100:k==='blur'?20:200,1,v=>{filters[k]=v;render();})));
      add(action('Reset adjustments',()=>{filters={...DEFAULT_FILTERS};commit();renderPanel();render();}));
    } else if(activeTab==='curves') {
      heading('Tone & RGB');
      (['exposure','highlights','shadows','whites','blacks'] as const).forEach(k=>add(fieldLabel(k[0].toUpperCase()+k.slice(1),filters[k],-100,100,1,v=>{filters[k]=v;render();})));
      add(el('p','text-[11px] leading-5 text-slate-500','RGB channel controls are represented by color temperature and tonal controls in this build. A full bezier curve editor can be added as a separate GPU-backed module.'));
      add(histogramElement());
    } else if(activeTab==='filters') {
      heading('Saved & built-in presets');
      const builtins: Record<string,Partial<FilterState>>={
        'Original':{...DEFAULT_FILTERS}, 'Cinematic':{brightness:96,contrast:125,saturate:112,temperature:12,vignette:35,grain:12},
        'Mono Noir':{brightness:105,contrast:135,saturate:0,grayscale:100,vignette:45,grain:14},
        'Warm Sunset':{brightness:105,contrast:110,saturate:130,temperature:35,vignette:20,sepia:12},
        'Matte':{contrast:85,brightness:108,saturate:82,shadows:22,blacks:18}, 'Vivid':{contrast:115,saturate:145,brightness:103},
      };
      Object.entries(builtins).forEach(([name,values])=>add(action(name,()=>{filters={...DEFAULT_FILTERS,...values};commit();render();renderPanel();},'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-xs text-slate-200 hover:border-sky-500')));
      const saved=loadPresets(); saved.forEach(p=>add(action(`★ ${p.name}`,()=>{filters={...DEFAULT_FILTERS,...p.filters};commit();render();renderPanel();},'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-xs text-slate-200')));
      add(action('Save current as preset',savePreset,'w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white'));
    } else if(activeTab==='crop') {
      heading('Crop & aspect ratio');
      add(select(['Rectangle','Ellipse / circle'],cropShape==='rect'?'Rectangle':'Ellipse / circle',v=>{cropShape=v.startsWith('Ellipse')?'ellipse':'rect';render();}));
      add(el('p','text-[11px] text-slate-500','Drag inside the crop to move it. Drag a corner handle to resize. Ellipse crop exports with transparent corners.'));
      [['Freeform',0],['Square 1:1',1],['Landscape 16:9',16/9],['Portrait 4:5',4/5],['Classic 3:2',3/2]].forEach(([name,ratio])=>add(action(String(name),()=>{cropRatio=Number(ratio)||null; if(cropRatio){const w=Math.min(1,cropRatio*sourceImage!.naturalHeight/sourceImage!.naturalWidth);const h=w*sourceImage!.naturalWidth/sourceImage!.naturalHeight/cropRatio;crop={x:(1-w)/2,y:(1-h)/2,width:w,height:h};}else crop={x:.1,y:.1,width:.8,height:.8};render();drawOverlay();},'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-xs text-slate-200')));
      add(action('Apply crop',()=>{commit();render();},'w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white'));
      add(action('Center crop',()=>{crop={x:.1,y:.1,width:.8,height:.8};render();},'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));
      heading('Perspective correction');
      add(fieldLabel('Horizontal keystone',perspectiveX,-30,30,1,v=>{perspectiveX=v;render();}));
      add(fieldLabel('Vertical keystone',perspectiveY,-30,30,1,v=>{perspectiveY=v;render();}));
      add(action('Apply perspective',()=>{commit();render();},'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs')); 
      add(action('Reset crop',()=>{crop={x:0,y:0,width:1,height:1};cropRatio=null;commit();render();},'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));
    } else if(activeTab==='transform') {
      heading('Orientation');
      add(action('Rotate 90° clockwise',()=>{rotation=(rotation+90)%360;commit();render();})); add(action('Rotate 90° counter-clockwise',()=>{rotation=(rotation+270)%360;commit();render();}));
      add(action('Flip horizontal',()=>{flipH=!flipH;commit();render();})); add(action('Flip vertical',()=>{flipV=!flipV;commit();render();}));
    } else if(activeTab==='brush') {
      heading('Selective brush');
      add(el('p','text-xs leading-5 text-slate-400','Paint on the image to mask areas. The selected adjustment is blended only into painted pixels.'));
      add(fieldLabel('Brush size',brushSize,5,250,1,v=>brushSize=v)); add(fieldLabel('Effect amount',brushAmount,0,100,1,v=>brushAmount=v));
      add(select(['brighten','darken','dodge','burn','saturate','desaturate','smudge','liquify'],brushMode,v=>brushMode=v as typeof brushMode));
      add(el('p','text-[11px] text-slate-500','Dodge and burn are selective tonal brushes. Smudge blends pixels along the stroke; liquify pushes a local patch in the stroke direction. These operations are non-destructive stroke records.'));
      add(action('Clear mask',()=>{maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);commit();render();},'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));
    } else if(activeTab==='text') {
      heading('Text layers');
      add(action('Add text layer',()=>{const t:TextLayer={id:crypto.randomUUID(),type:'text',name:`Text ${texts.length+1}`,content:'Your text',x:.5,y:.5,fontSize:48,color:'#ffffff',fontFamily:'Arial',opacity:1,rotation:0,visible:true};texts.push(t);activeLayerId=t.id;commit();renderPanel();render();},'w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white'));
      const t=texts.find(x=>x.id===activeLayerId);
      if(t){const inputText=el('textarea','w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white');inputText.value=t.content;inputText.oninput=()=>{t.content=inputText.value;render();};inputText.onchange=commit;add(inputText);
        add(fieldLabel('Font size',t.fontSize,10,180,1,v=>{t.fontSize=v;render();}));
        const color=el('input','h-9 w-full');color.type='color';color.value=t.color;color.oninput=()=>{t.color=color.value;render();};color.onchange=commit;add(color);
        add(select(['Arial','Georgia','Verdana','Times New Roman','Courier New'],t.fontFamily,v=>{t.fontFamily=v;commit();render();}));
        add(fieldLabel('Opacity',t.opacity*100,0,100,1,v=>{t.opacity=v/100;render();}));
        add(fieldLabel('Rotation',t.rotation,-180,180,1,v=>{t.rotation=v;render();}));
        add(action('Delete text layer',()=>{texts=texts.filter(x=>x.id!==t.id);activeLayerId=null;commit();renderPanel();render();}));
      } else add(el('p','text-xs text-slate-500','Select a text layer in Layers to edit it. Drag text directly on the canvas to position it.'));
    } else if(activeTab==='layers') {
      heading('Layer stack');
      add(action('Add text layer',()=>switchTab('text'),'w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white'));
      const rows:Layer[]=[{id:'base-image',type:'image',name:'Background image',visible:true},...(maskCanvas.width?[{id:'brush-mask',type:'mask' as const,name:'Selective mask',visible:true}]:[]),...texts];
      rows.forEach(layer=>{const row=el('div','flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2');const vis=el('input');vis.type='checkbox';vis.checked=layer.visible;vis.onchange=()=>{layer.visible=vis.checked;if(layer.type==='text')render();};const name=action(layer.name,()=>{activeLayerId=layer.id;switchTab(layer.type==='text'?'text':'layers');},'min-w-0 flex-1 truncate text-left text-xs text-slate-200');row.append(vis,name,el('span','text-[10px] uppercase text-slate-500',layer.type));add(row);});
      add(el('p','text-[11px] text-slate-500','The source image remains non-destructive. Text and selective masks are independent editable layers.'));
    } else if(activeTab==='export') {
      heading('Export studio');
      const batchInput=el('input','hidden');batchInput.type='file';batchInput.multiple=true;batchInput.accept='image/*';batchInput.onchange=()=>{const files=Array.from(batchInput.files||[]);files.forEach(f=>exportQueue.push({id:crypto.randomUUID(),name:f.name,status:'queued',file:f}));renderPanel();};add(action('Add files to batch queue',()=>batchInput.click(),'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));add(batchInput);
      add(action('Batch watermark current collection',()=>{const text=prompt('Watermark text for the selected collection:');if(!text)return;exportWatermark=text;alert('Watermark saved for queued exports. Add the collection files to the queue, then process each file in the batch workflow.');},'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));
      add(el('p','text-[11px] text-slate-500','Batch queue applies the current brightness, contrast, saturation and export watermark to every queued image.'));
      const fmt=select(['png','jpeg','webp','avif','tiff','svg','pdf'],exportFormat,v=>{exportFormat=v as ExportFormat;refreshEstimate();}); add(fmt);
      add(fieldLabel('Compression / quality',90,1,100,1,()=>refreshEstimate()));
      const qualityInput=panelContent.querySelector('input[type=range]') as HTMLInputElement;
      const bg=el('input','h-9 w-full');bg.type='color';bg.value='#ffffff';add(el('label','text-xs text-slate-400','JPEG / flattened background'));add(bg);
      add(select(['1× Original','2×','3×','4×','Instagram Post 1080×1080','Instagram Story 1080×1920','Facebook Cover 1640×624','YouTube Thumbnail 1280×720','X Header 1500×500'], '1× Original',v=>{const dims:Record<string,number>={'1× Original':1,'2×':2,'3×':3,'4×':4};const social:Record<string,{width:number;height:number}>={'Instagram Post 1080×1080':{width:1080,height:1080},'Instagram Story 1080×1920':{width:1080,height:1920},'Facebook Cover 1640×624':{width:1640,height:624},'YouTube Thumbnail 1280×720':{width:1280,height:720},'X Header 1500×500':{width:1500,height:500}};exportScale=dims[v]||1;exportDimensions=social[v]||null;refreshEstimate();}));
      const watermark=el('input','w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white');watermark.placeholder='Optional export watermark';watermark.value=exportWatermark;watermark.oninput=()=>exportWatermark=watermark.value;add(watermark);
      add(select(['Remove metadata','Preserve source metadata (requires EXIF writer)'],exportMetadata==='preserve'?'Preserve source metadata (requires EXIF writer)':'Remove metadata',v=>exportMetadata=v.startsWith('Preserve')?'preserve':'remove'));
      const estimate=el('p','rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400','Estimated size: calculate before export');estimate.id='export-estimate';add(estimate);
      add(action('Estimate file size',refreshEstimate,'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));
      add(action('Add export to queue',()=>{const id=crypto.randomUUID();exportQueue.push({id,name:`${documentName} · ${exportFormat.toUpperCase()}`,status:'queued'});renderPanel();},'w-full rounded-lg bg-sky-600 px-3 py-3 text-xs font-bold text-white'));
      add(action('Export now',()=>exportFull(exportFormat,Number(qualityInput?.value||90),bg.value,exportScale),'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));
      add(action('Process export queue',processExportQueue,'w-full rounded-lg border border-slate-700 px-3 py-2 text-xs'));
      heading('Export queue'); exportQueue.forEach(job=>add(el('p','text-xs text-slate-400',`${job.name} · ${job.status}${job.detail?' · '+job.detail:''}`)));
      add(el('p','text-[11px] leading-5 text-slate-500','AVIF is enabled only when the browser encoder supports it. TIFF requires a TIFF encoder. PDF is generated as a print-ready document. SVG wraps the rendered raster image, it does not convert pixels into editable vector paths. Canvas exports strip source EXIF/XMP metadata. The preserve option is guarded until an EXIF/XMP writer is connected.'));
    }
  }
  function refreshEstimate(){ const node=panelContent.querySelector('#export-estimate'); if(!node||!sourceImage)return; const w=exportDimensions?.width||Math.round(sourceImage.naturalWidth*exportScale*crop.width),h=exportDimensions?.height||Math.round(sourceImage.naturalHeight*exportScale*crop.height); const bpp=exportFormat==='png'?2.2:exportFormat==='jpeg'?0.45:exportFormat==='webp'?0.35:exportFormat==='avif'?0.25:1.8; const bytes=Math.round(w*h*bpp); node.textContent=`${w.toLocaleString()} × ${h.toLocaleString()} px · rough estimate ${formatBytes(bytes)} (actual size varies with image detail and encoder)`; }
  function formatBytes(n:number){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;}
  function restoreAutosave(){try{const raw=localStorage.getItem(autosaveKey);if(!raw){alert('No autosaved project found.');return;}const data=JSON.parse(raw);const img=new Image();img.onload=()=>{sourceImage=img;documentName=data.name||'Recovered project';filters={...DEFAULT_FILTERS,...data.filters};rotation=data.rotation||0;flipH=!!data.flipH;flipV=!!data.flipV;perspectiveX=data.perspectiveX||0;perspectiveY=data.perspectiveY||0;cropShape=data.cropShape||'rect';crop=data.crop||{x:0,y:0,width:1,height:1};texts=data.texts||[];retouchStrokes=data.retouchStrokes||[];maskCanvas.width=img.naturalWidth;maskCanvas.height=img.naturalHeight;maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true})!;history=[];historyIndex=-1;commit();empty.remove();renderPanel();render();};img.src=data.image;}catch{alert('The autosaved project could not be restored.');}}
  function scheduleAutosave(){ if(autosaveTimer)clearTimeout(autosaveTimer); autosaveTimer=window.setTimeout(async()=>{try{const c=document.createElement('canvas');c.width=sourceImage!.naturalWidth;c.height=sourceImage!.naturalHeight;c.getContext('2d')!.drawImage(sourceImage!,0,0);const record={name:documentName,image:c.toDataURL('image/jpeg',.88),filters,rotation,flipH,flipV,perspectiveX,perspectiveY,cropShape,crop,texts,retouchStrokes,updated:Date.now()};localStorage.setItem(autosaveKey,JSON.stringify(record));status.textContent+=' · Autosaved';}catch{status.textContent+=' · Autosave unavailable (storage limit)';}},700);}
  async function processExportQueue(){for(const job of exportQueue.filter(j=>j.status==='queued')){try{if(job.file){const img=await createImageBitmap(job.file);const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d')!;x.filter=`brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%)`;x.drawImage(img,0,0);x.filter='none';if(exportWatermark){x.save();x.globalAlpha=.55;x.fillStyle='#fff';x.font=`bold ${Math.max(18,c.width*.025)}px Arial`;x.textAlign='right';x.fillText(exportWatermark,c.width-24,c.height-24);x.restore();}const mime=exportFormat==='jpeg'?'image/jpeg':`image/${exportFormat}`;if(['tiff','pdf','svg'].includes(exportFormat))throw new Error(`${exportFormat.toUpperCase()} batch encoder is not available for raster collection items.`);const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Selected encoder is unsupported.')),mime,.9));const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=`${job.file.name.replace(/\.[^.]+$/,'')}-edited.${exportFormat==='jpeg'?'jpg':exportFormat}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);img.close();}else await exportFull(exportFormat,90,'#ffffff',exportScale);job.status='done';}catch(e){job.status='error';job.detail=String(e);}renderPanel();}}
  async function exportFull(format:ExportFormat,quality:number,bg:string,scale=1){if(!sourceImage)return;const out=await renderToCanvas(true);if(!out)return;if(exportMetadata==='preserve' && !['svg','pdf'].includes(format))throw new Error('Metadata preservation needs an EXIF/XMP writer library. Choose Remove metadata to export a clean edited image.');const final=document.createElement('canvas');final.width=exportDimensions?.width||out.width*scale;final.height=exportDimensions?.height||out.height*scale;const ctx=final.getContext('2d')!;if(format==='jpeg'){ctx.fillStyle=bg;ctx.fillRect(0,0,final.width,final.height);}ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(exportDimensions){const scaleToCover=Math.max(final.width/out.width,final.height/out.height);const sw=final.width/scaleToCover,sh=final.height/scaleToCover;ctx.drawImage(out,(out.width-sw)/2,(out.height-sh)/2,sw,sh,0,0,final.width,final.height);}else ctx.drawImage(out,0,0,final.width,final.height);if(exportWatermark){ctx.save();ctx.globalAlpha=.55;ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(18,final.width*.025)}px Arial`;ctx.textAlign='right';ctx.fillText(exportWatermark,final.width-24,final.height-24);ctx.restore();}
    const download=(blob:Blob,ext:string)=>{const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=`${documentName.replace(/[^a-z0-9-_]/gi,'-')}-${Date.now()}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
    if(format==='svg'){const data=final.toDataURL('image/png');const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${final.width}" height="${final.height}" viewBox="0 0 ${final.width} ${final.height}"><image width="100%" height="100%" href="${data}"/></svg>`;download(new Blob([svg],{type:'image/svg+xml'}),'svg');return;}
    if(format==='pdf'){const data=final.toDataURL('image/jpeg',quality/100);const win=window.open('','_blank');if(!win)throw new Error('Allow pop-ups to create the PDF print document.');win.document.write(`<html><head><title>${documentName}</title><style>@page{margin:0}body{margin:0}img{width:100%;height:auto}</style></head><body><img src="${data}"></body></html>`);win.document.close();win.focus();win.print();return;}
    if(format==='tiff')throw new Error('TIFF export needs a TIFF encoder library. No encoder is bundled in this project yet.');
    const mime=format==='jpeg'?'image/jpeg':`image/${format}`;const blob=await new Promise<Blob>((resolve,reject)=>final.toBlob(b=>b?resolve(b):reject(new Error(`${format.toUpperCase()} encoding is not supported by this browser.`)),mime,quality/100));download(blob,format==='jpeg'?'jpg':format);}
  function histogramElement(): HTMLElement {
    const wrap=el('div','rounded-lg border border-slate-800 bg-slate-950 p-2');wrap.append(el('p','mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500','Live luminance histogram'));
    const h=el('canvas','h-24 w-full');h.width=256;h.height=80;wrap.append(h);
    if(sourceImage){const c=document.createElement('canvas');c.width=128;c.height=80;const x=c.getContext('2d')!;x.drawImage(sourceImage,0,0,128,80);const d=x.getImageData(0,0,128,80).data;const bins=new Array(64).fill(0);for(let i=0;i<d.length;i+=4){const y=Math.round((.299*d[i]+.587*d[i+1]+.114*d[i+2])/4);bins[Math.min(63,y)]++;}const max=Math.max(...bins,1);const ctx=h.getContext('2d')!;ctx.fillStyle='#38bdf8';bins.forEach((v,i)=>ctx.fillRect(i*4,80-(v/max*76),3,v/max*76));}
    return wrap;
  }
  function loadPresets():{name:string;filters:Partial<FilterState>}[]{try{return JSON.parse(localStorage.getItem(presetsKey)||'[]');}catch{return[];}}
  function savePreset(){const name=prompt('Name this preset:');if(!name?.trim())return;const presets=loadPresets();presets.push({name:name.trim(),filters:{...filters}});localStorage.setItem(presetsKey,JSON.stringify(presets));renderPanel();}
  function toggleCompare(){showingOriginal=!showingOriginal;updateStatus();render();}
  function resetAll(){filters={...DEFAULT_FILTERS};rotation=0;flipH=false;flipV=false;perspectiveX=0;perspectiveY=0;cropShape='rect';crop={x:0,y:0,width:1,height:1};texts=[];retouchStrokes=[];activeLayerId=null;showingOriginal=false;if(maskCanvas.width)maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);commit();renderPanel();render();}

  function loadFile(file:File,existingId?:string){if(!file.type.startsWith('image/')){alert('Please choose a valid image file.');return;}saveCurrentDocument();if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(file);const img=new Image();img.onload=()=>{sourceImage=img;const id=existingId||crypto.randomUUID();currentDocumentId=id;documentName=file.name.replace(/\.[^.]+$/,'');const saved=openDocuments.get(id);if(!saved)openDocuments.set(id,{id,name:documentName,file,filters:{...DEFAULT_FILTERS},crop:{x:0,y:0,width:1,height:1},rotation:0,flipH:false,flipV:false,texts:[]});const doc=openDocuments.get(id)!;documentName=doc.name;crop={...doc.crop};rotation=doc.rotation;flipH=doc.flipH;flipV=doc.flipV;filters={...doc.filters};texts=doc.texts.map(t=>({...t}));retouchStrokes=[];activeLayerId=null;maskCanvas.width=img.naturalWidth;maskCanvas.height=img.naturalHeight;maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true})!;maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);history=[];historyIndex=-1;commit();empty.remove();viewport.classList.add('p-4');renderDocumentPicker();renderPanel();render();};img.onerror=()=>alert('This image could not be opened.');img.src=sourceUrl;}
  upload.onchange=()=>{const f=upload.files?.[0];if(f)loadFile(f);upload.value='';};
  viewport.addEventListener('dragover',e=>{e.preventDefault();viewport.classList.add('ring-2','ring-sky-500');});viewport.addEventListener('dragleave',()=>viewport.classList.remove('ring-2','ring-sky-500'));viewport.addEventListener('drop',e=>{e.preventDefault();viewport.classList.remove('ring-2','ring-sky-500');const f=(e as DragEvent).dataTransfer?.files[0];if(f)loadFile(f);});
  function pointerPoint(e:PointerEvent){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
  canvas.addEventListener('pointerdown',e=>{if(!sourceImage)return;canvas.setPointerCapture(e.pointerId);const p=pointerPoint(e);
    if(activeTab==='crop'){const hx=[crop.x,crop.x+crop.width],hy=[crop.y,crop.y+crop.height],near=(a:number,b:number)=>Math.hypot((p.x-a)*canvas.width,(p.y-b)*canvas.height)<18;const nw=near(hx[0],hy[0]),ne=near(hx[1],hy[0]),sw=near(hx[0],hy[1]),se=near(hx[1],hy[1]);cropDragMode=nw?'nw':ne?'ne':sw?'sw':se?'se':(p.x>=crop.x&&p.x<=crop.x+crop.width&&p.y>=crop.y&&p.y<=crop.y+crop.height)?'move':'new';isDraggingCrop=true;dragStart={x:p.x,y:p.y,cropX:crop.x,cropY:crop.y,textX:0,textY:0};if(cropDragMode==='new')crop={x:p.x,y:p.y,width:.01,height:.01};}
    else if(activeTab==='brush'){isPainting=true;if(brushMode==='smudge'||brushMode==='liquify'){activeRetouch={mode:brushMode,points:[p],size:brushSize};retouchStrokes.push(activeRetouch);}else paint(p.x,p.y);}
    else if(activeTab==='text'){const t=texts.find(x=>x.id===activeLayerId);if(t){isDraggingText=true;dragStart={x:p.x,y:p.y,cropX:0,cropY:0,textX:t.x,textY:t.y};}}
  });
  canvas.addEventListener('pointermove',e=>{if(!sourceImage)return;const p=pointerPoint(e);
    if(isDraggingCrop){if(cropDragMode==='move'){crop.x=Math.max(0,Math.min(1-crop.width,dragStart.cropX+p.x-dragStart.x));crop.y=Math.max(0,Math.min(1-crop.height,dragStart.cropY+p.y-dragStart.y));}else if(cropDragMode==='new'){crop.x=Math.min(dragStart.x,p.x);crop.y=Math.min(dragStart.y,p.y);crop.width=Math.max(.01,Math.abs(p.x-dragStart.x));crop.height=Math.max(.01,Math.abs(p.y-dragStart.y));}else{const right=cropDragMode.endsWith('e'),bottom=cropDragMode.endsWith('s');const left=right?crop.x:Math.min(p.x,dragStart.cropX+crop.width);const top=bottom?crop.y:Math.min(p.y,dragStart.cropY+crop.height);const farX=right?Math.max(p.x,dragStart.cropX+.01):crop.x+crop.width;const farY=bottom?Math.max(p.y,dragStart.cropY+.01):crop.y+crop.height;crop={x:Math.max(0,left),y:Math.max(0,top),width:Math.max(.01,Math.min(1-left,farX-left)),height:Math.max(.01,Math.min(1-top,farY-top))};}render();}
    else if(isPainting){if(activeRetouch){activeRetouch.points.push(p);}else paint(p.x,p.y);render();}
    else if(isDraggingText){const t=texts.find(x=>x.id===activeLayerId);if(t){t.x=Math.max(0,Math.min(1,dragStart.textX+p.x-dragStart.x));t.y=Math.max(0,Math.min(1,dragStart.textY+p.y-dragStart.y));render();}}
  });
  const finishPointer=()=>{if(isDraggingCrop||isPainting||isDraggingText)commit();isDraggingCrop=false;isPainting=false;isDraggingText=false;activeRetouch=null;};canvas.addEventListener('pointerup',finishPointer);canvas.addEventListener('pointercancel',finishPointer);
  function paint(x:number,y:number){
    // Convert displayed, rotated/flipped coordinates back into the original image's space.
    let ox=flipH?1-x:x, oy=flipV?1-y:y; let u=ox, v=oy;
    const r=((rotation%360)+360)%360;
    if(r===90){u=oy;v=1-ox;} else if(r===180){u=1-ox;v=1-oy;} else if(r===270){u=1-oy;v=ox;}
    const px=(crop.x+u*crop.width)*maskCanvas.width, py=(crop.y+v*crop.height)*maskCanvas.height;
    const scale=Math.max(maskCanvas.width,maskCanvas.height)/Math.max(1,Math.max(canvas.width,canvas.height));
    maskCtx.fillStyle='rgba(56,189,248,1)';maskCtx.beginPath();maskCtx.arc(px,py,Math.max(2,brushSize*scale/2),0,Math.PI*2);maskCtx.fill();
  }
  function keydown(e:KeyboardEvent){if(!(e.ctrlKey||e.metaKey))return;if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if(e.key.toLowerCase()==='y'){e.preventDefault();redo();}else if(e.key.toLowerCase()==='s'){e.preventDefault();switchTab('export');}else if(e.key.toLowerCase()==='o'){e.preventDefault();upload.click();}}
  window.addEventListener('keydown',keydown);
  const originalDestroy=root.remove.bind(root);root.remove=()=>{window.removeEventListener('keydown',keydown);if(sourceUrl)URL.revokeObjectURL(sourceUrl);if(worker)worker.terminate();if(workerUrl)URL.revokeObjectURL(workerUrl);originalDestroy();};
  switchTab('adjust');
  return root;
}