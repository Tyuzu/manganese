import { button, createButton, div, h1, p, uiClasses } from '../components/ui/dom';
import { createDetailPanel } from './shared';

export async function createVideoEditorPage(): Promise<HTMLElement> {
  const root = div({ className: uiClasses.card },
    h1({ className: 'm-0 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl' }, 'Video Editor'),
    p({ className: 'mt-3 text-sm leading-6 text-slate-600' }, 'Trim, sequence, and caption video content for release.')
  );

  const timeline = div({ className: 'mt-6 flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-100' },
    div({ className: 'flex items-center justify-center bg-slate-200 px-3 py-3 text-xs font-semibold text-slate-700', style: 'width: 30%;' }, 'Intro'),
    div({ className: 'flex items-center justify-center bg-violet-500 px-3 py-3 text-xs font-semibold text-white', style: 'width: 40%;' }, 'Main cut'),
    div({ className: 'flex items-center justify-center bg-cyan-400 px-3 py-3 text-xs font-semibold text-slate-900', style: 'width: 30%;' }, 'Outro')
  );

  const preview = div({ className: 'mt-6 grid gap-4 lg:grid-cols-[1.5fr_0.9fr]' },
    div({ className: 'flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-900 text-base font-semibold text-slate-200' }, 'Preview: 00:32 • 1080p'),
    createDetailPanel('Project summary', [
      { label: 'Aspect ratio', value: '16:9' },
      { label: 'Audio', value: 'Clean stereo mix' },
      { label: 'Export', value: 'MP4 / MOV' },
    ])
  );

  root.append(
    timeline,
    preview,
    div({ className: 'mt-6 flex flex-wrap gap-3' },
      button({ type: 'button', className: uiClasses.secondaryButton }, 'Trim clip'),
      button({ type: 'button', className: uiClasses.secondaryButton }, 'Add captions'),
      createButton('primary', { type: 'button' }, 'Render video')
    )
  );

  return root;
}
