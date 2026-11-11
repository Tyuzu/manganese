import { button, div, h1, h2, input, label, p, span } from '../components/ui/dom';
import { router } from '../main';

export async function createHomePage(): Promise<HTMLElement> {
  const root = div({ className: 'card' },
    h1({}, 'Creative Media Dashboard'),
    p({}, 'Edit images, refine video, and transform PDFs from one streamlined workspace.')
  );

  const grid = div({ className: 'dashboard-grid' });

  const featureCards = [
    {
      title: 'Image Studio',
      description: 'Crop, enhance, annotate, and export high-quality visuals.',
      route: '/images',
      action: 'Launch editor',
    },
    {
      title: 'Video Editor',
      description: 'Trim clips, sync captions, and polish final motion stories.',
      route: '/videos',
      action: 'Open timeline',
    },
    {
      title: 'Scan & Convert',
      description: 'Capture pages, clean them up, and export as PDF or photo output.',
      route: '/scan',
      action: 'Open scanner',
    },
    {
      title: 'PDF Workspace',
      description: 'Scan, merge, sign, and convert documents without leaving the app.',
      route: '/pdf',
      action: 'Open scanner',
    },
  ];

  featureCards.forEach((feature) => {
    const card = div({ className: 'media-card' },
      h2({}, feature.title),
      p({}, feature.description),
      button({ type: 'button' }, feature.action)
    );
    card.lastElementChild?.addEventListener('click', () => router.navigate(feature.route));
    grid.appendChild(card);
  });

  root.appendChild(grid);
  return root;
}

export async function createImageEditorPage(): Promise<HTMLElement> {
  const root = div({ className: 'card' },
    h1({}, 'Image Studio'),
    p({}, 'Retouch photos and prepare assets for publishing.')
  );

  const toolbar = div({ className: 'tool-row' },
    button({ type: 'button' }, 'Crop'),
    button({ type: 'button' }, 'Filters'),
    button({ type: 'button' }, 'Text Overlay'),
    button({ type: 'button' }, 'AI Enhance')
  );

  const preview = div({ className: 'media-preview' },
    div({ className: 'image-placeholder' }, 'Preview: Poster image'),
    div({ className: 'meta-panel' },
      p({}, span({ style: 'font-weight: 700;' }, 'Resolution: '), '4K • 3840×2160'),
      p({}, span({ style: 'font-weight: 700;' }, 'Format: '), 'PNG / JPG / WebP'),
      p({}, span({ style: 'font-weight: 700;' }, 'Status: '), 'Ready for export')
    )
  );

  const controls = div({ className: 'tool-panel' },
    label({}, 'Upload image'),
    input({ type: 'file', accept: 'image/*' }),
    button({ type: 'button' }, 'Export image')
  );

  root.append(toolbar, preview, controls);
  return root;
}

export async function createVideoEditorPage(): Promise<HTMLElement> {
  const root = div({ className: 'card' },
    h1({}, 'Video Editor'),
    p({}, 'Trim, sequence, and caption video content for release.')
  );

  const timeline = div({ className: 'timeline' },
    div({ className: 'timeline-segment', style: 'width: 30%;' }, 'Intro'),
    div({ className: 'timeline-segment', style: 'width: 40%; background: #6d5efc;' }, 'Main cut'),
    div({ className: 'timeline-segment', style: 'width: 30%; background: #36cfc9;' }, 'Outro')
  );

  const preview = div({ className: 'media-preview' },
    div({ className: 'video-placeholder' }, 'Preview: 00:32 • 1080p'),
    div({ className: 'meta-panel' },
      p({}, span({ style: 'font-weight: 700;' }, 'Aspect ratio: '), '16:9'),
      p({}, span({ style: 'font-weight: 700;' }, 'Audio: '), 'Clean stereo mix'),
      p({}, span({ style: 'font-weight: 700;' }, 'Export: '), 'MP4 / MOV')
    )
  );

  root.append(
    timeline,
    preview,
    div({ className: 'tool-panel' },
      button({ type: 'button' }, 'Trim clip'),
      button({ type: 'button' }, 'Add captions'),
      button({ type: 'button' }, 'Render video')
    )
  );

  return root;
}

export async function createPdfScannerPage(): Promise<HTMLElement> {
  const root = div({ className: 'card' },
    h1({}, 'PDF Scanner & Editor'),
    p({}, 'Turn paper input into polished, searchable digital documents.')
  );

  const uploadRow = div({ className: 'tool-panel' },
    label({}, 'Upload PDF or image scan'),
    input({ type: 'file', accept: '.pdf,image/*' }),
    button({ type: 'button' }, 'Scan document')
  );

  const preview = div({ className: 'media-preview' },
    div({ className: 'pdf-placeholder' }, 'Scan preview: invoice.pdf'),
    div({ className: 'meta-panel' },
      p({}, span({ style: 'font-weight: 700;' }, 'Pages: '), '4 pages'),
      p({}, span({ style: 'font-weight: 700;' }, 'OCR: '), 'Enabled'),
      p({}, span({ style: 'font-weight: 700;' }, 'Output: '), 'PDF / JPG / TXT')
    )
  );

  root.append(
    uploadRow,
    preview,
    div({ className: 'tool-panel' },
      button({ type: 'button' }, 'Deskew'),
      button({ type: 'button' }, 'OCR text'),
      button({ type: 'button' }, 'Merge PDFs')
    )
  );

  return root;
}

export async function createScanPage(): Promise<HTMLElement> {
  const root = div({ className: 'card' },
    h1({}, 'CamScanner-style Scan'),
    p({}, 'Scan documents and convert them into PDF or photo output.')
  );

  const fileInput = input({
    type: 'file',
    accept: 'image/*,.pdf',
    capture: 'environment',
    style: 'display: none;'
  });

  const uploadButton = button({ type: 'button' }, 'Upload document');
  const cameraButton = button({ type: 'button' }, 'Use camera');
  const exportButtons = div({ className: 'tool-row' },
    button({ type: 'button', className: 'active' }, 'Convert to PDF'),
    button({ type: 'button' }, 'Convert to Photo')
  );

  const previewFrame = div({ className: 'media-preview' },
    div({ className: 'pdf-placeholder' }, 'No document selected yet')
  );

  const statusBox = div({ className: 'meta-panel' },
    p({}, span({ style: 'font-weight: 700;' }, 'Mode: '), 'PDF'),
    p({}, span({ style: 'font-weight: 700;' }, 'Status: '), 'Waiting for document upload or camera capture'),
    p({}, span({ style: 'font-weight: 700;' }, 'Quality: '), 'HD mode')
  );

  const uploadRow = div({ className: 'tool-panel' },
    label({}, 'Capture or upload a document'),
    uploadButton,
    cameraButton,
    button({ type: 'button' }, 'Auto-crop & straighten')
  );

  const actionRow = div({ className: 'tool-panel' },
    button({ type: 'button' }, 'Enhance contrast'),
    button({ type: 'button' }, 'OCR text'),
    button({ type: 'button' }, 'Export file')
  );

  let currentMode: 'pdf' | 'photo' = 'pdf';

  const updateMode = (mode: 'pdf' | 'photo') => {
    currentMode = mode;
    const [pdfBtn, photoBtn] = exportButtons.children as HTMLCollectionOf<HTMLButtonElement>;
    pdfBtn.classList.toggle('active', mode === 'pdf');
    photoBtn.classList.toggle('active', mode === 'photo');
    const modeText = statusBox.querySelectorAll('p')[0];
    modeText.textContent = `Mode: ${mode === 'pdf' ? 'PDF' : 'Photo'}`;
  };

  const setPreviewFromFile = (file: File) => {
    const previewImage = document.createElement('img');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      previewImage.alt = file.name;
      previewImage.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
          <rect width="100%" height="100%" fill="#e5e7eb"/>
          <text x="50%" y="50%" text-anchor="middle" fill="#111827" font-size="28" font-family="Arial">${file.name}</text>
        </svg>
      `);
    } else {
      previewImage.src = URL.createObjectURL(file);
      previewImage.alt = file.name;
    }

    previewImage.style.maxWidth = '100%';
    previewImage.style.maxHeight = '420px';
    previewImage.style.borderRadius = '12px';
    previewImage.style.objectFit = 'contain';
    previewFrame.replaceChildren(previewImage);

    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = `Status: ${file.name} ready for ${currentMode === 'pdf' ? 'PDF' : 'photo'} export`;
  };

  uploadButton.addEventListener('click', () => {
    fileInput.removeAttribute('capture');
    fileInput.click();
  });

  cameraButton.addEventListener('click', () => {
    fileInput.setAttribute('capture', 'environment');
    fileInput.click();
  });

  exportButtons.children[0].addEventListener('click', () => updateMode('pdf'));
  exportButtons.children[1].addEventListener('click', () => updateMode('photo'));

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      setPreviewFromFile(file);
    }
  });

  actionRow.children[2].addEventListener('click', () => {
    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = `Status: ${currentMode === 'pdf' ? 'Document exported as PDF' : 'Document exported as photo'} successfully`;
  });

  root.append(uploadRow, exportButtons, previewFrame, statusBox, actionRow);
  return root;
}