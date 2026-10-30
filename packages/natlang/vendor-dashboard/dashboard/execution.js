// The execution display consumes the runtime's existing live events. It never invents progress or runs a model.
import { createOutputView, problemView, codeView, valueView } from './presentation.js';
const terminal = status => status && status !== 'running';
const stopped = status => ['stopped', 'quiesced', 'interrupted'].includes(status);
const failed = status => terminal(status) && status !== 'done' && !stopped(status);
const text = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '';
const bounded = value => text(value).slice(-100_000);
const duration = value => value < 1000 ? `${Math.max(0, Math.round(value))} ms` : value < 60000 ? `${(value / 1000).toFixed(1)} s` : `${Math.floor(value / 60000)}m ${Math.floor(value / 1000) % 60}s`;

/** Fold both streamed and recorded events. Parents may arrive after their children. */
export function createExecutionModel() {
  const calls = new Map(), roots = [];
  const turnOf = (call, number = 1) => {
    let turn = call.turns.get(number);
    if (!turn) call.turns.set(number, turn = { number, reasoning: '', text: '', tools: [], results: [], failures: [], prompt: 0, completion: 0, working: false, nextAction: 0, retries: 0 });
    return turn;
  };
  return { calls, roots, add(event) {
    if (!event.callId) return;
    let call = calls.get(event.callId);
    if (!call) {
      call = { id: event.callId, name: event.name || 'Natural-language function', parent: event.parentCallId ?? null, definitionId: event.definitionId,
        status: 'running', phase: 'starting', detail: '', turns: new Map(), children: [], started: event.at ?? Date.now() };
      calls.set(call.id, call);
      const parent = calls.get(call.parent);
      (parent ? parent.children : roots).push(call);
      for (const child of calls.values()) if (child !== call && child.parent === call.id && roots.includes(child)) {
        roots.splice(roots.indexOf(child), 1); call.children.push(child);
      }
    }
    if (event.type === 'call_end') { call.status = event.outcome; call.detail = event.detail ?? ''; call.ended = event.at ?? Date.now(); return; }
    if (event.type === 'model_delta') {
      const turn = turnOf(call, event.turn); call.lastTurn = turn.number;
      const delta = event.delta;
      if (delta.type === 'reasoning') { turn.reasoning = bounded(turn.reasoning + delta.text); call.phase = 'thinking'; }
      else if (delta.type === 'text') { turn.text = bounded(turn.text + delta.text); call.phase = 'writing'; }
      else if (delta.type === 'tool_call') {
        const tool = turn.tools[delta.index] ??= { name: '', arguments: '' };
        if (delta.name) tool.name = delta.name;
        if (delta.arguments) tool.arguments = bounded(tool.arguments + delta.arguments);
        call.phase = 'preparing_action';
      } else if (delta.type === 'reset') {
        Object.assign(turn, { reasoning: '', text: '', tools: [], results: [], nextAction: 0 }); turn.retries++; call.phase = 'retrying';
      }
      return;
    }
    if (event.type !== 'trace') return;
    const data = event.event;
    if (data.kind === 'model_request') {
      const turn = turnOf(call, data.turn); call.lastTurn = turn.number;
      if (data.phase === 'start') { turn.working = true; turn.since = event.at; call.phase = 'reading'; }
      else {
        turn.working = false; turn.prompt = data.prompt_tokens ?? 0; turn.cached = data.cached_tokens ?? 0;
        turn.tokenUsage = data.prompt_tokens != null || data.completion_tokens != null;
        turn.completion = data.completion_tokens ?? 0; turn.ms = data.duration_ms;
        turn.prefillMs = data.prefill_ms; turn.generationMs = data.generation_ms;
        if (data.error) { turn.failures.push(text(data.error)); call.phase = 'retrying'; }
        else call.phase = 'working';
      }
    } else if (data.kind === 'proposal' && data.phase === 'generated') {
      const turn = turnOf(call, data.turn); call.lastTurn = turn.number;
      if (!turn.text && data.text) turn.text = bounded(data.text);
      for (const [index, [name, args]] of (data.calls ?? []).entries()) {
        const tool = turn.tools[index] ??= {};
        Object.assign(tool, { name, arguments: bounded(JSON.stringify(args ?? {})) });
      }
      if (turn.tools.length) call.phase = 'executing';
    } else if (data.kind === 'action') {
      const turn = turnOf(call, call.lastTurn), index = turn.nextAction++;
      const tool = turn.tools[index] ??= {};
      Object.assign(tool, { name: data.name, arguments: bounded(JSON.stringify(data.arguments ?? {})), outcome: data.outcome });
      turn.results[index] = bounded(data.result_text ?? '');
      if (data.outcome === 'rejected') { turn.failures.push(bounded(data.result_text || 'The step was rejected.')); call.phase = 'recovering'; }
      else call.phase = 'working';
    } else if (data.kind === 'scope_failure') {
      turnOf(call, call.lastTurn).failures.push(bounded(data.message)); call.phase = 'recovering';
    } else if (data.kind === 'model_incomplete') call.detail = `The model could not finish: ${data.reason}`;
  } };
}

export function lambdaName(call) {
  return call.name.startsWith('nl@') ? `Inline λ · ${call.name.slice(3)}` : call.name;
}

export function lambdaStatus(call, job = {}) {
  if (call.status === 'done') return 'Finished';
  if (call.status === 'quiesced' || call.status === 'stopped') return 'Stopped';
  if (call.status === 'interrupted') return 'Interrupted';
  if (failed(call.status)) return call.status === 'declined' ? 'Could not answer' : 'Needs attention';
  if (job.drained && terminal(job.status)) return job.status === 'stopped' || job.status === 'lost' ? 'Interrupted' : 'Ended without a recorded result';
  const children = call.children.filter(child => child.status === 'running');
  if (children.length) return `Waiting for ${children.length} child ${children.length === 1 ? 'call' : 'calls'}`;
  return { starting: 'Starting', reading: 'Reading the input', thinking: 'Working through the instructions', writing: 'Generating a response',
    preparing_action: 'Preparing the next step', executing: 'Running a step', recovering: 'Recovering from a step that failed', retrying: 'Retrying the model request', working: 'Working' }[call.phase] || 'Working';
}

export function executionSummary(model, job = {}) {
  const calls = [...model.calls.values()], running = calls.filter(call => call.status === 'running');
  const complete = calls.filter(call => call.status === 'done').length, problems = calls.filter(call => failed(call.status)).length;
  const active = job.drained && terminal(job.status) ? [] : running;
  return { active, complete, problems, total: calls.length, stopped: calls.filter(call => stopped(call.status)).length, unfinished: running.length - active.length };
}

/** Stream the code itself, never the JSON envelope that happens to carry the tool call. */
export function toolDraft(tool) {
  try {
    const args = JSON.parse(tool.arguments || '{}');
    if (tool.name === 'eval' && typeof args.code === 'string') return { kind: 'code', code: args.code };
    return { kind: 'value', value: tool.name === 'return_result' && Object.hasOwn(args, 'value') ? args.value : args };
  } catch {
    if (tool.name === 'eval') {
      const match = /"code"\s*:\s*"((?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*)/.exec(tool.arguments || '');
      if (match) { try { return { kind: 'code', code: JSON.parse('"' + match[1] + '"') }; } catch { /* wait for a complete escaped character */ } }
    }
    return { kind: 'pending' };
  }
}

/** Keyed DOM nodes preserve disclosure, focus and scroll while text and statuses stream into them. */
/** `traceLinks`: offer each call's recorded trace, at `href('traces-call-ID')` (default `#traces-call-ID`). */
export function createExecutionView(h, { traceLinks = true, href = route => `#${route}` } = {}) {
  const title = h('h2', {}, 'Live execution'), status = h('span', { class: 'execution-connection', role: 'status' });
  const headline = h('div', { class: 'execution-headline', role: 'status', 'aria-live': 'polite' });
  const counts = h('div', { class: 'small muted' }), list = h('div', { class: 'lambda-list' });
  const more = h('button', { hidden: true, type: 'button' });
  let paused = false, showAll = false, latest, disconnected = false;
  const pause = h('button', { type: 'button', 'aria-pressed': 'false', title: 'Pause this display while the program continues running.', onclick: () => {
    paused = !paused; pause.textContent = paused ? 'Resume updates' : 'Pause updates'; pause.setAttribute('aria-pressed', String(paused));
    status.textContent = paused ? 'Display paused · the program continues running' : '';
    if (!paused && latest) update(...latest);
  } }, 'Pause updates');
  const element = h('section', { class: 'panel execution-panel', 'aria-label': 'Live execution' },
    h('div', { class: 'row', style: 'justify-content: space-between' }, title, pause), status, headline, counts, list, more);
  const views = new Map();
  const set = (node, value) => {
    const next = text(value), previous = node.textContent;
    if (previous === next) return;
    if (previous && next.startsWith(previous) && node.childNodes.length === 1 && node.firstChild.nodeType === 3) node.firstChild.appendData(next.slice(previous.length));
    else node.textContent = next;
  };
  const select = calls => {
    if (showAll) return calls;
    const opened = calls.filter(call => views.get(call.id)?.details.open);
    const chosen = new Set([...opened, ...calls.filter(call => call.status === 'running' || failed(call.status)), ...calls.filter(call => call.status === 'done' || stopped(call.status)).slice(-6)].slice(0, Math.max(12, opened.length)));
    return calls.filter(call => chosen.has(call));
  };
  function callView(call) {
    if (views.has(call.id)) return views.get(call.id);
    const name = h('strong'), phase = h('span', { class: 'lambda-phase' }), elapsed = h('span', { class: 'small muted' });
    const steps = h('div', { class: 'lambda-steps' }), children = h('div', { class: 'lambda-children' });
    const problem = h('div', { class: 'callout warn', hidden: true });
    const details = h('details', { class: 'lambda', 'data-call-id': call.id }, h('summary', {},
      h('span', { class: 'lambda-signal', 'aria-hidden': 'true' }), h('span', { class: 'lambda-label' }, name, phase), elapsed),
      h('div', { class: 'lambda-body' }, problem, steps, children,
        traceLinks ? h('a', { class: 'small', href: href(`traces-call-${encodeURIComponent(call.id)}`) }, 'Open recorded trace') : null));
    const view = { details, name, phase, elapsed, steps, children, problem, turns: new Map() }; views.set(call.id, view); return view;
  }
  function turnView(view, turn) {
    if (view.turns.has(turn.number)) return view.turns.get(turn.number);
    const label = h('span'), metrics = h('p', { class: 'small muted' });
    const replyReader = createOutputView(h, { label: `Model output for step ${turn.number}`, className: 'stream-content' });
    const replyGroup = h('div', {}, h('p', { class: 'small muted' }, 'Model output · drafts may change until the call finishes'), replyReader.element);
    const reasonReader = createOutputView(h, { label: `Reasoning for step ${turn.number}`, className: 'stream-content' });
    const reasoning = h('details', { class: 'lambda-reasoning' }, h('summary', {}, 'Model reasoning'), reasonReader.element);
    const failures = h('div'), tools = h('div', { class: 'lambda-tools' });
    const details = h('details', { class: 'lambda-step' }, h('summary', {}, label), replyGroup, tools, failures, reasoning, metrics);
    view.steps.append(details);
    const result = { details, label, metrics, replyReader, replyGroup, reasonReader, reasoning, failures, tools, actions: new Map() };
    view.turns.set(turn.number, result); return result;
  }
  function updateCall(call, job) {
    const view = callView(call), active = call.status === 'running' && !(job.drained && terminal(job.status));
    set(view.name, lambdaName(call)); set(view.phase, lambdaStatus(call, job));
    set(view.elapsed, duration((call.ended ?? (job.drained && job.endedAt ? Date.parse(job.endedAt) : Date.now())) - call.started));
    view.details.dataset.state = active ? 'running' : call.status === 'done' ? 'done' : stopped(call.status) || job.status === 'stopped' ? 'stopped' : 'attention';
    view.problem.hidden = !call.detail || call.status === 'done';
    if (view.lastProblem !== call.detail) { view.lastProblem = call.detail; view.problem.replaceChildren(problemView(h, call.detail)); }
    for (const turn of call.turns.values()) {
      const node = turnView(view, turn), pending = active && turn.number === call.lastTurn;
      set(node.label, `Step ${turn.number}${pending ? ' · in progress' : ''}${turn.failures.length ? ` · ${call.status === 'done' ? 'recovered issue' : 'issue recorded'}` : ''}`);
      node.replyGroup.hidden = !turn.text; node.replyReader.update(turn.text, { running: pending });
      node.reasoning.hidden = !turn.reasoning; node.reasonReader.update(turn.reasoning, { running: pending });
      const received = turn.text.length + turn.reasoning.length + turn.tools.reduce((sum, tool) => sum + (tool?.arguments?.length ?? 0), 0);
      const usage = turn.working ? (received ? `Streaming · ${received.toLocaleString()} characters received` : 'Waiting for the model response. Some providers return a whole step at once.') :
        turn.tokenUsage ? `${turn.prompt.toLocaleString()} input tokens · ${turn.completion.toLocaleString()} generated tokens` : 'Model usage was not reported for this step.';
      const truncated = turn.text.length >= 100_000 || turn.reasoning.length >= 100_000 || turn.tools.some(tool => tool?.arguments?.length >= 100_000) || turn.results.some(result => result.length >= 100_000);
      set(node.metrics, `${usage}${turn.ms !== undefined ? ` · ${duration(turn.ms)}` : ''}${turn.retries ? ` · ${turn.retries} request ${turn.retries === 1 ? 'retry' : 'retries'}` : ''}${truncated ? ' · Showing the latest part of a long message; open the recorded trace for full details.' : ''}`);
      const failureText = turn.failures.join('\n');
      if (node.lastFailure !== failureText) { node.lastFailure = failureText; node.failures.replaceChildren(...turn.failures.map(message => problemView(h, message))); }
      for (const [index, tool] of turn.tools.entries()) {
        if (!tool) continue;
        let action = node.actions.get(index);
        if (!action) {
          const heading = h('span'), code = h('div', { class: 'action-content' }), result = createOutputView(h, { label: 'Step result', className: 'stream-content' });
          const resultGroup = h('div', {}, h('p', { class: 'small muted' }, 'Step result'), result.element);
          const details = h('details', { class: 'lambda-action' }, h('summary', {}, heading), code, resultGroup);
          action = { heading, code, result, resultGroup, details }; node.actions.set(index, action); node.tools.append(details);
        }
        const draft = toolDraft(tool);
        const label = { eval: 'Execute code', return_result: 'Return an answer', read_code: 'Read a helper', read_page: 'Read more input' }[tool.name] || (tool.name ? `Call ${tool.name}` : 'Preparing a tool call');
        set(action.heading, `${label}${tool.outcome === 'rejected' ? ' · rejected' : tool.outcome ? ' · finished' : pending ? ' · in progress' : ''}`);
        const signature = `${draft.kind}:${draft.kind === 'code' ? draft.code : tool.arguments}`;
        if (action.signature !== signature) {
          action.signature = signature;
          const top = action.code.scrollTop;
          action.code.replaceChildren(draft.kind === 'code' ? codeView(h, draft.code) : draft.kind === 'value' ? valueView(h, draft.value) : h('p', { class: 'small muted' }, 'Receiving the next step…'));
          action.code.scrollTop = top;
        }
        action.resultGroup.hidden = !turn.results[index]; action.result.update(turn.results[index] || '');
      }
      // A transport retry resets this step's draft rather than appending a duplicate execution.
      for (const [index, action] of node.actions) if (!turn.tools[index]) { action.details.remove(); node.actions.delete(index); }
    }
    const shown = select(call.children);
    for (const child of shown) updateCall(child, job);
    reconcile(view.children, shown.map(child => callView(child).details));
    if (shown.length < call.children.length) {
      const button = h('button', { type: 'button', onclick: () => { showAll = true; update(...latest); } }, `Show all ${call.children.length} child calls`); view.children.append(button);
    }
    return view.details;
  }
  function reconcile(parent, nodes) {
    // Keep retained nodes in place: replacing them would reset scroll, selections, or open disclosures.
    const desired = new Set(nodes);
    for (const child of [...parent.children]) if (!desired.has(child)) child.remove();
    nodes.forEach((node, index) => { if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null); });
  }
  function update(model, job, log = '') {
    latest = [model, job, log];
    if (paused) {
      set(status, job.status === 'running' ? 'Display paused · the program continues running' : 'Display paused · resume to see the latest execution');
      return;
    }
    const stats = executionSummary(model, job), stopping = job.status === 'stopped' && !job.endedAt, isRunning = job.status === 'running' || stopping;
    title.textContent = isRunning ? 'Live execution' : 'Execution';
    set(status, disconnected ? 'Reconnecting · your program may still be running' : isRunning ? 'Live · updates as your program runs' : job.drained ? 'Recorded execution' : 'Loading recorded execution…');
    pause.hidden = !isRunning && !paused;
    if (stopping) set(headline, 'Stopping the program…');
    else if (stats.active.length) {
      const focus = [...stats.active].reverse().find(call => !call.children.some(child => child.status === 'running')) ?? stats.active.at(-1);
      set(headline, `${lambdaName(focus)} · ${lambdaStatus(focus, job)}${stats.active.length > 1 ? ` · ${stats.active.length - 1} other ${stats.active.length === 2 ? 'call' : 'calls'} running` : ''}`);
    } else if (!stats.total && isRunning) {
      const lastLine = log.trim().split('\n').at(-1) || '';
      set(headline, /download/i.test(lastLine) ? 'Downloading the model' : /starting managed|loading.*model/i.test(lastLine) ? 'Loading the model' : job.kind === 'setup' ? 'Preparing the model runtime' : 'Preparing the program');
    } else { const noun = ['call', 'ask'].includes(job.kind) ? 'Function' : 'Program';
      set(headline, isRunning ? 'Model calls finished · the program is continuing' : job.status === 'done' ? `${noun} finished` : job.status === 'stopped' ? `${noun} stopped` : job.status === 'lost' ? 'Connection to the program was lost' : `${noun} needs attention`); }
    set(counts, stats.total ? `${stats.active.length} running · ${stats.complete} finished${stats.problems ? ` · ${stats.problems} ${stats.problems === 1 ? 'needs' : 'need'} attention` : ''}${stats.stopped ? ` · ${stats.stopped} stopped` : ''}${stats.unfinished ? ` · ${stats.unfinished} ${['stopped', 'lost'].includes(job.status) ? 'interrupted' : 'ended without a result'}` : ''}` :
      isRunning ? 'Natural-language functions will appear here as they start. Output streams alongside them.' : 'This run made no natural-language calls. See Output or Log for its result.');
    const shown = select(model.roots); for (const call of shown) updateCall(call, job);
    reconcile(list, shown.map(call => callView(call).details));
    more.hidden = model.roots.length <= shown.length;
    set(more, `Show all ${model.roots.length} top-level calls`);
  }
  more.addEventListener('click', () => { showAll = true; if (latest) update(...latest); });
  return { element, update, connection(connected) {
    if (disconnected === !connected) return;
    disconnected = !connected; if (latest && !paused) update(...latest);
  } };
}
