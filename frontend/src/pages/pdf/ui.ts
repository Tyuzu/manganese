import { button, div, p, span, strong } from '../../components/ui/dom';
import type { MergeQueueItem, ScannerPageItem } from './types';
import { createIcon } from './utils';

export function createPageThumbnailItem({
  pageItem,
  index,
  selectedPageIndex,
  pages,
  onSelect,
  onMove,
  onDelete,
}: {
  pageItem: ScannerPageItem;
  index: number;
  selectedPageIndex: number;
  pages: ScannerPageItem[];
  onSelect: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
}) {
  const isSelected = index === selectedPageIndex;

  const thumbnail = div({
    className: `pdf-thumbnail ${isSelected ? 'is-selected' : ''}`,
    role: 'button',
    tabindex: 0,
    'aria-label': `Select ${pageItem.title}`,
    onclick: () => onSelect(index),
  });

  const pagePreview = div(
    { className: 'pdf-thumbnail-preview' },
    div({ className: 'pdf-thumbnail-lines' }),
    div({ className: 'pdf-thumbnail-lines short' }),
    div({ className: 'pdf-thumbnail-lines' }),
    div({ className: 'pdf-thumbnail-lines medium' }),
  );

  const pageNumber = span(
    { className: 'pdf-thumbnail-number' },
    `${index + 1}`,
  );

  const pageName = span(
    { className: 'pdf-thumbnail-name' },
    pageItem.title,
  );

  const actions = div(
    { className: 'pdf-thumbnail-actions' },
    button(
      {
        type: 'button',
        title: 'Move up',
        disabled: index === 0,
        onclick: (event: Event) => {
          event.stopPropagation();
          onMove(index, -1);
        },
      },
      '↑',
    ),
    button(
      {
        type: 'button',
        title: 'Move down',
        disabled: index === pages.length - 1,
        onclick: (event: Event) => {
          event.stopPropagation();
          onMove(index, 1);
        },
      },
      '↓',
    ),
    button(
      {
        type: 'button',
        title: 'Delete page',
        onclick: (event: Event) => {
          event.stopPropagation();
          onDelete(index);
        },
      },
      '×',
    ),
  );

  thumbnail.append(pagePreview, pageNumber, pageName, actions);

  thumbnail.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(index);
    }
  });

  return thumbnail;
}

export function createMergeQueueEntry({
  item,
  index,
  onRemove,
}: {
  item: MergeQueueItem;
  index: number;
  onRemove: (itemId: string) => void;
}) {
  const row = div(
    { className: 'pdf-merge-item' },
    div(
      { className: 'pdf-merge-file-info' },
      span({ className: 'pdf-merge-number' }, `${index + 1}`),
      div(
        { className: 'pdf-merge-file-details' },
        span({ className: 'pdf-merge-file-name' }, item.name),
        span(
          { className: 'pdf-merge-file-size' },
          `${item.sizeMB} MB`,
        ),
      ),
    ),
    button(
      {
        type: 'button',
        className: 'pdf-remove-button',
        title: 'Remove file',
        onclick: () => onRemove(item.id),
      },
      createIcon('close'),
    ),
  );

  return row;
}

export function createSummaryPanel({
  uploadedFileName,
  pages,
  rotation,
  ocrEnabled,
}: {
  uploadedFileName: string | null;
  pages: ScannerPageItem[];
  rotation: number;
  ocrEnabled: boolean;
}) {
  return div(
    { className: 'pdf-summary' },
    p({ className: 'pdf-summary-title' }, 'Document summary'),
    div(
      { className: 'pdf-summary-row' },
      span({}, 'File'),
      strong({}, uploadedFileName || 'No document'),
    ),
    div(
      { className: 'pdf-summary-row' },
      span({}, 'Pages'),
      strong({}, `${pages.length}`),
    ),
    div(
      { className: 'pdf-summary-row' },
      span({}, 'Rotation'),
      strong({}, `${rotation}°`),
    ),
    div(
      { className: 'pdf-summary-row' },
      span({}, 'OCR'),
      strong({}, ocrEnabled ? 'Enabled' : 'Disabled'),
    ),
  );
}
