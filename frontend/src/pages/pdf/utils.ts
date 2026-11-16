export function createId(prefix = 'pdf'): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function getFileType(file: File): 'pdf' | 'image' {
  return file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : 'image';
}

import { svgElement } from '../../components/ui/dom';

export function createIcon(name: string) {
  const paths: Record<string, string> = {
    upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 16v4h16v-4',
    file: 'M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 0v5h5',
    zoomIn: 'M11 5v12m-6-6h12M21 21l-4.35-4.35',
    zoomOut: 'M5 11h12m4 10-4.35-4.35',
    rotate: 'M20 11a8 8 0 1 1-2.34-5.66L20 8m0-5v5h-5',
    close: 'M18 6 6 18M6 6l12 12',
    download: 'M12 3v12m0 0 5-5m-5 5-5-5M4 17v4h16v-4',
  };

  return svgElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.7',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'pdf-icon',
      'aria-hidden': 'true',
    },
    svgElement('path', { d: paths[name] || paths.file }),
  );
}
