export interface ScannerPageItem {
  id: string;
  title: string;
  rotation: number;
  isBlank?: boolean;
}

export interface MergeQueueItem {
  id: string;
  name: string;
  sizeMB: string;
  estimatedPages: number;
  file: File;
}

export type ScanTab = 'pages' | 'enhance' | 'ocr' | 'deskew' | 'merge' | 'export';
export type ExportFormat = 'pdf' | 'jpg' | 'txt';
export type ScanPreset = 'original' | 'magic' | 'bw';

export const TABS: { id: ScanTab; label: string }[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'enhance', label: 'Enhance' },
  { id: 'ocr', label: 'OCR' },
  { id: 'deskew', label: 'Deskew' },
  { id: 'merge', label: 'Merge' },
  { id: 'export', label: 'Export' },
];

export const OCR_LANGUAGES = [
  { value: 'eng', label: 'English' },
  { value: 'spa', label: 'Spanish' },
  { value: 'fra', label: 'French' },
  { value: 'deu', label: 'German' },
];

export const INITIAL_PAGES: ScannerPageItem[] = [
  { id: 'p-1', title: 'Page 1 (Cover)', rotation: 0 },
  { id: 'p-2', title: 'Page 2 (Invoice Details)', rotation: 0 },
  { id: 'p-3', title: 'Page 3 (Line Items)', rotation: 0 },
  { id: 'p-4', title: 'Page 4 (Terms & Signatures)', rotation: 0 },
];
