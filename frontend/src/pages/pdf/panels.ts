export function applyPdfToolPanel({
  toolContainer,
  activeTab,
  renderPagesControls,
  renderEnhanceControls,
  renderOCRControls,
  renderDeskewControls,
  renderMergeControls,
  renderExportControls,
  renderSummary,
}: {
  toolContainer: HTMLElement;
  activeTab: string;
  renderPagesControls: () => void;
  renderEnhanceControls: () => void;
  renderOCRControls: () => void;
  renderDeskewControls: () => void;
  renderMergeControls: () => void;
  renderExportControls: () => void;
  renderSummary: () => void;
}) {
  toolContainer.replaceChildren();

  switch (activeTab) {
    case 'pages':
      renderPagesControls();
      break;

    case 'enhance':
      renderEnhanceControls();
      break;

    case 'ocr':
      renderOCRControls();
      break;

    case 'deskew':
      renderDeskewControls();
      break;

    case 'merge':
      renderMergeControls();
      break;

    case 'export':
      renderExportControls();
      break;
  }

  renderSummary();
}
