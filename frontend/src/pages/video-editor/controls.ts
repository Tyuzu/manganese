import type { VideoFilters } from './types';

type ControlsDeps = {
  pushState: () => void;
  renderToolControls: () => void;
  applyVideoFilters: () => void;
  filters: VideoFilters;
};

export function createEditorControls({
  pushState,
  renderToolControls,
  applyVideoFilters,
  filters,
}: ControlsDeps) {
  function createSliderControl(
    title: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
  ) {
    const container = document.createElement('div');
    container.className = 'editor-slider-container';

    const header = document.createElement('div');
    header.className = 'editor-slider-header';

    const titleLabel = document.createElement('label');
    titleLabel.className = 'editor-slider-label';
    titleLabel.textContent = title;

    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'editor-slider-value';
    valueDisplay.textContent = Number(value).toFixed(1);

    header.append(titleLabel, valueDisplay);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(value);
    slider.step = '0.1';
    slider.className = 'editor-slider-input';

    slider.oninput = (event: Event) => {
      const nextValue = Number((event.target as HTMLInputElement).value);
      valueDisplay.textContent = nextValue.toFixed(1);
      onChange(nextValue);
    };

    slider.onchange = () => {
      pushState();
    };

    container.append(header, slider);
    return container;
  }

  function createSelectDropdown(
    options: string[],
    selected: string,
    onChange: (value: string) => void,
  ) {
    const select = document.createElement('select');
    select.className = 'editor-select';

    options.forEach((option) => {
      const element = document.createElement('option');
      element.value = option;
      element.textContent = option.toUpperCase();
      element.selected = option === selected;
      select.append(element);
    });

    select.onchange = () => {
      onChange(select.value);
    };

    return select;
  }

  function createPresetButton(
    name: string,
    onClick: () => void,
  ) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-preset-btn';
    btn.textContent = name;
    btn.onclick = onClick;
    return btn;
  }

  function createThumbnailPresetCard(
    name: string,
    presetValues: Partial<VideoFilters>,
    icon: string,
  ) {
    const card = document.createElement('div');
    card.className = 'editor-thumbnail-card';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'editor-thumbnail-icon';
    iconDiv.textContent = icon;

    const namePara = document.createElement('p');
    namePara.className = 'editor-thumbnail-title';
    namePara.textContent = name;

    card.append(iconDiv, namePara);

    card.onclick = () => {
      Object.assign(filters, presetValues);
      applyVideoFilters();
      pushState();
      renderToolControls();
    };

    return card;
  }

  return {
    createSliderControl,
    createSelectDropdown,
    createPresetButton,
    createThumbnailPresetCard,
  };
}