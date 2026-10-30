// Run hosts: how a page starts, follows and stops runs (types.d.ts RunHost). A run yields stdout, stderr and the runtime's
// live events; the Runs page draws them identically whichever host produced them.
//  - httpRunHost: natlang's dashboard server, where each run is a CLI subprocess whose output files are read by offset.
//  - inProcessRunHost: a runtime embedded in the host, where each run is `runtime.run` with an `onLive` subscriber.

/** The spec that starts a run again, from its record. */
export function rerunSpec(run) {
  const meta = run.meta ?? {};
  if (run.kind === 'call') return { kind: 'call', function: meta.path, inputs: meta.inputs ?? {}, profile: meta.profile, program: meta.program };
  if (run.kind === 'ask') return { kind: 'ask', instruction: meta.instruction, input: meta.input, returns: meta.returns, profile: meta.profile };
  return { kind: 'run', path: meta.path ?? '.', target: meta.target, args: meta.args ?? [], profile: meta.profile };
}

/** A run host over the job routes of the dashboard server (`api.jobs`). */
export function httpRunHost(api) {
  const subscribers = new Set();
  let refreshTimer;
  const refresh = async () => {
    let runs;
    try { runs = await api.jobs.list(); }
    catch (error) { for (const subscriber of [...subscribers]) subscriber.error?.(error); return; }
    for (const subscriber of [...subscribers]) subscriber.listener(runs);
  };
  return {
    kinds: ['run', 'call', 'ask', 'test', 'build', 'setup', 'runtime-build', 'tune', 'specialize'],
    list: () => api.jobs.list(),
    async start(spec) { const run = await api.jobs.start(spec); refresh(); return run; },
    async stop(id) { const run = await api.jobs.stop(id); refresh(); return run; },
    async remove(id) { await api.jobs.remove(id); refresh(); },
    input: async (id, text) => { await api.jobs.input(id, text); },
    subscribe(listener, error) {
      const subscriber = { listener, error };
      subscribers.add(subscriber);
      refreshTimer ??= setInterval(refresh, 4000);
      return () => { subscribers.delete(subscriber); if (!subscribers.size) { clearInterval(refreshTimer); refreshTimer = undefined; } };
    },
    watch(id, observer) {
      const controller = new AbortController(), offsets = { stdout: 0, stderr: 0, live: 0 };
      let previous, busy = false, failures = 0, nextPoll = 0, finished = false, timer;
      const stopWatching = () => { finished = true; clearInterval(timer); controller.abort(); };
      const poll = async () => {
        const value = await api.jobs.read(id, offsets, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
        if (finished) return;
        const statusChanged = value.job.status !== previous;
        previous = value.job.status;
        offsets.stdout = value.stdout.offset; offsets.stderr = value.stderr.offset; offsets.live = value.live.offset;
        const live = [];
        for (const line of value.live.text.split('\n')) if (line) { try { live.push(JSON.parse(line)); } catch { /* only complete event lines are supplied */ } }
        const drained = value.job.status !== 'running' && Boolean(value.job.endedAt) && !value.live.text && !value.stdout.text && !value.stderr.text;
        failures = 0; observer.connection?.(true);
        if (drained) stopWatching();
        observer.update({ run: value.job, stdout: value.stdout.text, stderr: value.stderr.text, live, drained });
        if (statusChanged) refresh();
      };
      const step = async () => {
        if (busy || finished || Date.now() < nextPoll) return;
        busy = true;
        try { await poll(); }
        catch (error) {
          if (finished) return;
          // The server answered with a refusal (no such run): there is nothing to reconnect to. A request that never got an answer is retried.
          if (error.status) { stopWatching(); observer.error?.(error); return; }
          failures++; observer.connection?.(false); nextPoll = Date.now() + Math.min(4000, 350 * 2 ** Math.min(failures, 4));
        } finally { busy = false; }
      };
      timer = setInterval(step, 350);
      step();
      return stopWatching;
    },
  };
}

// ---- in-process -----------------------------------------------------------------------------------------------------
const specTitle = spec => `${spec.kind} ${spec.path ?? spec.function ?? (spec.instruction ? spec.instruction.slice(0, 60) : '')}`.trim();
/** Run-record `meta`: what `rerunSpec` and the pages read, in the shape the dashboard server records. */
function specMeta(spec) {
  switch (spec.kind) {
    case 'run': return { path: spec.path, target: spec.target ?? '', args: spec.args ?? [], profile: spec.profile };
    case 'call': return { path: spec.function, inputs: spec.inputs ?? {}, profile: spec.profile, program: spec.program };
    case 'ask': return { instruction: spec.instruction, input: spec.input ?? '', returns: spec.returns ?? null, profile: spec.profile };
    default: return spec.path === undefined ? undefined : { path: spec.path };
  }
}
const printed = value => { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); return text.endsWith('\n') ? text : text + '\n'; };

/**
 * A run host on an embedded runtime. `executors[kind](spec, io)` turns a spec into the work to do; it runs inside
 * `runtime.run`, so the natlang calls it makes report to the run's live events. Its return value is printed to stdout
 * (strings as they are, anything else as JSON); a throw fails the run and its message goes to stderr. Stopping a run
 * aborts the runtime task through `io.signal`.
 */
export function inProcessRunHost(runtime, executors, { now = Date.now } = {}) {
  const runs = new Map(), subscribers = new Set();
  let sequence = 0;
  const copy = state => ({ ...state.run });
  const list = () => [...runs.values()].map(copy).reverse();
  const notify = () => { const snapshot = list(); for (const subscriber of [...subscribers]) subscriber.listener(snapshot); };
  const publish = (state, chunk) => { for (const watcher of [...state.watchers]) watcher.update({ run: copy(state), stdout: '', stderr: '', live: [], drained: false, ...chunk }); };
  const ended = state => state.run.status !== 'running' && state.run.endedAt !== null;
  /** Keep the history watchers replay compact: consecutive text or reasoning deltas of one turn are one event. */
  const retain = (state, event) => {
    const last = state.live.at(-1);
    if (event.type === 'model_delta' && (event.delta.type === 'text' || event.delta.type === 'reasoning') && last?.type === 'model_delta' &&
        last.callId === event.callId && last.turn === event.turn && last.delta.type === event.delta.type)
      state.live[state.live.length - 1] = { ...last, delta: { type: event.delta.type, text: last.delta.text + event.delta.text } };
    else state.live.push(event);
  };
  const write = (state, stream, text) => { state[stream] += text; publish(state, { [stream]: text }); };
  function finish(state, status, exitCode) {
    state.run = { ...state.run, status: state.run.status === 'stopped' ? 'stopped' : status, exitCode, endedAt: new Date(now()).toISOString() };
    publish(state, { drained: true });
    notify();
  }
  const find = id => { const state = runs.get(id); if (!state) throw new Error(`no run ${id}`); return state; };
  return {
    kinds: Object.keys(executors),
    list: async () => list(),
    async start(spec) {
      const execute = executors[spec.kind];
      if (!execute) throw new Error(`This host cannot start a ${spec.kind} run.`);
      const id = `run-${++sequence}`, controller = new AbortController();
      const state = { run: { id, kind: spec.kind, title: specTitle(spec), status: 'running', exitCode: null, startedAt: new Date(now()).toISOString(), endedAt: null,
        interactive: false, ...(specMeta(spec) ? { meta: specMeta(spec) } : {}) }, stdout: '', stderr: '', live: [], watchers: new Set(), controller };
      runs.set(id, state);
      const io = { signal: controller.signal, stdout: text => write(state, 'stdout', text), stderr: text => write(state, 'stderr', text) };
      const onLive = event => { const stamped = { at: now(), ...event }; retain(state, stamped); publish(state, { live: [stamped] }); };
      runtime.run(() => execute(spec, io), { signal: controller.signal, onLive, name: state.run.title }).then(
        value => { if (value !== undefined) io.stdout(printed(value)); finish(state, 'done', 0); },
        error => {
          if (controller.signal.aborted) finish(state, 'stopped', null);
          else { io.stderr(`${error?.message ?? error}\n`); finish(state, 'failed', 1); }
        });
      notify();
      return copy(state);
    },
    async stop(id) {
      const state = find(id);
      if (state.run.status === 'running') { state.run = { ...state.run, status: 'stopped' }; state.controller.abort(); publish(state, {}); notify(); }
      return copy(state);
    },
    async remove(id) {
      const state = find(id);
      if (state.run.status === 'running') throw new Error('stop the run before removing it');
      runs.delete(id); notify();
    },
    input: async () => { throw new Error('the run does not read input'); },
    subscribe(listener, error) {
      const subscriber = { listener, error };
      subscribers.add(subscriber);
      return () => { subscribers.delete(subscriber); };
    },
    watch(id, observer) {
      const state = runs.get(id);
      if (!state) { observer.error?.(new Error(`no run ${id}`)); return () => {}; }
      // Everything so far is delivered before anything new, within this call: no event can fall between the replay and the subscription.
      state.watchers.add(observer);
      observer.update({ run: copy(state), stdout: state.stdout, stderr: state.stderr, live: [...state.live], drained: ended(state) });
      return () => { state.watchers.delete(observer); };
    },
  };
}
