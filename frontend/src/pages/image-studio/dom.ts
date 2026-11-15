import { FILTER_DEFINITIONS } from './types';

export function buildImageStudioShell(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'image-studio';

  const style = document.createElement('style');
  style.textContent = `
    .image-studio {
      --ie-bg: #101216;
      --ie-panel: #181c22;
      --ie-panel-2: #202630;
      --ie-border: #303844;
      --ie-text: #e8edf4;
      --ie-muted: #929baa;
      --ie-accent: #79a9ff;
      --ie-radius: 10px;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: min(900px, 100%);
      min-height: 620px;
      overflow: hidden;
      background: var(--ie-bg);
      color: var(--ie-text);
      border: 1px solid var(--ie-border);
      border-radius: 12px;
      font: 13px/1.4 Inter, ui-sans-serif, system-ui, sans-serif;
      box-sizing: border-box;
    }

    .image-studio * {
      box-sizing: border-box;
    }

    .ie-topbar {
      display: flex;
      align-items: center;
      gap: 9px;
      flex-wrap: wrap;
      padding: 10px 12px;
      background: var(--ie-panel);
      border-bottom: 1px solid var(--ie-border);
    }

    .ie-brand {
      font-weight: 800;
      letter-spacing: .08em;
      margin-right: auto;
      color: #fff;
      white-space: nowrap;
    }

    .ie-brand span {
      color: var(--ie-accent);
    }

    .ie-button {
      border: 1px solid var(--ie-border);
      color: var(--ie-text);
      background: var(--ie-panel-2);
      border-radius: 7px;
      padding: 7px 10px;
      cursor: pointer;
      font: inherit;
      white-space: nowrap;
    }

    .ie-button:hover {
      border-color: #66768d;
      background: #2a3442;
    }

    .ie-button.primary {
      background: #315f9d;
      border-color: #477fca;
      color: white;
    }

    .ie-button.active {
      border-color: var(--ie-accent);
      color: var(--ie-accent);
      background: #24364e;
    }

    .ie-button:disabled {
      opacity: .4;
      cursor: not-allowed;
    }

    .ie-status-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-width: 120px;
      margin-left: auto;
    }

    .ie-status {
      color: var(--ie-muted);
      text-align: right;
      font-size: 11px;
      white-space: nowrap;
    }

    .ie-loader {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255,255,255,0.18);
      border-top-color: var(--ie-accent);
      border-radius: 50%;
      display: inline-block;
      animation: ie-spin 0.8s linear infinite;
      vertical-align: middle;
    }

    @keyframes ie-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .ie-tabs {
      display: flex;
      align-items: center;
      gap: 5px;
      min-height: 38px;
      padding: 4px 8px;
      overflow-x: auto;
      background: #14181e;
      border-bottom: 1px solid var(--ie-border);
    }

    .ie-tab-wrap {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 2px 4px 2px 2px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
    }

    .ie-tab-wrap.active {
      border-color: var(--ie-border);
      background: var(--ie-panel-2);
    }

    .ie-tab {
      border: none;
      color: var(--ie-muted);
      background: transparent;
      border-radius: 6px;
      padding: 6px 10px;
      max-width: 190px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      font: inherit;
    }

    .ie-tab.active {
      color: white;
      background: transparent;
    }

    .ie-tab-close {
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
      border-radius: 999px;
      color: var(--ie-muted);
      background: transparent;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
    }

    .ie-tab-close:hover {
      border-color: var(--ie-border);
      color: white;
      background: rgba(255, 255, 255, 0.04);
    }

    .ie-layout {
      display: grid;
      grid-template-columns: 218px minmax(0, 1fr) 250px;
      flex: 1;
      min-height: 0;
    }

    .ie-sidebar {
      background: var(--ie-panel);
      overflow: auto;
      padding: 14px;
    }

    .ie-sidebar.left {
      border-right: 1px solid var(--ie-border);
    }

    .ie-sidebar.right {
      border-left: 1px solid var(--ie-border);
    }

    .ie-section {
      margin-bottom: 19px;
    }

    .ie-section-title {
      color: #b9c2d0;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .12em;
      margin: 0 0 10px;
    }

    .ie-button-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .ie-button-row .ie-button {
      flex: 1;
    }

    .ie-field {
      display: block;
      margin: 0 0 13px;
    }

    .ie-field-label {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: #cbd3de;
      font-size: 11px;
      margin-bottom: 5px;
    }

    .ie-value {
      color: var(--ie-accent);
      font-variant-numeric: tabular-nums;
    }

    .ie-field input[type="range"] {
      width: 100%;
      accent-color: var(--ie-accent);
      cursor: pointer;
    }

    .ie-field input[type="number"],
    .ie-field input[type="text"],
    .ie-field select,
    .ie-select {
      width: 100%;
      border: 1px solid var(--ie-border);
      background: #11161d;
      color: var(--ie-text);
      border-radius: 6px;
      padding: 7px;
      font: inherit;
    }

    .ie-check {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 9px 0;
      color: #cbd3de;
      font-size: 12px;
    }

    .ie-check input {
      accent-color: var(--ie-accent);
    }

    .ie-workspace {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background:
        radial-gradient(circle at 50% 40%, #252b35 0%, #171b22 65%, #12161c 100%);
    }

    .ie-workspace-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      color: var(--ie-muted);
      background: rgba(15, 19, 25, .55);
      border-bottom: 1px solid rgba(255,255,255,.05);
    }

    .ie-canvas-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .ie-canvas-frame {
      position: relative;
      flex: 0 0 auto;
      background-color: #fff;
      background-image:
        linear-gradient(45deg, #ddd 25%, transparent 25%),
        linear-gradient(-45deg, #ddd 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ddd 75%),
        linear-gradient(-45deg, transparent 75%, #ddd 75%);
      background-size: 18px 18px;
      background-position:
        0 0, 0 9px, 9px -9px, -9px 0;
      box-shadow: 0 12px 40px rgba(0,0,0,.4);
    }

    .ie-canvas-frame canvas {
      display: block;
    }

    .ie-main-canvas {
      touch-action: none;
      user-select: none;
    }

    .ie-mask-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: .55;
      display: none;
    }

    .ie-empty {
      margin: auto;
      text-align: center;
      color: var(--ie-muted);
      max-width: 390px;
      padding: 30px;
    }

    .ie-empty strong {
      color: white;
      display: block;
      font-size: 18px;
      margin-bottom: 8px;
    }

    .ie-crop-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
    }

    .ie-small-note {
      color: var(--ie-muted);
      font-size: 10px;
      line-height: 1.5;
      margin-top: 7px;
    }

    .ie-footer {
      padding: 7px 12px;
      border-top: 1px solid var(--ie-border);
      color: var(--ie-muted);
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }

    @media (max-width: 900px) {
      .ie-layout {
        grid-template-columns: 180px minmax(0, 1fr);
      }

      .ie-sidebar.right {
        grid-column: 1 / -1;
        border-left: 0;
        border-top: 1px solid var(--ie-border);
        max-height: 260px;
      }
    }

    @media (max-width: 600px) {
      .ie-layout {
        grid-template-columns: 1fr;
      }

      .ie-sidebar.left {
        display: none;
      }

      .ie-sidebar.right {
        max-height: 300px;
      }

      .ie-workspace {
        min-height: 350px;
      }

      .ie-status {
        width: 100%;
        text-align: left;
      }
    }
  `;

  root.appendChild(style);
  root.insertAdjacentHTML('beforeend', `
    <header class="ie-topbar">
      <div class="ie-brand">PIXEL<span>STUDIO</span></div>

      <button class="ie-button" data-action="open">Open image</button>
      <button class="ie-button" data-action="import-project">Import project</button>
      <button class="ie-button" data-action="save-project">Export project JSON</button>

      <select class="ie-select" data-role="saved-projects" style="width:150px">
        <option value="">Saved projects</option>
      </select>

      <select class="ie-select" data-role="export-format" style="width:95px">
        <option value="image/png">PNG</option>
        <option value="image/jpeg">JPEG</option>
        <option value="image/webp">WebP</option>
        <option value="image/avif">AVIF</option>
      </select>

      <button class="ie-button primary" data-action="export">Export image</button>

      <span class="ie-status-wrap">
        <span class="ie-loader" data-role="loader" hidden></span>
        <span class="ie-status" data-role="status">Ready</span>
      </span>

      <input data-role="file-input" type="file" accept="image/*" multiple hidden>
      <input data-role="project-input" type="file" accept=".json,application/json" hidden>
    </header>

    <nav class="ie-tabs" data-role="tabs"></nav>

    <div class="ie-layout">
      <aside class="ie-sidebar left">
        <section class="ie-section">
          <h3 class="ie-section-title">Transform</h3>

          <div class="ie-button-row">
            <button class="ie-button" data-action="rotate-left">↶ Rotate</button>
            <button class="ie-button" data-action="rotate-right">Rotate ↷</button>
          </div>

          <div class="ie-button-row" style="margin-top:7px">
            <button class="ie-button" data-action="flip-x">Flip H</button>
            <button class="ie-button" data-action="flip-y">Flip V</button>
          </div>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Crop · source pixels</h3>

          <div class="ie-crop-grid">
            <label class="ie-field">
              <span class="ie-field-label">X</span>
              <input type="number" data-role="crop-x" min="0" value="0">
            </label>

            <label class="ie-field">
              <span class="ie-field-label">Y</span>
              <input type="number" data-role="crop-y" min="0" value="0">
            </label>

            <label class="ie-field">
              <span class="ie-field-label">Width</span>
              <input type="number" data-role="crop-width" min="1" value="1">
            </label>

            <label class="ie-field">
              <span class="ie-field-label">Height</span>
              <input type="number" data-role="crop-height" min="1" value="1">
            </label>
          </div>

          <div class="ie-button-row">
            <button class="ie-button" data-action="apply-crop">Apply crop</button>
            <button class="ie-button" data-action="reset-crop">Reset</button>
          </div>

          <p class="ie-small-note">
            Crop coordinates refer to the original image, before rotation.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Mask brush</h3>

          <button class="ie-button" data-action="toggle-brush" style="width:100%">
            Enable mask brush
          </button>

          <label class="ie-field" style="margin-top:12px">
            <span class="ie-field-label">
              Brush size
              <span class="ie-value" data-role="brush-value">32 px</span>
            </span>
            <input type="range" data-role="brush-size" min="2" max="200" value="32">
          </label>

          <label class="ie-check">
            <input type="checkbox" data-role="mask-enabled">
            Apply adjustments only to mask
          </label>

          <button class="ie-button" data-action="clear-mask" style="width:100%">
            Clear mask
          </button>

          <p class="ie-small-note">
            Paint on the image to define where adjustments are applied.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">View</h3>

          <label class="ie-field">
            <span class="ie-field-label">
              Zoom
              <span class="ie-value" data-role="zoom-value">100%</span>
            </span>
            <input type="range" data-role="zoom" min="25" max="400" value="100" step="5">
          </label>

          <button class="ie-button" data-action="fit" style="width:100%">
            Fit image
          </button>
        </section>
      </aside>

      <main class="ie-workspace">
        <div class="ie-workspace-toolbar">
          <span data-role="document-info">No image open</span>
          <span style="margin-left:auto" data-role="render-info"></span>
        </div>

        <div class="ie-canvas-scroll" data-role="canvas-scroll">
          <div class="ie-empty" data-role="empty">
            <strong>Open an image to begin</strong>
            Your original image remains unchanged. Edits are stored as project settings.
          </div>

          <div class="ie-canvas-frame" data-role="canvas-frame" hidden>
            <canvas class="ie-main-canvas" data-role="canvas"></canvas>
            <canvas class="ie-mask-overlay" data-role="mask-overlay"></canvas>
          </div>
        </div>
      </main>

      <aside class="ie-sidebar right">
        <section class="ie-section">
          <h3 class="ie-section-title">Adjustments</h3>
          <div data-role="filter-controls"></div>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Text overlay</h3>

          <label class="ie-field">
            <span class="ie-field-label">Bottom watermark / caption</span>
            <input type="text" data-role="text" placeholder="Enter text...">
          </label>

          <p class="ie-small-note">
            Text is rendered during preview and export.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Export quality</h3>

          <label class="ie-field">
            <span class="ie-field-label">
              Quality
              <span class="ie-value" data-role="quality-value">92%</span>
            </span>
            <input type="range" data-role="quality" min="10" max="100" value="92">
          </label>

          <p class="ie-small-note">
            Quality affects JPEG, WebP and AVIF. PNG is lossless.
          </p>
        </section>

        <section class="ie-section">
          <h3 class="ie-section-title">Project</h3>

          <div class="ie-button-row">
            <button class="ie-button" data-action="reset">Reset edits</button>
            <button class="ie-button" data-action="close">Close document</button>
          </div>
        </section>
      </aside>
    </div>

    <footer class="ie-footer">
      <span>Worker rendering · Tiled processing · IndexedDB autosave</span>
      <span data-role="engine-status">Checking renderer…</span>
    </footer>
  `);

  return root;
}

export function buildFilterControls(container: HTMLDivElement): void {
  container.replaceChildren();

  for (const definition of FILTER_DEFINITIONS) {
    const field = document.createElement('label');
    field.className = 'ie-field';

    field.innerHTML = `
      <span class="ie-field-label">
        <span>${definition.label}</span>
        <span class="ie-value" data-filter-value="${definition.key}">0</span>
      </span>
      <input
        type="range"
        data-filter="${definition.key}"
        min="${definition.min}"
        max="${definition.max}"
        step="${definition.step}"
        value="0"
      >
    `;

    container.appendChild(field);
  }
}
