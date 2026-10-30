// Overview: the model, runtime, call store and machine at a glance, recent runs and the busiest functions.
import { definePage, runLabel, ago, bytes, ms, tokens, widgets } from '../common.js';
import { keptModelPanel, programDialog } from '../parts.js';

export const id = 'overview', title = 'Overview', requires = ['status'], runKinds = [];

export const mount = definePage({ id, requires, runKinds, async render(target, ctx) {
  const { h, fill, api } = ctx, { pill, emptyState, header, tile } = widgets(ctx);
  const [status, runs, hot] = await Promise.all([api.status.get(), ctx.runs?.list() ?? [], api.traces?.hot().catch(() => []) ?? []]);
  const model = status.model, release = model.release;
  const runtime = status.runtime.selected;
  const problems = [];
  if (!runtime && model.kind === 'managed-local' && ctx.can('run:setup')) problems.push(['The llama.cpp runtime is not installed.', 'Install runtime and model', () => ctx.startRun({ kind: 'setup' })]);
  const downloading = release && !release.installed && release.download && !release.download.done && !release.download.error;
  const percent = download => Math.floor(100 * download.received / download.total);
  const progress = downloading ? h('div', { class: 'callout row' }, h('span', {}, `Downloading ${release.label} (${bytes(release.bytes)})…`),
    h('div', { class: 'bar', style: 'flex: 1' }, h('span', { style: `width: ${percent(release.download)}%` })), h('span', { class: 'small muted' }, `${percent(release.download)}%`)) : null;
  if (downloading) ctx.scope.every(ctx.attempt(async () => {
    const next = (await api.status.get()).model.release;
    if (next?.installed || !next?.download || next.download.done || next.download.error) return ctx.reload();
    progress.querySelector('.bar span').style.width = `${percent(next.download)}%`; progress.lastChild.textContent = `${percent(next.download)}%`;
  }), 1500);
  else if (release && !release.installed && ctx.can('models')) problems.push([`${release.label} (${bytes(release.bytes)}) is not downloaded yet; the first run would download it.`, 'Download now',
    ctx.attempt(async () => { await api.models.downloadStock(release.id); ctx.toast('Download started'); ctx.navigate('models'); })]);
  fill(target,
    header('Overview', 'Your programs, models, and recent work at a glance.',
      ctx.can('programs') ? h('button', { onclick: () => programDialog(ctx) }, 'Create program') : null,
      ctx.can('run:ask') ? h('button', { onclick: () => ctx.navigate('playground') }, 'Ask the model') : null,
      ctx.can('programs') ? h('button', { class: 'primary', onclick: () => ctx.navigate('programs') }, 'Run a program') : null),
    ...problems.map(([text, label, action]) => h('div', { class: 'callout warn row' }, h('span', {}, text), h('button', { onclick: action }, label),
      model.kind === 'managed-local' && ctx.can('models') ? h('button', { onclick: () => ctx.navigate('models') }, 'Use a hosted model instead') : null)), progress,
    h('div', { class: 'grid' },
      tile('Model', model.error ? 'Profile problem' : release?.label ?? model.model,
        model.error ?? `profile ${model.profile} · ${model.kind === 'managed-local' ? 'managed llama.cpp' : model.kind}${release ? (release.installed ? ' · downloaded' : downloading ? ' · downloading' : ' · not downloaded') : ''}`),
      tile('Runtime', runtime ? `llama.cpp ${runtime.version}` : 'not installed', runtime ? (runtime.source === 'fork' ? `natlang fork ${status.runtime.fork.commit.slice(0, 10)}` : `build ${runtime.build} · ${runtime.source}`) : `pinned ${status.runtime.recommended.version} (b${status.runtime.recommended.build})`),
      tile('Traces', status.calls ? `${status.calls.calls} calls` : 'recording off', status.calls ? `${bytes(status.calls.bytes)} · specialization ${status.calls.settings.specialization}` : ''),
      tile('Machine', `${status.machine.cpus} CPUs · ${bytes(status.machine.memory)}`, `${bytes(status.machine.free)} free · ${status.machine.platform}`)),
    ctx.can('models') ? await keptModelPanel(ctx) : null,
    h('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit, minmax(360px, 1fr))' },
      ctx.runs ? h('section', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Recent runs'), h('a', { href: ctx.href('runs') }, 'All runs')),
        runs.length ? runTable(ctx, runs.slice(0, 8), pill) : emptyState('No runs yet. Run a program, or try an instruction in the Playground.', ['Open Programs', 'programs', true], ['Open Playground', 'playground'])) : null,
      api.traces ? h('section', { class: 'panel' }, h('h2', {}, 'Busiest functions'),
        hot.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Function'), h('th', { class: 'num' }, 'Calls'), h('th', { class: 'num' }, 'Crisp'), h('th', { class: 'num' }, 'Tokens'))),
          h('tbody', {}, hot.slice(0, 8).map(row => h('tr', { class: 'click', onclick: () => ctx.navigate(`traces-${encodeURIComponent(row.definition_name)}`) },
            h('td', {}, row.definition_name, h('div', { class: 'small muted' }, row.definition_source ?? '')), h('td', { class: 'num' }, row.calls),
            h('td', { class: 'num' }, row.crisp_calls), h('td', { class: 'num' }, tokens(row.tokens))))))) :
          emptyState(status.calls ? 'No recorded calls yet. Every run records its function calls here.' : 'Call recording is off on this machine, so there is nothing to rank.')) : null));
} });

function runTable(ctx, runs, pill) {
  const { h } = ctx;
  return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Run'), h('th', {}, 'State'), h('th', {}, 'Started'), h('th', { class: 'num' }, 'Time'))),
    h('tbody', {}, runs.map(job => h('tr', { class: 'click', onclick: () => ctx.navigate(`runs-${job.id}`) },
      h('td', { class: 'mono' }, runLabel(job)), h('td', {}, pill(job.status)), h('td', {}, ago(job.startedAt)),
      h('td', { class: 'num' }, ms((job.endedAt ? Date.parse(job.endedAt) : Date.now()) - Date.parse(job.startedAt))))))));
}
