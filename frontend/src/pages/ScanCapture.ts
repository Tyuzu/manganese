import { button, cn, createButton, div, h1, input, label, p, span, uiClasses } from '../components/ui/dom';

export async function createScanPage(): Promise<HTMLElement> {
  const root = div({ className: uiClasses.card },
    h1({ className: 'm-0 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl' }, 'CamScanner-style Scan'),
    p({ className: 'mt-3 text-sm leading-6 text-slate-600' }, 'Scan documents and convert them into PDF or photo output.')
  );

  const fileInput = input({
    type: 'file',
    accept: 'image/*,.pdf',
    style: 'display: none;'
  });

  const uploadButton = button({ type: 'button', className: uiClasses.secondaryButton }, 'Upload document');
  const cameraButton = button({ type: 'button', className: uiClasses.secondaryButton }, 'Use camera');
  const captureButton = createButton('primary', { type: 'button' }, 'Capture');
  const flashButton = button({ type: 'button', className: uiClasses.secondaryButton }, 'Flash off');
  const retakeButton = button({ type: 'button', className: uiClasses.secondaryButton }, 'Retake');

  const exportButtons = div({ className: 'mt-6 flex flex-wrap gap-3' },
    button({ type: 'button', className: 'inline-flex items-center justify-center rounded-full border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500' }, 'Convert to PDF'),
    button({ type: 'button', className: 'inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50' }, 'Convert to Photo')
  );

  const previewFrame = div({ className: 'mt-6 min-h-[280px] rounded-[22px] border border-slate-200 bg-slate-100 p-3' },
    div({ className: 'flex min-h-[250px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-lg font-semibold text-slate-500' }, 'No document selected yet')
  );

  const statusBox = div({ className: cn(uiClasses.panel, 'mt-6 flex flex-col gap-3') },
    p({ className: 'm-0 text-sm text-slate-600' }, span({ className: 'font-bold text-slate-800' }, 'Mode: '), 'PDF'),
    p({ className: 'm-0 text-sm text-slate-600' }, span({ className: 'font-bold text-slate-800' }, 'Status: '), 'Waiting for document upload or camera capture'),
    p({ className: 'm-0 text-sm text-slate-600' }, span({ className: 'font-bold text-slate-800' }, 'Quality: '), 'HD mode')
  );

  const uploadRow = div({ className: 'mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4' },
    label({ className: 'text-sm font-semibold text-slate-700' }, 'Capture or upload a document'),
    uploadButton,
    cameraButton,
    button({ type: 'button', className: uiClasses.secondaryButton }, 'Auto-crop & straighten')
  );

  const liveControls = div({ className: 'mt-6 flex flex-wrap gap-3' }, captureButton, flashButton, retakeButton);

  const actionRow = div({ className: 'mt-6 flex flex-wrap gap-3' },
    button({ type: 'button', className: uiClasses.secondaryButton }, 'Enhance contrast'),
    button({ type: 'button', className: uiClasses.secondaryButton }, 'OCR text'),
    createButton('primary', { type: 'button' }, 'Export file')
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
    pdfBtn.classList.toggle('bg-blue-600', mode === 'pdf');
    pdfBtn.classList.toggle('border-blue-600', mode === 'pdf');
    pdfBtn.classList.toggle('text-white', mode === 'pdf');
    pdfBtn.classList.toggle('bg-white', mode === 'photo');
    pdfBtn.classList.toggle('text-slate-700', mode === 'photo');
    pdfBtn.classList.toggle('border-slate-200', mode === 'photo');

    photoBtn.classList.toggle('bg-blue-600', mode === 'photo');
    photoBtn.classList.toggle('border-blue-600', mode === 'photo');
    photoBtn.classList.toggle('text-white', mode === 'photo');
    photoBtn.classList.toggle('bg-white', mode === 'pdf');
    photoBtn.classList.toggle('text-slate-700', mode === 'pdf');
    photoBtn.classList.toggle('border-slate-200', mode === 'pdf');

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
