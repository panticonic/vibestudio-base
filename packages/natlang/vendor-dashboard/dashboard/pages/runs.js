// Runs: every run the host knows, and the selected one followed live: its lambdas (the runtime's live events), output and log.
import { createExecutionModel, createExecutionView } from '../execution.js';
import { createOutputView, problemView } from '../presentation.js';
import { definePage, runLabel, ago, widgets } from '../common.js';
import { rerunSpec } from '../run-host.js';

export const id = 'runs', title = 'Runs', requires = ['runs'], runKinds = [];

export const mount = definePage({ id, requires, runKinds, async render(target, ctx) {
  const { h, fill, runs } = ctx, { pill, emptyState, header } = widgets(ctx);
  const jobs = await runs.list();
  const selected = ctx.arg || jobs[0]?.id;
  const list = h('div', { class: 'list scroll' });
  const drawList = rows => fill(list, rows.length ? rows.map(job => h('button', { class: `item${job.id === selected ? ' selected' : ''}`, onclick: () => ctx.navigate(`runs-${job.id}`) },
    h('div', { class: 'title' }, h('span', { class: 'mono' }, runLabel(job)), pill(job.status)),
    h('div', { class: 'desc' }, `${job.kind} · ${ago(job.startedAt)}`))) : emptyState('No runs yet. Run a program, or try an instruction in the Playground.', ['Open Programs', 'programs', true], ['Open Playground', 'playground']));
  drawList(jobs);
  ctx.scope.defer(runs.subscribe(next => { jobs.splice(0, jobs.length, ...next); drawList(jobs); }, error => ctx.toast(error.message, true)));
  const detail = h('div', { class: 'stack' });
  fill(target, header('Runs', 'Follow work as it happens, then revisit any result.'),
    h('div', { class: 'split' }, h('section', { class: 'panel', style: 'padding: 6px 10px' }, list), detail));
  if (selected) runDetail(ctx, selected, detail);
} });

/** One run, followed until it ends: header and actions, then the Output, Lambdas and Log tabs. */
function runDetail(ctx, id, container) {
  const { h, fill, runs } = ctx, { pill } = widgets(ctx), attempt = ctx.attempt;
  const state = { out: '', err: '', model: createExecutionModel(), tab: 'output', job: null, drained: false };
  const body = h('div', { class: 'stack' }), headLine = h('div', { class: 'row', style: 'justify-content: space-between' });
  const tabs = h('div', { class: 'tabs' }), summary = h('div', {}), execution = createExecutionView(h, { traceLinks: ctx.can('traces'), href: ctx.href });
  const failureTitle = h('strong'), failureMessage = h('div', { class: 'run-failure-message' });
  const failureBox = h('div', { class: 'callout warn', hidden: true }, failureTitle, failureMessage,
    h('p', {}, 'See Output, expand a lambda that needs attention, or open Log for details.'));
  summary.append(failureBox);
  const outputReader = createOutputView(h, { label: 'Program output', empty: 'Your result will appear here. Follow live execution alongside it.', controls: true, className: 'program-output' });
  const output = outputReader.content;
  const logReader = createOutputView(h, { label: 'Program log', empty: 'No log messages.', controls: true }), log = logReader.element;
  const field = h('input', { id: 'job-input', 'aria-label': 'Program input', placeholder: 'Type input for the program and press Enter', style: 'flex: 1' });
  const input = h('form', { class: 'row', onsubmit: attempt(async event => {
    event.preventDefault(); await runs.input(id, field.value); field.value = '';
  }) }, field, h('button', { type: 'submit' }, 'Send'));
  let followOutput = true, outputPending = false, headerKey = '', mountedTab = '', lastFailure = '';
  const follow = h('button', { type: 'button', hidden: true, onclick: () => { followOutput = true; output.scrollTop = output.scrollHeight; follow.hidden = true; } }, 'Follow output');
  ctx.scope.listen(output, 'scroll', () => {
    if (outputPending) return;
    followOutput = output.scrollHeight - output.scrollTop - output.clientHeight < 28;
    follow.hidden = followOutput;
  });
  const outputPane = h('section', { class: 'panel output-panel' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Program output'), follow), outputReader.element, input);
  const workspace = h('div', { class: 'run-workspace' }, execution.element, outputPane);
  fill(container, h('section', { class: 'panel' }, headLine, summary, tabs), body);
  const buttons = new Map();
  for (const [key, label] of [['output', 'Output'], ['live', 'Lambdas'], ['log', 'Log']]) {
    const button = h('button', { type: 'button', onclick: () => { state.tab = key; draw(); } }, label); buttons.set(key, button); tabs.append(button);
  }
  const updateText = (node, value, follow = false) => {
    if (node.textContent === value) return;
    const previous = node.scrollTop, old = node.textContent;
    if (old && value.startsWith(old) && node.childNodes.length === 1 && node.firstChild.nodeType === 3) node.firstChild.appendData(value.slice(old.length));
    else node.textContent = value;
    node.scrollTop = follow ? node.scrollHeight : previous;
  };
  const draw = () => {
    const job = state.job; if (!job) return;
    const key = `${job.id}:${job.status}:${job.exitCode}`;
    if (key !== headerKey) {
      headerKey = key;
      const commandOpen = headLine.querySelector('.run-command')?.open ?? false;
      const command = job.argv ? `natlang ${job.argv.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}` : '';
      fill(headLine, h('div', { class: 'stack', style: 'gap: 2px' }, h('h2', {}, runLabel(job)),
        command ? h('details', { class: 'run-command', open: commandOpen }, h('summary', { class: 'small muted' }, 'Terminal details'), h('span', { class: 'small muted' }, 'Use the same inputs and model from your terminal. '), h('button', { type: 'button', class: 'ghost small', onclick: attempt(async () => { await navigator.clipboard.writeText(command); ctx.toast('Command copied'); }) }, 'Copy command'), job.exitCode !== null ? h('span', { class: 'small muted' }, `Exit code ${job.exitCode}`) : null) : null),
        h('div', { class: 'row' }, pill(job.status),
          ctx.can('programs') && (job.meta?.program || job.kind === 'run') ? h('button', { onclick: () => ctx.navigate(`programs-${encodeURIComponent(job.meta?.program ?? job.meta?.path ?? '.')}`) }, 'Program and source') : null,
          job.status === 'running' ? h('button', { class: 'danger', onclick: attempt(async () => { state.job = await runs.stop(id); draw(); }) }, 'Stop') :
            h('button', { onclick: attempt(async () => { await runs.remove(id); ctx.navigate('runs'); }) }, 'Remove'),
          ['run', 'call', 'ask'].includes(job.kind) && ctx.can(`run:${job.kind}`) ? h('button', { onclick: () => ctx.startRun(rerunSpec(job)) }, 'Run again') : null));
    }
    failureBox.hidden = !['failed', 'lost'].includes(job.status);
    if (!failureBox.hidden) {
      updateText(failureTitle, job.status === 'lost' ? 'The run was interrupted.' : 'The run failed.');
      const message = job.kind === 'test' ? state.out.trim() || state.err.trim() : state.err.trim() || state.out.trim();
      if (message !== lastFailure) { lastFailure = message; failureMessage.replaceChildren(problemView(h, message || 'See Log for details.')); }
    }
    if (mountedTab !== state.tab) {
      mountedTab = state.tab;
      if (state.tab === 'output') { workspace.append(execution.element, outputPane); fill(body, workspace); }
      else if (state.tab === 'live') fill(body, execution.element);
      else fill(body, log);
    }
    for (const [key, button] of buttons) { button.classList.toggle('active', key === state.tab); button.setAttribute('aria-pressed', String(key === state.tab)); }
    buttons.get('live').textContent = `Lambdas${state.model.calls.size ? ` (${state.model.calls.size})` : ''}`;
    input.hidden = !job.interactive || job.status !== 'running';
    outputPending = true;
    const outputTop = output.scrollTop;
    outputReader.update(state.out, { running: job.status === 'running' });
    output.scrollTop = followOutput ? output.scrollHeight : outputTop;
    requestAnimationFrame(() => { outputPending = false; });
    logReader.update(state.err, { running: job.status === 'running' });
    execution.update(state.model, { ...job, drained: state.drained }, state.err);
  };
  // Events can arrive faster than the page should redraw; the end of a run and a change of state draw at once.
  const redraw = ctx.scope.throttle(draw, 120);
  let status;
  ctx.scope.defer(runs.watch(id, {
    update(chunk) {
      const changed = chunk.run.status !== status;
      status = chunk.run.status;
      state.job = chunk.run; state.out += chunk.stdout; state.err += chunk.stderr;
      for (const event of chunk.live) state.model.add(event);
      state.drained = chunk.drained;
      execution.connection(true);
      if (changed) ctx.refreshStatus();
      if (changed || chunk.drained) redraw.now(); else redraw();
    },
    connection: connected => execution.connection(connected),
    error: error => fill(container, h('div', { class: 'callout warn' }, error.message)),
  }));
}
