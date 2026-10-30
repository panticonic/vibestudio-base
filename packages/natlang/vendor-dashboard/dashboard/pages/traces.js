// Traces: the host's recorded calls, filtered, each opening into inputs, result, execution, service calls and feedback.
import { createExecutionModel, createExecutionView } from '../execution.js';
import { typedValueEditor } from '../arguments.js';
import { valueView, problemView, fieldLabel, downloadData, eventTimeline } from '../presentation.js';
import { definePage, ago, ms, tokens, widgets } from '../common.js';

export const id = 'traces', title = 'Traces', requires = ['traces'], runKinds = [];

export const mount = definePage({ id, requires, runKinds, async render(target, ctx) {
  const { h, fill, api } = ctx, { pill, emptyState, header } = widgets(ctx), arg = ctx.arg;
  let definition = '', program = '', callId = '';
  if (arg.startsWith('call-')) callId = decodeURIComponent(arg.slice(5));
  else if (arg.startsWith('program-')) program = decodeURIComponent(arg.slice(8));
  else if (arg) definition = decodeURIComponent(arg);
  const filters = { definition: h('input', { id: 'f-definition', placeholder: 'Function name', 'aria-label': 'Function name', type: 'search', value: definition }),
    outcome: h('select', { id: 'f-outcome', 'aria-label': 'Outcome' }, ['', 'done', 'failed', 'quiesced', 'running', 'interrupted'].map(value => h('option', { value }, value || 'any outcome'))),
    program: h('input', { id: 'f-program', placeholder: 'Program directory', 'aria-label': 'Program directory', type: 'search', value: program }) };
  const table = h('div', { class: 'table-wrap' }), detail = h('div', { class: 'stack' });
  let recordingOff = false;
  const load = ctx.attempt(async () => {
    const rows = await api.traces.list({ definition: filters.definition.value, outcome: filters.outcome.value, program: filters.program.value, limit: 150 })
      .catch(error => { if (error.status !== 409) throw error; recordingOff = true; return null; });
    if (!rows) { fill(table, emptyState('Call recording is off on this machine (NATLANG_CALL_STORE=off), so there are no traces to show. Unset it and restart the dashboard to record every call.')); return; }
    const filtered = Object.values(filters).some(field => field.value);
    fill(table, rows.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Function'), h('th', {}, 'Outcome'), h('th', {}, 'Executor'), h('th', {}, 'Started'), h('th', { class: 'num' }, 'Time'), h('th', { class: 'num' }, 'Tokens'))),
      h('tbody', {}, rows.map(row => h('tr', { class: `click${row.call_id === callId ? ' selected' : ''}`, onclick: () => { callId = row.call_id; traceDetail(ctx, row.call_id, detail); } },
        h('td', {}, row.definition_name, row.parent_call_id ? h('span', { class: 'small muted' }, ' · child') : null, h('div', { class: 'small muted' }, row.definition_source ?? '')),
        h('td', {}, pill(row.outcome)), h('td', {}, row.executor), h('td', {}, ago(row.started_at)), h('td', { class: 'num' }, ms(row.wall_ms)),
        h('td', { class: 'num' }, `${tokens(row.tokens_in)} + ${tokens(row.tokens_out)}`))))) : filtered ? h('div', { class: 'empty' }, 'No recorded calls match these filters.') : emptyState('No recorded calls yet. Run a program and its calls appear here.', ...(ctx.can('programs') ? [['Open Programs', 'programs', true]] : [])));
  });
  for (const field of Object.values(filters)) field.addEventListener('change', load);
  fill(target, header('Traces', 'Understand a call: its inputs, result, steps, and corrections.'),
    h('div', { class: 'row' }, filters.definition, filters.outcome, filters.program, h('button', { onclick: load }, 'Apply filters'), h('button', { class: 'ghost', onclick: () => { for (const field of Object.values(filters)) field.value = ''; load(); } }, 'Clear')),
    h('div', { class: 'split', style: 'grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr)' }, h('section', { class: 'panel' }, table), detail));
  await load();
  if (callId) await traceDetail(ctx, callId, detail);
  else if (!recordingOff) fill(detail, h('div', { class: 'panel empty' }, 'Select a call on the left to see its inputs, steps and result.'));
} });

async function traceDetail(ctx, id, container) {
  const { h, fill, api } = ctx, { pill, kv } = widgets(ctx), attempt = ctx.attempt;
  fill(container, h('div', { class: 'panel empty' }, 'Loading…'));
  const value = await api.traces.get(id);
  if (!value.record) {
    fill(container, h('section', { class: 'panel' }, h('h2', {}, value.running.definition_name), pill(value.running.outcome),
      h('div', { class: 'muted' }, `Started ${ago(value.running.started_at)}. The record is complete when the call ends.`)));
    return;
  }
  const record = value.record, cost = record.cost ?? {};
  const expected = typedValueEditor(ctx, { name: 'Expected result', value: record.output, required: true, description: 'Start from the recorded result and correct the fields that should change.' });
  const feedback = verdict => attempt(async () => {
    await api.traces.feedback(id, { verdict, ...(verdict === 'fix' ? { expected: expected.get() } : {}) });
    ctx.toast(verdict === 'fix' ? 'Correction saved.' : verdict === 'bad' ? 'Marked as needing improvement.' : 'Marked as useful and saved as an example.');
  });
  const events = h('div', {});
  // The recorded turns, drawn as the live view draws a running call.
  const execution = h('div', { class: 'calltree' }, h('div', { class: 'muted small' }, 'Loading the turns…'));
  api.traces.events(id).then(list => {
    const model = createExecutionModel(), call = { callId: record.call_id, name: record.definition.name, parentCallId: null };
    model.add({ type: 'call_start', ...call, at: Date.parse(record.started_at) });
    for (const event of list) if (event.kind !== 'state' && event.kind !== 'reduction') model.add({ type: 'trace', ...call, event });
    model.add({ type: 'call_end', ...call, outcome: record.outcome, detail: record.detail ?? '', at: Date.parse(record.started_at) + (cost.wall_ms ?? 0) });
    const viewer = createExecutionView(h, { traceLinks: false });
    viewer.update(model, { kind: 'call', status: record.outcome === 'done' ? 'done' : record.outcome === 'quiesced' ? 'stopped' : 'failed', drained: true, endedAt: new Date(Date.parse(record.started_at) + (cost.wall_ms ?? 0)).toISOString() });
    fill(execution, viewer.element);
  }, error => fill(execution, h('div', { class: 'muted small' }, error.message)));
  fill(container, h('section', { class: 'panel' },
    h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, record.definition.name), pill(record.outcome)),
    record.detail && record.outcome !== 'done' ? problemView(h, record.detail) : null,
    kv([['Call', h('span', { class: 'mono small' }, record.call_id)], ['Source', record.definition.source ?? record.definition.site],
      ['Executor', `${record.executor.kind}${record.executor.model_id ? ` · ${record.executor.model_id}` : ''}`],
      ['Cost', `${ms(cost.wall_ms)} · ${cost.model_requests ?? 0} model requests · ${tokens(cost.tokens_in)} + ${tokens(cost.tokens_out)} tokens · ${cost.evals ?? 0} evals`],
      ['Started', new Date(record.started_at).toLocaleString()], record.parent_call_id ? ['Caller', h('a', { href: ctx.href(`traces-call-${encodeURIComponent(record.parent_call_id)}`) }, record.parent_call_id)] : null]),
    h('h3', {}, 'Inputs'), valueView(h, record.inputs),
    h('h3', {}, 'Result'), valueView(h, record.output),
    h('h3', {}, 'Execution'), execution,
    record.effects?.length ? [h('h3', {}, 'Service calls'), h('div', { class: 'service-calls' }, record.effects.map(effect => h('details', { class: 'service-card' },
      h('summary', {}, h('strong', {}, `${effect.service} · ${effect.method}`), pill(effect.error ? 'Needs attention' : 'Finished', effect.error ? 'bad' : 'ok')),
      h('h4', {}, 'Arguments'), valueView(h, effect.args), h('h4', {}, effect.error ? 'Problem' : 'Result'), effect.error ? problemView(h, effect.error) : valueView(h, effect.result))))] : null,
    value.children.length ? [h('h3', {}, 'Calls it made'), h('div', { class: 'list' }, value.children.map(child => h('button', { class: 'item', onclick: () => traceDetail(ctx, child.call_id, container) },
      h('div', { class: 'title' }, h('span', {}, child.definition_name), pill(child.outcome)))))] : null,
    value.annotations.length ? [h('h3', {}, 'Feedback history'), h('div', { class: 'annotation-list' }, value.annotations.map(item => h('article', { class: 'annotation' },
      h('div', { class: 'row' }, h('strong', {}, fieldLabel(item.kind)), h('span', { class: 'small muted' }, `${item.source ?? 'User'} · ${ago(item.created_at)}`)), valueView(h, item.value))))] : null,
    h('h3', {}, 'Feedback'),
    h('div', { class: 'row' }, h('button', { onclick: feedback('good') }, 'Good: add as example'), h('button', { onclick: feedback('bad') }, 'Bad'),
      h('button', { class: 'primary', onclick: feedback('fix') }, 'Save correction')), expected.element,
    h('div', { class: 'row' }, h('button', { onclick: attempt(async () => {
      const list = await api.traces.events(id); fill(events, eventTimeline(h, list));
    }) }, 'Explore event history'), h('button', { onclick: attempt(async () => downloadData(await api.traces.events(id), 'trace.json')) }, 'Download trace')),
    events));
}
