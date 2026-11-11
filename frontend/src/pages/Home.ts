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
    style: 'display: none;'
  });

  const uploadButton = button({ type: 'button' }, 'Upload document');
  const cameraButton = button({ type: 'button' }, 'Use camera');
  const captureButton = button({ type: 'button' }, 'Capture');
  const flashButton = button({ type: 'button' }, 'Flash off');
  const retakeButton = button({ type: 'button' }, 'Retake');

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

  const liveControls = div({ className: 'tool-panel' },
    captureButton,
    flashButton,
    retakeButton
  );

  const actionRow = div({ className: 'tool-panel' },
    button({ type: 'button' }, 'Enhance contrast'),
    button({ type: 'button' }, 'OCR text'),
    button({ type: 'button' }, 'Export file')
  );

  let currentMode: 'pdf' | 'photo' = 'pdf';
  let stream: MediaStream | null = null;
  let flashEnabled = false;
  let cameraReady = false;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.style.width = '100%';
  video.style.height = '420px';
  video.style.objectFit = 'cover';
  video.style.borderRadius = '12px';
  video.style.background = '#0f172a';

  const cameraOverlay = div({
    style: 'position: absolute; inset: 0; border: 2px solid rgba(255,255,255,0.8); border-radius: 12px; pointer-events: none;'
  });

  const updateMode = (mode: 'pdf' | 'photo') => {
    currentMode = mode;
    const [pdfBtn, photoBtn] = exportButtons.children as HTMLCollectionOf<HTMLButtonElement>;
    pdfBtn.classList.toggle('active', mode === 'pdf');
    photoBtn.classList.toggle('active', mode === 'photo');
    const modeText = statusBox.querySelectorAll('p')[0];
    modeText.textContent = `Mode: ${mode === 'pdf' ? 'PDF' : 'Photo'}`;
  };

  const showLivePreview = () => {
    const wrapper = div({ style: 'position: relative; width: 100%; height: 420px;' });
    wrapper.append(video, cameraOverlay);
    previewFrame.replaceChildren(wrapper);
    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = 'Status: Live camera preview active';
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const statusText = statusBox.querySelectorAll('p')[1];
      statusText.textContent = 'Status: Camera access is not supported on this browser';
      return;
    }

    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      cameraReady = true;
      showLivePreview();
    } catch (err) {
      const statusText = statusBox.querySelectorAll('p')[1];
      statusText.textContent = 'Status: Unable to access camera. Please upload a file instead.';
    }
  };

  const setPreviewFromFile = (file: File) => {
    stopCamera();
    cameraReady = false;

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

  const capturePhoto = () => {
    if (!cameraReady || !stream) {
      const statusText = statusBox.querySelectorAll('p')[1];
      statusText.textContent = 'Status: Start the camera before capturing';
      return;
    }

    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);

    const image = document.createElement('img');
    image.src = canvas.toDataURL('image/png');
    image.alt = 'Captured document';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '420px';
    image.style.borderRadius = '12px';
    image.style.objectFit = 'contain';

    if (flashEnabled) {
      previewFrame.style.boxShadow = '0 0 0 9999px rgba(255,255,255,0.55)';
    }

    previewFrame.replaceChildren(image);
    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = `Status: Photo captured for ${currentMode === 'pdf' ? 'PDF export' : 'photo export'}`;
    stopCamera();
    cameraReady = false;
    previewFrame.style.boxShadow = 'none';
  };

  uploadButton.addEventListener('click', () => {
    fileInput.click();
  });

  cameraButton.addEventListener('click', () => {
    void startCamera();
  });

  captureButton.addEventListener('click', () => {
    capturePhoto();
  });

  flashButton.addEventListener('click', () => {
    flashEnabled = !flashEnabled;
    flashButton.textContent = flashEnabled ? 'Flash on' : 'Flash off';
    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = flashEnabled
      ? 'Status: Flash enabled for next capture'
      : 'Status: Flash disabled';
  });

  retakeButton.addEventListener('click', () => {
    void startCamera();
  });

  exportButtons.children[0].addEventListener('click', () => updateMode('pdf'));
  exportButtons.children[1].addEventListener('click', () => updateMode('photo'));

  const handleSelectedFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    setPreviewFromFile(file);
  };

  fileInput.addEventListener('change', () => {
    handleSelectedFile(fileInput.files?.[0]);
  });

  actionRow.children[2].addEventListener('click', () => {
    const statusText = statusBox.querySelectorAll('p')[1];
    statusText.textContent = `Status: ${currentMode === 'pdf' ? 'Document exported as PDF' : 'Document exported as photo'} successfully`;
  });

  root.append(uploadRow, liveControls, exportButtons, previewFrame, statusBox, actionRow);
  return root;
}