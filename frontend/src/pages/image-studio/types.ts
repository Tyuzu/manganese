export type ExportMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/avif";

export type FilterState = {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  temperature: number;
  blur: number;
  vignette: number;
};

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProjectState = {
  id: string;
  name: string;
  width: number;
  height: number;
  filters: FilterState;
  crop: CropRect | null;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  zoom: number;
  panX: number;
  panY: number;
  brushSize: number;
  maskEnabled: boolean;
  text: string;
};

export type StoredProject = {
  id: string;
  name: string;
  updatedAt: number;
  state: ProjectState;
  source: Blob;
  mask: Blob | null;
};

export type EditorDocument = ProjectState & {
  source: Blob;
  bitmap: ImageBitmap;
  maskCanvas: HTMLCanvasElement;
  hasMask: boolean;
  maskRevision: number;
  revision: number;
};

export type Geometry = {
  crop: CropRect;
  width: number;
  height: number;
  rotation: number;
};

export type RenderResult = {
  bitmap?: ImageBitmap;
  blob?: Blob;
  width: number;
  height: number;
};

export const DEFAULT_FILTERS: FilterState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  blur: 0,
  vignette: 0,
};

export const FILTER_DEFINITIONS: Array<{
  key: keyof FilterState;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
  { key: "exposure", label: "Exposure", min: -100, max: 100, step: 1 },
  { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1 },
  { key: "blur", label: "Blur", min: 0, max: 20, step: 0.5 },
  { key: "vignette", label: "Vignette", min: 0, max: 100, step: 1 },
];
