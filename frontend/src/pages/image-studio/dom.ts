import { FILTER_DEFINITIONS } from './types';

export function buildImageStudioShell(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'image-studio';

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
