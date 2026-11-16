import {
  button,
  createButton,
  div,
  span,
} from '../../components/ui/dom';
import { createIcon } from './utils';

export function createPdfQuickActions({
  pageCounter,
  documentName,
  onUpload,
  onExport,
}: {
  pageCounter: HTMLElement;
  documentName: HTMLElement;
  onUpload: () => void;
  onExport: () => void;
}) {
  const uploadButton = createButton(
    'secondary',
    {
      type: 'button',
      className: 'pdf-button pdf-button-secondary',
      onclick: onUpload,
    },
    'Upload document',
  );

  const exportButton = createButton(
    'primary',
    {
      type: 'button',
      className: 'pdf-button pdf-button-primary',
      onclick: onExport,
    },
    'Export PDF',
  );

  return div(
    { className: 'pdf-quick-actions' },
    div(
      { className: 'pdf-document-info' },
      pageCounter,
      documentName,
    ),
    div(
      { className: 'pdf-quick-buttons' },
      uploadButton,
      exportButton,
    ),
  );
}

export function createPdfStageHud({
  onZoomOut,
  onZoomIn,
  onDeskewLeft,
  onDeskewRight,
  onRotate90,
  onRunOCR,
}: {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onDeskewLeft: () => void;
  onDeskewRight: () => void;
  onRotate90: () => void;
  onRunOCR: () => void;
}) {
  const zoomOutBtn = button(
    {
      type: 'button',
      className: 'pdf-icon-button',
      title: 'Zoom out',
      'aria-label': 'Zoom out',
      onclick: onZoomOut,
    },
    createIcon('zoomOut'),
  );

  const zoomLabel = span(
    { className: 'pdf-zoom-label' },
    '100%',
  );

  const zoomInBtn = button(
    {
      type: 'button',
      className: 'pdf-icon-button',
      title: 'Zoom in',
      'aria-label': 'Zoom in',
      onclick: onZoomIn,
    },
    createIcon('zoomIn'),
  );

  const deskewLeftBtn = button(
    {
      type: 'button',
      className: 'pdf-hud-button',
      title: 'Rotate counterclockwise',
      onclick: onDeskewLeft,
    },
    '−1°',
  );

  const deskewRightBtn = button(
    {
      type: 'button',
      className: 'pdf-hud-button',
      title: 'Rotate clockwise',
      onclick: onDeskewRight,
    },
    '+1°',
  );

  const rotate90Btn = button(
    {
      type: 'button',
      className: 'pdf-hud-button',
      title: 'Rotate 90 degrees',
      onclick: onRotate90,
    },
    createIcon('rotate'),
    '90°',
  );

  const ocrRunBtn = createButton(
    'primary',
    {
      type: 'button',
      className: 'pdf-button pdf-button-primary pdf-ocr-button',
      onclick: onRunOCR,
    },
    'Run OCR',
  );

  return {
    root: div(
      { className: 'pdf-stage-hud' },
      div(
        { className: 'pdf-zoom-controls' },
        zoomOutBtn,
        zoomLabel,
        zoomInBtn,
      ),
      div({ className: 'pdf-hud-divider' }),
      deskewLeftBtn,
      deskewRightBtn,
      rotate90Btn,
      ocrRunBtn,
    ),
    zoomLabel,
    zoomOutBtn,
    zoomInBtn,
    deskewLeftBtn,
    deskewRightBtn,
    rotate90Btn,
    ocrRunBtn,
  };
}
