import {
  button,
  div,
  input,
  label,
  p,
} from '../../components/ui/dom';
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
    const valueDisplay = div(
      {
        className:
          'text-xs font-mono text-violet-400 font-bold',
      },
      Number(value).toFixed(1),
    );

    const slider = input({
      type: 'range',
      min: String(min),
      max: String(max),
      value: String(value),
      step: '0.1',

      className:
        'w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500',

      oninput: (event: Event) => {
        const nextValue = Number(
          (event.target as HTMLInputElement).value,
        );

        valueDisplay.textContent = nextValue.toFixed(1);

        onChange(nextValue);
      },

      onchange: () => {
        pushState();
      },
    });

    return div(
      {
        className: 'space-y-1',
      },

      div(
        {
          className:
            'flex justify-between items-center',
        },

        label(
          {
            className:
              'text-xs font-medium text-slate-300',
          },
          title,
        ),

        valueDisplay,
      ),

      slider,
    );
  }

  function createSelectDropdown(
    options: string[],
    selected: string,
    onChange: (value: string) => void,
  ) {
    const select = document.createElement('select');

    select.className =
      'bg-slate-950 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-violet-500';

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
    return button(
      {
        type: 'button',

        className:
          'rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-left text-xs font-medium text-slate-200 hover:border-violet-500 hover:text-white transition-all shadow-sm',

        onclick: onClick,
      },

      name,
    );
  }

  function createThumbnailPresetCard(
    name: string,
    presetValues: Partial<VideoFilters>,
    icon: string,
  ) {
    const card = div(
      {
        className:
          'flex flex-col items-center justify-center p-3 rounded-xl border border-slate-700 bg-slate-900/70 hover:border-violet-500 hover:bg-slate-900 cursor-pointer transition-all shadow-sm text-center group',
      },

      div(
        {
          className:
            'text-2xl mb-1 group-hover:scale-110 transition-transform',
        },
        icon,
      ),

      p(
        {
          className:
            'text-xs font-semibold text-slate-200',
        },
        name,
      ),
    );

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
