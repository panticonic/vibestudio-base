// Shared by every dashboard page: the DOM builder, a disposal scope, the page context a host supplies, and the small widgets
// and formatters the pages draw with. Nothing here holds module-level state: a page's timers, listeners and caches live in
// the scope and context of its own mount, so several mounts can coexist and each one disposes completely.
import { messageSummary, valueSummary, fieldLabel } from './presentation.js';

/** `h(tag, attrs, ...children)` building elements of `doc` (the hosting page's document). */
export function createH(doc) {
  return function h(tag, attrs = {}, ...children) {
    const element = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
      else if (key === 'class') element.className = value;
      else if (key === 'html') element.innerHTML = value;
      else element.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false)
      element.append(child instanceof doc.defaultView.Node ? child : doc.createTextNode(String(child)));
    return element;
  };
}
/** Replace an element's children, skipping absent ones (null, undefined, false). */
export const fill = (element, ...children) => element.replaceChildren(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));

/**
 * What a mounted page owns until it is disposed: intervals, throttles, listeners, cleanup callbacks and an abort signal
 * for its requests. After disposal nothing new is registered, so work still settling in the background starts no timer.
 */
export function createScope() {
  const cleanups = [], controller = new AbortController();
  let disposed = false;
  const scope = {
    signal: controller.signal,
    get disposed() { return disposed; },
    /** Run `fn` when the scope is disposed (at once when it already is). */
    defer(fn) { if (disposed) fn(); else cleanups.push(fn); },
    every(fn, period) { if (disposed) return; const timer = setInterval(fn, period); cleanups.push(() => clearInterval(timer)); },
    listen(target, type, handler, options) { if (disposed) return; target.addEventListener(type, handler, options); cleanups.push(() => target.removeEventListener(type, handler, options)); },
    /** `fn` at most every `period` ms: at once when idle, else once more at the end of the window. `.now()` runs it immediately. */
    throttle(fn, period) {
      let last = -Infinity, timer;
      const run = () => { clearTimeout(timer); timer = undefined; last = Date.now(); fn(); };
      const throttled = () => { if (disposed) return; const wait = last + period - Date.now(); if (wait <= 0) run(); else timer ??= setTimeout(run, wait); };
      throttled.now = () => { if (!disposed) run(); };
      cleanups.push(() => clearTimeout(timer));
      return throttled;
    },
    dispose() { if (disposed) return; disposed = true; controller.abort(); for (const fn of cleanups.splice(0).reverse()) fn(); },
  };
  return scope;
}

/** Whether `host` offers `capability`: an API group (`programs`), `runs`, or `run:KIND` for a kind the run host starts. */
export function can(host, capability) {
  if (capability === 'runs') return Boolean(host.runs);
  if (capability.startsWith('run:')) return Boolean(host.runs?.kinds.includes(capability.slice(4)));
  return Boolean(host.api?.[capability]);
}

/**
 * The context a page draws with, built from what the host supplies: `{ api, runs?, navigate, toast, href?, refreshStatus?,
 * arg?, h? }` (types.d.ts DashboardHost). The page's own scope and element add the rest.
 */
export function pageContext(host, el, scope, id) {
  const doc = el.ownerDocument;
  const h = host.h ?? createH(doc);
  const toast = host.toast;
  let profiles;
  const ctx = {
    h, fill, api: host.api, runs: host.runs, scope, arg: host.arg ?? '',
    navigate: host.navigate,
    /** Remount this page at its current route: what a page does after it saved something that changes what it shows. */
    reload: () => host.navigate(host.arg ? `${id}-${host.arg}` : id),
    href: host.href ?? (route => `#${route}`),
    toast, refreshStatus: host.refreshStatus ?? (() => {}),
    can: capability => can(host, capability),
    /** The model configuration (profiles, stock models), fetched once per mount unless `fresh`. */
    config: fresh => (fresh || !profiles ? profiles = host.api.models.config() : profiles),
    root: el.closest('.nl-dash') ?? el,
    attempt: fn => async (...args) => { try { return await fn(...args); } catch (error) { toast(error.message, true); } },
    /** Show a dialog above the page; disposing the page closes it. */
    modal(dialog) {
      ctx.root.append(dialog);
      dialog.addEventListener('close', () => dialog.remove());
      scope.defer(() => { if (dialog.open) dialog.close(); dialog.remove(); });
      dialog.showModal();
      return dialog;
    },
    /** Start a run on the run host, announce it and open it in the Runs page. */
    async startRun(spec) {
      try { const run = await host.runs.start(spec); toast(`Started: ${runLabel(run)}`); host.navigate(`runs-${run.id}`); return run; }
      catch (error) { toast(error.message, true); }
    },
  };
  return ctx;
}

/** Make `el` a styled dashboard root when no ancestor is one; returns the undo. */
function ensureRoot(el) {
  if (el.closest('.nl-dash')) return () => {};
  el.classList.add('nl-dash');
  return () => el.classList.remove('nl-dash');
}

/**
 * Mount one page: `render(target, ctx)` draws into `target` (an async function: loading shows until it settles; a failure
 * is drawn in place). Returns the dispose function every page's `mount` returns.
 */
export function mountView(el, host, id, render) {
  const scope = createScope(), unroot = ensureRoot(el), ctx = pageContext(host, el, scope, id), { h } = ctx;
  const target = h('div', { class: 'view' }, h('div', { class: 'empty' }, 'Loading…'));
  fill(el, target);
  (async () => render(target, ctx))().catch(error => { if (!scope.disposed) fill(target, h('div', { class: 'callout warn' }, error.message)); });
  return () => { scope.dispose(); el.replaceChildren(); unroot(); };
}

/** A page module's `mount` for `render`, checking that the host offers what the page needs. */
export function definePage({ id, requires = [], runKinds = [], render }) {
  return (el, host) => {
    const missing = [...requires, ...runKinds.map(kind => `run:${kind}`)].filter(capability => !can(host, capability));
    if (missing.length) throw new Error(`The ${id} page needs ${missing.join(', ')} from its host.`);
    return mountView(el, host, id, render);
  };
}

// ---- formatting -----------------------------------------------------------------------------------------------------
export const bytes = n => n == null ? '–' : n >= 2 ** 30 ? `${(n / 2 ** 30).toFixed(1)} GB` : n >= 2 ** 20 ? `${(n / 2 ** 20).toFixed(0)} MB` : `${Math.round(n / 1024)} KB`;
export const ms = n => n == null ? '–' : n >= 60000 ? `${Math.floor(n / 60000)}m ${Math.round(n / 1000) % 60}s` : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`;
export const tokens = n => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0);
export const ago = iso => { if (!iso) return '–'; const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(iso).toLocaleString(); };
export const short = (value, limit = 160) => { const text = valueSummary(value); return text === undefined ? '' : text.length > limit ? text.slice(0, limit) + '…' : text; };
const OUTCOME = { done: 'ok', running: 'info', failed: 'bad', quiesced: 'warn', stopped: 'idle', lost: 'warn', interrupted: 'warn', blocked: 'warn' };

/** A run's name in lists and headings. */
export function runLabel(job) {
  const path = job.meta?.path || (job.kind === 'run' || job.kind === 'call' || job.kind === 'build' || job.kind === 'test' ? job.argv?.[1] : '');
  const name = path && path !== '.' ? path.split('/').filter(Boolean).at(-1) : job.cwd?.split('/').filter(Boolean).at(-1);
  return job.kind === 'run' ? `${name || 'Program'}${job.meta?.target ? ` · ${job.meta.target}` : ''}` : job.kind === 'call' ? name || 'Function call' :
    job.kind === 'ask' ? 'Playground experiment' : job.kind === 'setup' ? 'Prepare model' : job.kind === 'build' ? `Build ${name || 'program'}` : job.kind === 'test' ? `Test ${name || 'program'}` : fieldLabel(job.kind);
}

/** Small pieces of page furniture, drawn with the context's `h`. */
export function widgets(ctx) {
  const { h } = ctx;
  const pill = (text, kind = OUTCOME[text] ?? 'idle') => h('span', { class: `pill ${kind}`, 'data-status': text },
    ({ done: 'Finished', running: 'Running', failed: 'Needs attention', lost: 'Interrupted', quiesced: 'Stopped', stopped: 'Stopped' })[text] || text);
  /** An empty state that says what is missing and offers the next step as links (`[label, route, primary]`). */
  const emptyState = (text, ...actions) => h('div', { class: 'empty' }, h('p', {}, text),
    actions.length ? h('div', { class: 'row' }, actions.map(([label, route, primary]) => h('a', { class: `button${primary ? ' primary' : ''}`, href: ctx.href(route) }, label))) : null);
  const header = (title, text, ...actions) => h('div', { class: 'head' }, h('div', {}, h('h1', {}, title), text ? h('p', {}, text) : null), h('div', { class: 'row' }, actions));
  const kv = pairs => h('dl', { class: 'kv' }, pairs.filter(Boolean).flatMap(([key, value]) => [h('dt', {}, key), h('dd', {}, value ?? '–')]));
  const tile = (label, value, sub) => h('div', { class: 'panel tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
  return { pill, emptyState, header, kv, tile };
}

export { messageSummary };
