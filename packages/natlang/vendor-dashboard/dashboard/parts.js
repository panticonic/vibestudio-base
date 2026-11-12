// View fragments more than one page draws: the model-profile chooser, the kept-loaded model panel, and the program dialogs.
import { problemView } from './presentation.js';
import { ago, tokens, widgets } from './common.js';

/** A chooser of the model profile a run uses, or null when the host offers no model configuration (it picks the model itself). */
export async function profileSelect(ctx, id, value = '') {
  if (!ctx.can('models')) return null;
  const { h } = ctx, config = await ctx.config();
  // The last entry leads to Models to connect a hosted provider; choosing it does not change the selection.
  const select = h('select', { id, onchange: () => { if (select.value === '+connect') { select.value = value; ctx.navigate('models'); } } },
    h('option', { value: '' }, `automatic (the program's model, else ${config.defaultProfile ?? 'built-in LFM3 1.7B'})`),
    Object.keys(config.profiles).map(name => h('option', { value: name, selected: name === value }, name)),
    h('option', { value: '+connect' }, 'Connect a hosted model (Claude, GPT, …)…'));
  return select;
}

/** The shared model servers on this machine: every run of a matching model uses one, and it stops when unused. */
export async function keptModelPanel(ctx) {
  const { h, fill, api } = ctx, { pill, kv } = widgets(ctx);
  const [state, config] = await Promise.all([api.models.modelServer(), ctx.config()]);
  const local = Object.entries(config.profiles).filter(([, entry]) => entry.kind === 'managed-local').map(([name]) => name);
  const choose = h('select', { id: 'kept-profile' }, h('option', { value: '' }, 'built-in LFM3 1.7B'),
    local.map(name => h('option', { value: name, selected: name === state.kept?.profile }, name)));
  const panel = h('section', { class: 'panel' });
  const busy = label => ctx.attempt(async action => { fill(panel, h('div', { class: 'muted' }, label)); await action(); });
  const keep = () => busy('Loading the model…')(async () => { await api.models.loadModel(choose.value || undefined); ctx.toast('Model kept loaded'); ctx.reload(); });
  const release = () => busy('Releasing…')(async () => { await api.models.unloadModel(); ctx.toast('No longer kept loaded'); ctx.reload(); });
  const stop = server => busy('Stopping…')(async () => { await api.models.stopModel(server.key); ctx.toast('Model server stopped'); ctx.reload(); });
  const servers = state.servers ?? [];
  fill(panel, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Loaded models'),
      state.kept ? h('div', { class: 'row' }, pill('kept loaded', 'ok'), h('button', { onclick: release }, 'Stop keeping')) :
        h('div', { class: 'row' }, choose, h('button', { class: 'primary', onclick: keep }, 'Keep loaded'))),
    h('div', { class: 'small muted' }, 'Runs, calls and terminal commands share one llama.cpp server per model: no load time per run, warm slots, one copy of the model in memory. A server stops after a few idle minutes with no run using it, unless it is kept loaded here.'),
    servers.length ? servers.map(server => h('div', { class: 'stack' }, kv([['Model', server.model + (server.adapters?.length || server.states?.length ?
      ` + ${server.adapters.length} tuned adapter${server.adapters.length === 1 ? '' : 's'}, ${server.states.length} native state${server.states.length === 1 ? '' : 's'}` : '')],
      ['Server', `${server.endpoint} · ${server.slots} slots of ${tokens(server.contextPerSlot)} tokens`],
      ['In use by', `${server.users} natlang process${server.users === 1 ? '' : 'es'}${server.kept ? ' (kept loaded here)' : ''}`],
      ['Since', ago(server.startedAt)], ['Stops', `after ${server.idleSeconds} s unused`]]),
      h('div', { class: 'row' }, h('button', { onclick: () => stop(server) }, 'Stop now')))) :
      h('div', { class: 'small muted' }, 'No model is loaded.'),
    state.kept?.log?.length ? h('details', { class: 'value-disclosure' }, h('summary', {}, 'Model notices'), ...state.kept.log.slice(-4).map(message => problemView(h, message))) : null);
  return panel;
}

/** Ask for a directory name and create a program there (optionally from a Playground instruction), then open it. */
export function programDialog(ctx, options = {}) {
  const { h } = ctx;
  const name = h('input', { placeholder: 'my-program', value: 'my-program', required: true, pattern: '[A-Za-z0-9][A-Za-z0-9._-]{0,63}' });
  const errorBox = h('div', { class: 'callout warn', hidden: true });
  const dialog = h('dialog', {}, h('form', { class: 'stack', onsubmit: async event => {
    event.preventDefault(); const button = event.target.querySelector('button[type=submit]'); button.disabled = true;
    try { const created = await ctx.api.programs.create({ name: name.value, ...options }); dialog.close(); ctx.navigate(`programs-${encodeURIComponent(created.directory)}`); }
    catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
    finally { button.disabled = false; }
  } }, h('h2', {}, options.instruction ? 'Save as a program' : 'Create a program'),
  h('p', {}, 'Creates a folder under the dashboard root, with instructions, sample input and a runnable entry point.'),
  h('label', { class: 'field' }, 'Directory name', name), errorBox,
  h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, 'Create program'), h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'))));
  ctx.modal(dialog); name.select();
}

/** Ask for a directory under the program root and open the program there. */
export function openProgramDialog(ctx) {
  const { h } = ctx;
  const path = h('input', { placeholder: 'relative/path/to/program', required: true });
  const errorBox = h('div', { class: 'callout warn', hidden: true });
  const dialog = h('dialog', {}, h('form', { class: 'stack', onsubmit: async event => {
    event.preventDefault();
    try { const program = await ctx.api.programs.detail(path.value); dialog.close(); ctx.navigate(`programs-${encodeURIComponent(program.directory)}`); }
    catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
  } }, h('h2', {}, 'Open a program'), h('p', {}, 'Enter a directory under this dashboard root. To open another workspace, start natlang dashboard --root PATH --open.'),
  path, errorBox, h('div', { class: 'row' }, h('button', { type: 'submit' }, 'Open'), h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'))));
  ctx.modal(dialog); path.focus();
}
