// System: the llama.cpp runtime, the call record store and its specialization setting, warm prompt openings and paths.
import { definePage, bytes, ago, widgets } from '../common.js';

export const id = 'system', title = 'System', requires = ['status', 'system'], runKinds = [];

export const mount = definePage({ id, requires, runKinds, async render(target, ctx) {
  const { h, fill, api } = ctx, { kv, header } = widgets(ctx), attempt = ctx.attempt;
  const [status, warm] = await Promise.all([api.status.get(), api.system.warm()]);
  const runtime = status.runtime;
  const warmPanel = h('section', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Warm prompt openings'),
      warm.length ? h('button', { onclick: attempt(async () => { await api.system.clearWarm(); ctx.toast('Cleared; the next calls prefill again'); ctx.reload(); }) }, 'Clear') : null),
    h('div', { class: 'small muted' }, 'Every call starts with the same long system prompt and tools. The managed server prefills each distinct opening once, saves it here and restores it into every slot, so later calls and runs skip that prefill.'),
    warm.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'State'), h('th', { class: 'num' }, 'Tokens'), h('th', { class: 'num' }, 'Size'), h('th', {}, 'Model · build · slots'), h('th', {}, 'Last used'))),
      h('tbody', {}, warm.map(item => h('tr', {}, h('td', { class: 'mono small' }, item.file.slice(0, 16)), h('td', { class: 'num' }, item.tokens ?? '–'),
        h('td', { class: 'num' }, bytes(item.bytes)), h('td', { class: 'mono small' }, `${item.model ?? '?'} · b${item.build ?? '?'} · ${item.layout ? item.layout.replace('x', ' × ') : '?'}`), h('td', {}, ago(item.usedAt))))))) :
      h('div', { class: 'muted' }, 'None saved yet; the first call of each kind saves one.'));
  const mode = h('select', { id: 'spec-mode', onchange: attempt(async event => { await api.system.saveStoreSettings({ specialization: event.target.value }); ctx.toast('Saved'); }) },
    ['off', 'shadow', 'on'].map(value => h('option', { value, selected: status.calls?.settings.specialization === value }, value)));
  fill(target, header('System', 'The model runtime, the call record store and where natlang keeps its state.'),
    h('section', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'llama.cpp runtime'),
      h('div', { class: 'row' }, runtime.selected?.fork || !ctx.can('run:runtime-build') ? null : h('button', { title: `Compile ${runtime.fork.repository} at ${runtime.fork.commit.slice(0, 10)} (needs git, cmake and a C++ compiler; CUDA when nvcc is present)`,
        onclick: () => ctx.startRun({ kind: 'runtime-build' }) }, 'Build the natlang fork'),
        ctx.can('run:setup') ? h('button', { class: 'primary', onclick: () => ctx.startRun({ kind: 'setup' }) }, runtime.selected ? 'Check and download the default model' : 'Install runtime and default model') : null)),
      kv([['Selected', runtime.selected ? `${runtime.selected.source} · ${runtime.selected.version} ${runtime.selected.source === 'fork' ? `(${runtime.fork.repository} at ${runtime.fork.commit.slice(0, 12)})` : `(build ${runtime.selected.build})`}` : 'none'],
        runtime.selected ? ['Build', runtime.selected.fork ? 'natlang fork: decision scoring, guided generation and native states' :
          'upstream llama.cpp: decisions fall back to model turns, no guided generation or tuned soft states'] : null,
        ['Path', runtime.selected?.path], ['Pinned', `${runtime.recommended.version} (build ${runtime.recommended.build})`],
        runtime.selected?.reason ? ['Note', runtime.selected.reason] : null]),
      runtime.candidates.length ? h('div', { class: 'small muted', style: 'white-space: pre-line' }, runtime.candidates.map(item => `${item.source}: ${item.path}${item.compatible ? '' : ` (${item.reason})`}`).join('\n')) : null),
    h('section', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Call records and specialization'),
      ctx.can('run:specialize') ? h('button', { onclick: () => ctx.startRun({ kind: 'specialize' }) }, 'Run the specializer') : null),
      status.calls ? kv([['Store', status.calls.root], ['Calls', status.calls.calls], ['Size', bytes(status.calls.bytes)],
        ['Specialization', h('span', {}, mode, h('span', { class: 'small muted' }, ' compiled crisp cases: off, shadow (checked, not served) or on'))]]) :
        h('div', { class: 'muted' }, 'Recording is off (NATLANG_CALL_STORE=off).')),
    warmPanel,
    h('section', { class: 'panel' }, h('h2', {}, 'Paths'), kv([['Project root', status.root], ['Model profiles', status.configPath], ['natlang', `${status.version} on Node ${status.node}`]])));
} });
