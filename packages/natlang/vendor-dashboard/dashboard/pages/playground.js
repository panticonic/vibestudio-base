// Playground: try an instruction with example input as an `ask` run, then save it as a program.
import { definePage, widgets } from '../common.js';
import { profileSelect, programDialog } from '../parts.js';

export const id = 'playground', title = 'Playground', requires = [], runKinds = ['ask'];

export const mount = definePage({ id, requires, runKinds, async render(target, ctx) {
  const { h, fill } = ctx, { header } = widgets(ctx);
  const instruction = h('textarea', { id: 'pg-instruction', rows: 3 }, 'Summarize the input in one sentence, then list any action items.');
  const input = h('textarea', { id: 'pg-input', rows: 7 }, 'Hi team, the March invoice run failed for 14 customers because the payment provider rotated its API key. Ops rotated our copy at 10:40. Please re-run billing for those accounts today and email them an apology.');
  const returns = h('input', { id: 'pg-returns', placeholder: 'string', value: '{ summary: string; actions: string[] }' });
  const profile = await profileSelect(ctx, 'pg-profile');
  const run = h('button', { class: 'primary', title: 'Ctrl+Enter', onclick: () => ctx.startRun({ kind: 'ask', instruction: instruction.value, input: input.value,
    returns: returns.value.trim() || undefined, profile: profile?.value || undefined }) }, 'Run');
  for (const field of [instruction, input, returns]) field.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); run.click(); } });
  fill(target, header('Playground', 'Try an instruction with example input, follow its execution, and save it as a program.'),
    h('section', { class: 'panel' },
      h('label', { class: 'field' }, 'Instruction', instruction), h('label', { class: 'field' }, 'Input (passed as the call\'s input)', input),
      h('div', { class: 'row' }, h('label', { class: 'field', style: 'flex: 1' }, 'Result type (TypeScript)', returns), profile ? h('label', { class: 'field' }, 'Model profile', profile) : null),
      h('div', { class: 'row' }, run,
        ctx.can('programs') ? h('button', { onclick: () => programDialog(ctx, { instruction: instruction.value, input: input.value, returns: returns.value.trim() || 'string', profile: profile?.value || undefined }) }, 'Save as program') : null,
        h('span', { class: 'small muted' }, 'Ctrl+Enter runs from any field.'))));
} });
