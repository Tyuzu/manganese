export type ScanTab = 'mode' | 'filters' | 'crop' | 'sign' | 'ocr' | 'batch' | 'export';
export type FilterPreset = 'magic' | 'gray' | 'bw' | 'original';
export type DocumentPreset = 'pdf' | 'id' | 'ocr' | 'photo';
export type ExportFormat = 'pdf' | 'jpg' | 'png';

export interface Point {
  x: number;
  y: number;
}

export interface ScannedPage {
  id: string;
  name: string;
  dataUrl: string;
  filter: FilterPreset;
  rotation: number;
  flipX: boolean;
  brightness: number;
  contrast: number;
  corners: [Point, Point, Point, Point];
  signatureDataUrl?: string | null;
  watermarkText?: string;
  watermarkOpacity?: number;
  extractedText?: string;
}

export interface SavedSession {
  pages: ScannedPage[];
  activePageIndex: number;
}

export const FILTERS: Record<FilterPreset, string> = {
  magic: 'contrast(125%) brightness(105%) saturate(115%)',
  gray: 'grayscale(100%) contrast(115%)',
  bw: 'grayscale(100%) contrast(195%) brightness(110%)',
  original: '',
};

export const TABS: { id: ScanTab; label: string }[] = [
  { id: 'mode', label: 'Mode' },
  { id: 'filters', label: 'Adjust' },
  { id: 'crop', label: 'Crop' },
  { id: 'sign', label: 'Sign' },
  { id: 'ocr', label: 'OCR' },
  { id: 'batch', label: 'Batch' },
  { id: 'export', label: 'Export' },
];
