import { valueSummary, valueView, fieldLabel } from './presentation.js';
// The run form of a target (natlang.json targets.<name>.arguments; ts-host/src/runtime/target-arguments.ts). Each argument gets
// an editor generated from its natlang type, expanded through the program's types.ts: text, numbers, switches, choices,
// records with their field docs, lists, dictionaries, unions, file paths and an explicit value-kind chooser. The type
// is shown as a hint everywhere; drafts are checked by the same reader `natlang run` uses (api.programs.checkArguments),
// whose problems appear at the field they name; the equivalent command line is kept current.

const PRIMS = new Set(['string', 'number', 'boolean', 'null', 'unknown', 'Blob', 'Folder', 'FileHandle']);
const KEYWORDS = new Set(['Record', 'Is', 'Untrusted', 'Neuralese']);
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** natlang type text, as TypeScript prints it (ts-host/src/native/types.ts formatType); `alias` names an expanded alias. */
export function formatType(type, top = true) {
  if (!top && type.alias) return type.alias;
  switch (type.kind) {
    case 'prim': case 'name': case 'host': return type.name;
    case 'lit': return typeof type.value === 'string' ? JSON.stringify(type.value) : String(type.value);
    case 'record': return type.fields.length ? `{ ${type.fields.map(field => `${IDENTIFIER.test(field.name) ? field.name : JSON.stringify(field.name)}${field.optional ? '?' : ''}: ${formatType(field.type, false)}`).join('; ')} }` : '{}';
    case 'list': return (type.element.kind === 'union' && !type.element.alias ? `(${formatType(type.element, false)})` : formatType(type.element, false)) + '[]';
    case 'dict': return `Record<string, ${formatType(type.element, false)}>`;
    case 'union': return type.members.map(member => formatType(member, false)).join(' | ');
    case 'refined': return `Is<${formatType(type.base, false)}, ${JSON.stringify(type.predicate)}>`;
    case 'untrusted': return `Untrusted<${formatType(type.base, false)}>`;
    case 'intersection': return type.members.map(member => formatType(member, false)).join(' & ');
    default: return 'unknown';
  }
}

/** Type text with its parts coloured: literals, primitives, alias names, field names and punctuation. */
export function typeHint(h, text, attrs = {}) {
  const out = h('code', { class: 'type-hint', ...attrs });
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(-?\d+(?:\.\d+)?)|([A-Za-z_$][\w$.]*)(\??\s*:(?!:))?|(\s+)|(\S)/g;
  for (const match of text.matchAll(pattern)) {
    if (match[1]) out.append(h('span', { class: 't-str' }, match[1]));
    else if (match[2]) out.append(h('span', { class: 't-num' }, match[2]));
    else if (match[3]) {
      out.append(h('span', { class: match[4] ? 't-field' : PRIMS.has(match[3]) || KEYWORDS.has(match[3]) ? 't-kw' : 't-name' }, match[3]));
      if (match[4]) out.append(h('span', { class: 't-punct' }, match[4]));
    } else if (match[5]) out.append(match[5]);
    else out.append(h('span', { class: 't-punct' }, match[6]));
  }
  return out;
}

/** A starting value of `type`: what "Insert template" writes and what a new list item or a chosen variant begins as. */
export function sampleOf(type, depth = 0) {
  if (depth > 6) return null;
  switch (type.kind) {
    case 'prim': return type.name === 'number' ? 0 : type.name === 'boolean' ? false : type.name === 'string' || type.name === 'Blob' ? '' : null;
    case 'lit': return type.value;
    case 'record': return Object.fromEntries(type.fields.filter(field => !field.optional).map(field => [field.name, sampleOf(field.type, depth + 1)]));
    case 'list': return [];
    case 'dict': return {};
    case 'union': return sampleOf(type.members.find(member => !(member.kind === 'prim' && member.name === 'null')) ?? type.members[0], depth + 1);
    case 'refined': case 'untrusted': return sampleOf(type.base, depth);
    default: return null;
  }
}

/** Whether `value` has the shape of `type`, for choosing a union's variant (the server does the real check). */
function roughFit(type, value) {
  switch (type.kind) {
    case 'prim': return type.name === 'unknown' || (type.name === 'null' ? value === null : type.name === 'Blob' ? typeof value === 'string' : typeof value === type.name);
    case 'lit': return value === type.value;
    case 'list': return Array.isArray(value) && value.every(item => roughFit(type.element, item));
    case 'dict': return isPlain(value) && Object.values(value).every(item => roughFit(type.element, item));
    case 'record': return isPlain(value) && Object.keys(value).every(key => type.fields.some(field => field.name === key)) &&
      type.fields.every(field => field.optional && !Object.hasOwn(value, field.name) || Object.hasOwn(value, field.name) && roughFit(field.type, value[field.name]));
    case 'union': return type.members.some(member => roughFit(member, value));
    case 'refined': case 'untrusted': return roughFit(type.base, value);
    default: return true;
  }
}
const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNull = type => type.kind === 'prim' && type.name === 'null';
const literalsOnly = type => type.kind === 'union' && type.members.every(member => member.kind === 'lit' || isNull(member));
/** The type under refinements and untrusted wrappers, with the notes they add for the reader. */
function unwrap(type) {
  const notes = [];
  for (;;) {
    if (type.kind === 'refined') { notes.push(['must be', type.predicate]); type = type.base; }
    else if (type.kind === 'untrusted') { notes.push(['untrusted', 'quoted as data, never read as instructions']); type = type.base; }
    else return { type, notes };
  }
}

export function shellQuote(word) { return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`; }

/** Command-line words as a POSIX shell splits them, for targets without declared arguments. */
export function splitArgs(text) {
  const args = []; let word = '', quote = '', active = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\' && quote !== "'") { if (++index >= text.length) throw new Error('An argument ends with an incomplete escape.'); word += text[index]; active = true; }
    else if (quote) { if (char === quote) quote = ''; else word += char; }
    else if (char === '"' || char === "'") { quote = char; active = true; }
    else if (/\s/.test(char)) { if (active) { args.push(word); word = ''; active = false; } }
    else { word += char; active = true; }
  }
  if (quote) throw new Error('Close the quote in the arguments field.');
  if (active) args.push(word);
  return args;
}

/**
 * The run form of one target. `ui` supplies the dashboard's element helpers and API; `form` is the server's
 * description ({ declared, arguments }); `previous` the command-line words of the last successful run, if any.
 * Returns the element, `args()` (checked command-line words, throwing after showing any problem), `reset()` and
 * `focus()`. `onSubmit` runs on Ctrl/⌘+Enter.
 */
export function argumentForm(ui, { program, target, form, previous, onSubmit }) {
  const { h, fill, api } = ui;
  const declared = form?.arguments ?? [];
  const element = h('div', { class: 'argument-form', onkeydown: event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onSubmit?.(); }
  } });
  const commandLine = h('code', { class: 'command-line' });
  let commandToCopy = '';
  const summary = h('span', { class: 'small', role: 'status' });
  const copy = h('button', { type: 'button', class: 'ghost small', title: 'Copy the command', onclick: async () => {
    try { await navigator.clipboard.writeText(commandToCopy); ui.toast('Command copied'); } catch { ui.toast('Copy failed: select the command and copy it', true); }
  } }, 'Copy');
  const footer = h('div', { class: 'command-row' }, h('span', { class: 'small muted' }, 'Command'), commandLine, copy);

  // Free-form command-line words: the target declares no arguments.
  if (!form?.declared || !declared.length) {
    const input = h('input', { placeholder: 'arguments, as on the command line (quote words with spaces)', spellcheck: 'false',
      value: (previous ?? []).map(shellQuote).join(' '), oninput: () => update() });
    const words = h('div', { class: 'word-chips' });
    const update = () => {
      let args = [];
      try { args = splitArgs(input.value); summary.textContent = ''; summary.className = 'small'; }
      catch (error) { summary.textContent = error.message; summary.className = 'small bad-text'; }
      fill(words, args.length ? args.map((word, index) => h('span', { class: 'chip', title: `context.args[${index}]` }, h('span', { class: 'muted' }, `${index}`), word || '""')) :
        h('span', { class: 'small muted' }, 'No arguments: context.args is empty.'));
      commandToCopy = command(args); commandLine.textContent = `natlang run ${program} — ${args.length} ${args.length === 1 ? 'input' : 'inputs'}`;
    };
    fill(element, h('label', { class: 'field' }, 'Arguments', input), words,
      h('div', { class: 'small muted' }, 'This target declares no typed arguments, so its words reach context.args as text. Declare "arguments" for this target in natlang.json to get a typed form.'),
      footer, summary);
    update();
    return { element, async args() { return splitArgs(input.value); }, reset() { input.value = ''; update(); }, focus() { input.focus(); } };
  }

  // Declared arguments: a typed editor each, checked by the server as the user types.
  const slots = new Map(); // problem path -> where its message is shown
  let local = [];          // Problems a typed control finds before the server checks the complete value.
  let timer = 0, revision = 0, lastProblems = [];
  ui.scope?.defer(() => clearTimeout(timer));
  const ctx = {
    ui,
    slot(path, slotElement) { slots.set(path, slotElement); },
    local(path, message) { local.push({ path, message }); },
    changed() { clearTimeout(timer); timer = setTimeout(check, 250); renderCommand(); },
    submit: () => onSubmit?.(),
  };
  const fields = declared.map((arg, index) => argumentField(ctx, arg, previousValue(arg, previous?.[index])));
  const signature = h('div', { class: 'signature' }, h('span', { class: 't-fn' }, target), h('span', { class: 't-punct' }, '('),
    declared.map((arg, index) => [index ? h('span', { class: 't-punct' }, ', ') : null,
      h('a', { href: '#', class: 'sig-arg', onclick: event => { event.preventDefault(); fields[index].focus(); } },
        typeHint(h, `${arg.name}${arg.required ? '' : '?'}: ${arg.text}`))]), h('span', { class: 't-punct' }, ')'));
  fill(element, signature, fields.map(field => field.element), footer, summary);

  function words() {
    local = [];
    const values = fields.map(field => field.word());
    while (values.length && values.at(-1) === '') values.pop();
    return values;
  }
  function command(args) { return `natlang run ${shellQuote(program)} --target ${shellQuote(target)}${args.length ? ` -- ${args.map(shellQuote).join(' ')}` : ''}`; }
  function renderCommand() { try { const args = words(); commandToCopy = command(args); commandLine.textContent = `natlang run ${program} — ${args.length} ${args.length === 1 ? 'input' : 'inputs'}`; } catch { /* shown by check */ } }
  function show(problems) {
    lastProblems = problems;
    for (const slotElement of slots.values()) { slotElement.replaceChildren(); slotElement.hidden = true; }
    const placed = new Set();
    for (const problem of problems) {
      let path = problem.path || problem.argument;
      while (path && !(slots.get(path)?.isConnected)) path = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const slotElement = path ? slots.get(path) : null;
      if (!slotElement) continue;
      slotElement.hidden = false; slotElement.append(h('div', {}, problem.message)); placed.add(problem);
    }
    const unplaced = problems.filter(problem => !placed.has(problem));
    summary.className = problems.length ? 'small bad-text' : 'small ok-text';
    summary.textContent = problems.length ? `${problems.length} problem${problems.length === 1 ? '' : 's'}${unplaced.length ? `: ${unplaced.map(problem => problem.message).join('; ')}` : ''}` : '✓ Arguments check';
  }
  async function check() {
    const current = ++revision, args = words(), found = local.slice();
    commandToCopy = command(args); commandLine.textContent = `natlang run ${program} — ${args.length} ${args.length === 1 ? 'input' : 'inputs'}`;
    try {
      const { problems } = await api.programs.checkArguments({ path: program, target, args });
      if (current !== revision) return lastProblems;
      // An argument an editor could not turn into a value is reported by that editor, not as missing.
      const withLocal = new Set(found.map(problem => problem.path.split('/')[0]));
      show([...found, ...problems.filter(problem => !withLocal.has(problem.argument))]);
    } catch (error) { if (current === revision) show([...found, { argument: '', path: '', message: error.message }]); }
    return lastProblems;
  }
  check();
  return {
    element,
    async args() {
      clearTimeout(timer);
      const problems = await check();
      if (problems.length) {
        const first = problems.find(problem => problem.argument) ?? problems[0];
        fields.find(field => field.name === first.argument)?.focus();
        throw new Error(`Fix the arguments first: ${first.message}`);
      }
      return words();
    },
    reset() { fields.forEach(field => field.reset()); ctx.changed(); },
    focus() { fields[0]?.focus(); },
  };
}

/** The value of a previous run's command-line word, read as the argument's spelling. */
function previousValue(arg, word) {
  if (word === undefined || word === '') return undefined;
  if (arg.spelling === 'text') return word;
  try { return JSON.parse(word); } catch { return arg.tree.kind === 'union' && arg.tree.members.some(member => member.kind === 'prim' && member.name === 'string') ? word : undefined; }
}

/** One top-level argument: label with its type, description, default and an editor; `word()` is its command-line text. */
function argumentField(ctx, arg, initial) {
  const { h } = ctx.ui;
  const errors = h('div', { class: 'field-problems', hidden: true, role: 'alert' });
  ctx.slot(arg.name, errors);
  const hasDefault = arg.default !== undefined;
  const { type, notes } = unwrap(arg.tree);
  // Text and numbers have an empty state that means "not given"; other types are given or not given explicitly.
  const emptiable = (type.kind === 'prim' && ['string', 'number', 'Blob'].includes(type.name)) || literalsOnly(type);
  const body = h('div', { class: 'field-body' });
  let editor = null, given = initial !== undefined;
  const placeholder = hasDefault ? `Default: ${valueSummary(arg.default)}` : arg.required ? 'required' : 'not given: the program decides';
  const build = value => {
    editor = editorFor(ctx, arg.tree, value, arg.name, { placeholder, pathKind: arg.path, top: true, optional: !arg.required, required: arg.required });
    ctx.ui.fill(body, editor.element, !emptiable && !arg.required ? h('button', { type: 'button', class: 'ghost small', title: 'Leave this argument out',
      onclick: () => { given = false; editor = null; render(); ctx.changed(); } }, hasDefault ? 'Use default' : 'Clear') : null);
  };
  const render = () => {
    if (emptiable || arg.required || given) { if (!editor) build(initial); return; }
    ctx.ui.fill(body, h('div', { class: 'absent' }, h('span', { class: 'muted' }, hasDefault ? 'Uses the default ' : 'Not given; the program decides.'),
      hasDefault ? h('details', { class: 'value-disclosure' }, h('summary', {}, 'Preview default'), valueView(h, arg.default)) : null,
      h('button', { type: 'button', class: 'small', onclick: () => { given = true; initial = hasDefault ? structuredClone(arg.default) : sampleOf(arg.tree); build(initial); editor.focus?.(); ctx.changed(); } },
        hasDefault ? 'Customize' : 'Set value')));
  };
  render();
  const copyDefault = hasDefault && emptiable ? h('button', { type: 'button', class: 'link small', title: 'Start from the default value', onclick: () => {
    editor.set(arg.default); editor.focus?.(); ctx.changed(); } }, 'edit default') : null;
  const element = h('div', { class: 'argument' },
    h('div', { class: 'argument-head' },
      h('span', { class: 'argument-name mono' }, arg.name), typeHint(h, arg.text, { title: arg.text }),
      arg.required ? h('span', { class: 'pill warn' }, 'required') : h('span', { class: 'pill idle' }, 'optional'),
      arg.path ? h('span', { class: 'pill info' }, arg.path) : null, copyDefault),
    arg.description ? h('div', { class: 'small muted' }, arg.description) : null,
    notes.map(([label, text]) => h('div', { class: 'small note' }, h('strong', {}, `${label}: `), text)),
    arg.problem ? h('div', { class: 'callout warn small' }, arg.problem) : null,
    body, errors);
  return {
    name: arg.name, element,
    word() {
      if (!editor) return '';
      const value = editor.get();
      if (value === undefined || value === MISSING) return '';
      return arg.spelling === 'text' && typeof value === 'string' ? value : JSON.stringify(value);
    },
    reset() { given = false; editor = null; initial = undefined; render(); },
    focus() { (editor?.focus ? editor.focus() : element.querySelector('input, textarea, select, button')?.focus()); element.scrollIntoView({ block: 'nearest' }); },
  };
}
const MISSING = Symbol('missing');

/**
 * An editor for a value of `type`: { element, get(), set(value), focus() }. `get()` returns the value, `undefined`
 * for an empty optional one, or MISSING after reporting a problem it found itself.
 */
function editorFor(ctx, type, value, path, options = {}) {
  const editor = createEditor(ctx, type, value, path, options);
  // The control is named by its path (the argument's name at the top), so assistive technology and tests can find it.
  // Nested editors name their own controls first; a composite names itself as a group.
  const control = editor.element.matches('input, textarea, select, [role=radiogroup]') ? editor.element :
    editor.element.querySelector('input, textarea, select, [role=radiogroup]');
  const target = control && !control.hasAttribute('aria-label') ? control : editor.element;
  if (target === editor.element && !target.matches('input, textarea, select, [role=radiogroup]')) target.setAttribute('role', 'group');
  if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', path);
  if (options.required) target.setAttribute('aria-required', 'true');
  return editor;
}
function createEditor(ctx, type, value, path, options) {
  const { type: inner } = unwrap(type);
  if (options.pathKind) return pathEditor(ctx, value, path, options);
  switch (inner.kind) {
    case 'prim':
      if (inner.name === 'string' || inner.name === 'Blob') return textEditor(ctx, value, path, options);
      if (inner.name === 'number') return numberEditor(ctx, value, path, options);
      if (inner.name === 'boolean') return switchEditor(ctx, value);
      if (inner.name === 'null') return constantEditor(ctx, null);
      return dynamicEditor(ctx, value, path);
    case 'lit': return constantEditor(ctx, inner.value);
    case 'union':
      if (literalsOnly(inner)) return choiceEditor(ctx, inner, value, options);
      return unionEditor(ctx, inner, value, path, options);
    case 'record': return structured(ctx, inner, value, path, recordEditor);
    case 'list': return structured(ctx, inner, value, path, listEditor);
    case 'dict': return structured(ctx, inner, value, path, dictEditor);
    default: return dynamicEditor(ctx, value, path);
  }
}

function textEditor(ctx, value, path, { placeholder } = {}) {
  const { h, fill } = ctx.ui;
  const wrap = h('div', { class: 'text-editor' });
  let multiline = typeof value === 'string' && (value.includes('\n') || value.length > 100), field = null;
  const counter = h('span', { class: 'small muted counter' });
  const grow = () => { if (multiline) { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight + 2, 420)}px`; }
    counter.textContent = field.value ? `${field.value.length} chars${multiline ? ` · ${field.value.split('\n').length} lines` : ''}` : ''; };
  const toggle = h('button', { type: 'button', class: 'ghost small', title: 'Switch between one line and several lines' });
  const build = text => {
    field = multiline ? h('textarea', { rows: 3, placeholder, spellcheck: 'true' }) : h('input', { placeholder, spellcheck: 'true' });
    field.value = text ?? '';
    field.addEventListener('input', () => { grow(); ctx.changed(); });
    // Pasting several lines into a one-line field switches it to several lines instead of losing the line breaks.
    if (!multiline) field.addEventListener('paste', event => {
      const pasted = event.clipboardData?.getData('text') ?? '';
      if (!pasted.includes('\n')) return;
      event.preventDefault();
      const before = field.value.slice(0, field.selectionStart), after = field.value.slice(field.selectionEnd);
      multiline = true; build(before + pasted + after); field.focus(); ctx.changed();
    });
    toggle.textContent = multiline ? '⤡ One line' : '⤢ Lines';
    wrap.classList.toggle('multiline', multiline);
    fill(wrap, field, h('div', { class: 'editor-tools' }, toggle, counter));
    grow();
  };
  toggle.onclick = () => {
    if (multiline && field.value.includes('\n') && !confirm('Join the lines into one line?')) return;
    const text = multiline ? field.value.replace(/\s*\n\s*/g, ' ') : field.value;
    multiline = !multiline; build(text); field.focus(); ctx.changed();
  };
  build(typeof value === 'string' ? value : '');
  // An empty top-level argument is not given; an empty string inside a record or list is the empty string.
  return { element: wrap, get: () => field.value === '' && !ctx.inside ? undefined : field.value,
    set(next) { multiline = typeof next === 'string' && (next.includes('\n') || next.length > 100); build(String(next ?? '')); }, focus: () => field.focus() };
}

function numberEditor(ctx, value, path, { placeholder } = {}) {
  const { h } = ctx.ui;
  const field = h('input', { inputmode: 'decimal', class: 'number-input', placeholder: placeholder ?? '0', spellcheck: 'false',
    value: typeof value === 'number' ? String(value) : '', title: '↑/↓ steps by 1, with Shift by 10' });
  field.addEventListener('input', () => ctx.changed());
  field.addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const current = Number(field.value || 0);
    if (!Number.isFinite(current)) return;
    const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
    const decimals = (field.value.split('.')[1] ?? '').length;
    field.value = (current + step).toFixed(decimals); ctx.changed();
  });
  return { element: field, focus: () => field.focus(), set(next) { field.value = next === undefined ? '' : String(next); },
    get() {
      const text = field.value.trim();
      if (text === '') return !ctx.inside ? undefined : (ctx.local(path, `${path}: enter a number`), MISSING);
      const number = Number(text);
      if (!Number.isFinite(number)) { ctx.local(path, `${path}: ${JSON.stringify(text)} is not a number`); return MISSING; }
      return number;
    } };
}

function switchEditor(ctx, value) {
  const { h } = ctx.ui;
  const box = h('input', { type: 'checkbox', role: 'switch' });
  box.checked = value === true;
  const label = h('span', { class: 'mono small' }, box.checked ? 'Yes' : 'No');
  box.addEventListener('change', () => { label.textContent = box.checked ? 'Yes' : 'No'; ctx.changed(); });
  return { element: h('label', { class: 'switch' }, box, h('span', { class: 'track', 'aria-hidden': 'true' }), label),
    get: () => box.checked, set(next) { box.checked = next === true; label.textContent = box.checked ? 'Yes' : 'No'; }, focus: () => box.focus() };
}

function constantEditor(ctx, value) {
  const { h } = ctx.ui;
  return { element: h('span', { class: 'constant' }, valueSummary(value)), get: () => value, set() {} };
}

/** A union of literals: segmented buttons when they are few and short, otherwise a select. */
function choiceEditor(ctx, type, value, { top } = {}) {
  const { h } = ctx.ui;
  const values = type.members.map(member => isNull(member) ? null : member.value);
  // A top-level argument starts unchosen ("—"): required ones are then reported as missing rather than guessed.
  const allowEmpty = !!top;
  // A value that is none of the choices (from JSON or an older run) shows as unchosen rather than becoming another value.
  let current = values.some(item => item === value) ? value : undefined;
  const label = item => item === undefined ? '—' : valueSummary(item);
  if (values.length <= 6 && values.reduce((sum, item) => sum + label(item).length, 0) <= 64) {
    const buttons = [...(allowEmpty ? [undefined] : []), ...values].map(item => h('button', { type: 'button', role: 'radio',
      title: item === undefined ? 'Not given' : valueSummary(item), onclick: () => { current = item; paint(); ctx.changed(); } }, label(item)));
    const group = h('div', { class: 'segmented', role: 'radiogroup' }, buttons);
    const items = [...(allowEmpty ? [undefined] : []), ...values];
    const paint = () => buttons.forEach((button, index) => { const on = items[index] === current; button.classList.toggle('on', on); button.setAttribute('aria-checked', String(on)); });
    paint();
    return { element: group, get: () => current, set(next) { current = next; paint(); }, focus: () => buttons[0].focus() };
  }
  const select = h('select', {}, allowEmpty ? h('option', { value: '' }, 'not given') : null,
    values.map((item, index) => h('option', { value: String(index), selected: item === current }, label(item))));
  select.addEventListener('change', () => ctx.changed());
  return { element: select, focus: () => select.focus(), set(next) { const index = values.indexOf(next); select.value = index < 0 ? '' : String(index); },
    get: () => select.value === '' ? undefined : values[Number(select.value)] };
}

/** A union of shapes: a tab per variant, or a "null" switch beside the one other member. */
function unionEditor(ctx, type, value, path, options) {
  const { h, fill } = ctx.ui;
  const nonNull = type.members.filter(member => !isNull(member)), nullable = nonNull.length < type.members.length;
  const body = h('div', { class: 'variant-body' });
  let editor, chosen;
  if (nonNull.length === 1) {
    const toggle = h('input', { type: 'checkbox' });
    toggle.checked = nullable && value === null;
    const draw = () => { editor = toggle.checked ? constantEditor(ctx, null) : editorFor(ctx, nonNull[0], value === null ? undefined : value, path, { ...options, top: false });
      fill(body, editor.element); };
    toggle.addEventListener('change', () => { value = toggle.checked ? null : sampleOf(nonNull[0]); draw(); ctx.changed(); });
    draw();
    return { element: h('div', { class: 'union' }, h('label', { class: 'inline-check small' }, toggle, 'null'), body),
      get: () => editor.get(), set(next) { value = next; toggle.checked = next === null; draw(); }, focus: () => editor.focus?.() };
  }
  const tabs = type.members.map((member, index) => h('button', { type: 'button', role: 'tab', onclick: () => choose(index, true) },
    typeHint(h, formatType(member, false))));
  const choose = (index, fromUser) => {
    if (fromUser && chosen === index) return;
    const member = type.members[index];
    const current = editor ? editor.get() : value;
    const start = current !== undefined && current !== MISSING && roughFit(member, current) ? current : fromUser ? sampleOf(member) : value;
    chosen = index; editor = editorFor(ctx, member, start, path, { ...options, top: false });
    tabs.forEach((tab, at) => { tab.classList.toggle('on', at === index); tab.setAttribute('aria-selected', String(at === index)); });
    fill(body, editor.element);
    if (fromUser) ctx.changed();
  };
  const fitting = type.members.findIndex(member => value !== undefined && roughFit(member, value));
  choose(fitting >= 0 ? fitting : 0, false);
  return { element: h('div', { class: 'union' }, h('div', { class: 'variant-tabs', role: 'tablist' }, h('span', { class: 'small muted' }, 'one of'), tabs), body),
    get: () => editor.get(), set(next) { value = next; editor = null; const at = type.members.findIndex(member => roughFit(member, next)); choose(at >= 0 ? at : 0, false); },
    focus: () => editor.focus?.() };
}

/** Structured values always use their typed fields; serialized data is never the editing surface. */
function structured(ctx, type, value, path, build) {
  const editor = build({ ...ctx, inside: true }, type, value, path);
  const { h } = ctx.ui;
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': `Import ${path}` });
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; if (!selected) return;
    try {
      let imported; try { imported = JSON.parse(await selected.text()); } catch { throw new Error('This file could not be read as structured data. Choose a valid data file.'); }
      if (!roughFit(type, imported)) throw new Error('This file does not match the field’s declared type. Its current values have been kept.');
      editor.set(imported); ctx.changed(); ctx.ui.toast(`Imported ${selected.name}`);
    } catch (error) { ctx.ui.toast(error.message, true); }
    finally { file.value = ''; }
  });
  return { ...editor, element: ctx.ui.h('div', { class: `structured ${type.kind}` },
    h('div', { class: 'structured-head' }, h('span', { class: 'small muted' }, type.alias || (type.kind === 'list' ? 'Items' : 'Fields')),
      h('button', { type: 'button', class: 'ghost small', onclick: () => file.click() }, 'Import data'),
      h('button', { type: 'button', class: 'ghost small', onclick: async () => {
        const value = editor.get(); if (value === MISSING || value === undefined) { ctx.ui.toast('Complete the fields before copying.', true); return; }
        try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); ctx.ui.toast('Value copied'); } catch { ctx.ui.toast('Copy is unavailable in this browser.', true); }
      } }, 'Copy data'), file), editor.element) };
}

function recordEditor(ctx, type, value, path) {
  const { h, fill } = ctx.ui;
  const source = isPlain(value) ? value : {};
  const rows = type.fields.map(field => {
    const fieldPath = `${path}/${field.name}`;
    const errors = h('div', { class: 'field-problems', hidden: true, role: 'alert' });
    ctx.slot(fieldPath, errors);
    const body = h('div', { class: 'field-body' });
    let editor = null, present = Object.hasOwn(source, field.name) || !field.optional;
    const draw = start => {
      if (present) {
        editor = editorFor(ctx, field.type, start, fieldPath, { top: false });
        fill(body, editor.element, field.optional ? h('button', { type: 'button', class: 'ghost small', title: `Leave ${field.name} out`, 'aria-label': `Leave ${field.name} out`,
          onclick: () => { present = false; draw(); ctx.changed(); } }, '✕') : null);
      } else {
        editor = null;
        fill(body, h('button', { type: 'button', class: 'ghost small add', onclick: () => { present = true; draw(sampleOf(field.type)); editor.focus?.(); ctx.changed(); } }, `+ ${field.name}`));
      }
    };
    draw(Object.hasOwn(source, field.name) ? source[field.name] : sampleOf(field.type));
    const { notes } = unwrap(field.type);
    return { field, get: () => editor ? editor.get() : undefined, focus: () => editor?.focus?.(),
      set(next) { present = next !== undefined || !field.optional; draw(next === undefined ? sampleOf(field.type) : next); },
      element: h('div', { class: 'record-row' },
        h('div', { class: 'record-label' }, h('span', { class: 'mono' }, field.name, field.optional ? h('span', { class: 'muted' }, '?') : null),
          typeHint(h, formatType(field.type, false))),
        h('div', { class: 'record-value' }, field.doc ? h('div', { class: 'small muted' }, field.doc) : null,
          notes.map(([label, text]) => h('div', { class: 'small note' }, h('strong', {}, `${label}: `), text)), body, errors)) };
  });
  return { element: h('div', { class: 'record-rows' }, rows.map(row => row.element)), focus: () => rows[0]?.focus(),
    set(next) { for (const row of rows) row.set(isPlain(next) ? next[row.field.name] : undefined); },
    get() {
      const out = {}; let broken = false;
      for (const row of rows) { const item = row.get(); if (item === MISSING) broken = true; else if (item !== undefined) out[row.field.name] = item; }
      return broken ? MISSING : out;
    } };
}

function listEditor(ctx, type, value, path) {
  const { h, fill } = ctx.ui;
  const element = type.element, { type: elementType } = unwrap(element);
  // A list of literals is a set of chips to switch on and off, kept in declaration order.
  if (literalsOnly(elementType) || elementType.kind === 'lit') {
    const options = elementType.kind === 'lit' ? [elementType.value] : elementType.members.map(member => isNull(member) ? null : member.value);
    const chosen = new Set(Array.isArray(value) ? value : []);
    const chips = options.map(item => { const chip = h('button', { type: 'button', class: 'chip toggle', 'aria-pressed': String(chosen.has(item)),
      onclick: () => { chosen.has(item) ? chosen.delete(item) : chosen.add(item); chip.setAttribute('aria-pressed', String(chosen.has(item))); ctx.changed(); } },
      valueSummary(item)); return chip; });
    return { element: h('div', { class: 'chips' }, chips), get: () => options.filter(item => chosen.has(item)), focus: () => chips[0]?.focus(),
      set(next) { chosen.clear(); (next ?? []).forEach(item => chosen.add(item)); chips.forEach((chip, index) => chip.setAttribute('aria-pressed', String(chosen.has(options[index])))); } };
  }
  const textual = elementType.kind === 'prim' && elementType.name === 'string';
  const items = [], list = h('ol', { class: 'list-items' }), empty = h('div', { class: 'small muted empty-list' }, 'No items.');
  const label = formatType(element, false);
  const box = h('div', { class: 'list-editor' });
  let lines = null;
  const redraw = () => {
    fill(list, items.map((item, index) => {
      item.path = `${path}/${index}`;
      const errors = h('div', { class: 'field-problems', hidden: true, role: 'alert' });
      ctx.slot(item.path, errors);
      if (!item.editor) item.editor = editorFor(ctx, element, item.value, item.path, { top: false });
      const move = (delta, text, title) => h('button', { type: 'button', class: 'ghost small', title, 'aria-label': title, disabled: index + delta < 0 || index + delta >= items.length,
        onclick: () => { items.splice(index + delta, 0, items.splice(index, 1)[0]); refresh(); } }, text);
      return h('li', { class: 'list-item' }, h('div', { class: 'item-index small muted mono' }, String(index)),
        h('div', { class: 'item-value' }, item.editor.element, errors),
        h('div', { class: 'item-tools' }, move(-1, '↑', 'Move up'), move(1, '↓', 'Move down'),
          h('button', { type: 'button', class: 'ghost small', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: () => {
            const current = item.editor.get(); items.splice(index + 1, 0, { value: current === MISSING ? item.value : structuredClone(current) }); refresh(); } }, '⧉'),
          h('button', { type: 'button', class: 'ghost small', title: 'Remove', 'aria-label': 'Remove', onclick: () => { items.splice(index, 1); refresh(); } }, '✕')));
    }));
    empty.hidden = items.length > 0;
  };
  const refresh = () => { for (const item of items) if (item.editor) { const current = item.editor.get(); if (current !== MISSING) item.value = current; item.editor = null; } redraw(); ctx.changed(); };
  const add = h('button', { type: 'button', class: 'small', onclick: () => {
    items.push({ value: sampleOf(element) }); redraw(); items.at(-1).editor.focus?.(); ctx.changed(); } }, `+ Add ${label}`);
  // A list of strings can also be written one item per line.
  const linesToggle = textual ? h('button', { type: 'button', class: 'ghost small', onclick: () => {
    if (lines) { items.splice(0, items.length, ...lines.value.split('\n').filter(line => line.trim()).map(line => ({ value: line }))); lines = null; draw(); }
    else { const current = get(); lines = h('textarea', { rows: Math.min(Math.max(items.length, 3), 14), placeholder: 'one item per line' });
      lines.value = current === MISSING ? '' : current.join('\n'); lines.addEventListener('input', () => ctx.changed()); draw(); lines.focus(); }
    ctx.changed(); } }) : null;
  const draw = () => {
    if (linesToggle) linesToggle.textContent = lines ? '☰ Items' : '≡ One per line';
    if (lines) fill(box, lines, h('div', { class: 'row' }, linesToggle));
    else { redraw(); fill(box, list, empty, h('div', { class: 'row' }, add, linesToggle)); }
  };
  for (const item of Array.isArray(value) ? value : []) items.push({ value: item });
  draw();
  function get() {
    if (lines) return lines.value.split('\n').filter(line => line.trim());
    const out = []; let broken = false;
    for (const item of items) { const current = item.editor ? item.editor.get() : item.value; if (current === MISSING) broken = true; else out.push(current); }
    return broken ? MISSING : out;
  }
  return { element: box, get, focus: () => (items[0]?.editor?.focus ?? (() => add.focus()))(),
    set(next) { items.splice(0, items.length, ...(Array.isArray(next) ? next : []).map(item => ({ value: item }))); lines = null; draw(); } };
}

function dictEditor(ctx, type, value, path) {
  const { h, fill } = ctx.ui;
  const entries = Object.entries(isPlain(value) ? value : {}).map(([key, item]) => ({ key, value: item }));
  const rows = h('div', { class: 'dict-rows' });
  const redraw = () => fill(rows, entries.map((entry, index) => {
    const errors = h('div', { class: 'field-problems', hidden: true, role: 'alert' });
    const key = h('input', { class: 'mono dict-key', placeholder: 'key', value: entry.key, spellcheck: 'false' });
    key.addEventListener('input', () => { entry.key = key.value; ctx.slot(`${path}/${entry.key}`, errors); ctx.changed(); });
    ctx.slot(`${path}/${entry.key}`, errors);
    if (!entry.editor) entry.editor = editorFor(ctx, type.element, entry.value, `${path}/${entry.key}`, { top: false });
    entry.focus = () => key.focus();
    return h('div', { class: 'dict-row' }, key, h('span', { class: 't-punct' }, ':'), h('div', { class: 'item-value' }, entry.editor.element, errors),
      h('button', { type: 'button', class: 'ghost small', title: 'Remove', 'aria-label': 'Remove', onclick: () => { entries.splice(index, 1); redraw(); ctx.changed(); } }, '✕'));
  }));
  const add = h('button', { type: 'button', class: 'small', onclick: () => {
    entries.push({ key: '', value: sampleOf(type.element) }); redraw(); entries.at(-1).focus(); ctx.changed(); } }, `+ Add entry`);
  redraw();
  return { element: h('div', { class: 'dict-editor' }, rows, h('div', { class: 'row' }, add, h('span', { class: 'small muted' }, `values: `), typeHint(h, formatType(type.element, false)))),
    focus: () => (entries[0]?.focus ?? (() => add.focus()))(),
    set(next) { entries.splice(0, entries.length, ...Object.entries(isPlain(next) ? next : {}).map(([key, item]) => ({ key, value: item }))); redraw(); },
    get() {
      const out = {}; let broken = false;
      for (const entry of entries) {
        if (!entry.key) { ctx.local(path, `${path}: an entry has no key`); broken = true; continue; }
        if (Object.hasOwn(out, entry.key)) { ctx.local(path, `${path}: the key ${JSON.stringify(entry.key)} appears twice`); broken = true; continue; }
        const current = entry.editor.get(); if (current === MISSING) broken = true; else Object.defineProperty(out, entry.key, { value: current, enumerable: true, configurable: true, writable: true });
      }
      return broken ? MISSING : out;
    } };
}

/** A file or folder in the dashboard root: a path field with completion and a browser. */
function pathEditor(ctx, value, path, { placeholder, pathKind }) {
  const { h, fill, api } = ctx.ui;
  const files = dir => api.programs ? api.programs.files(dir) : Promise.reject(new Error('This host does not offer file browsing.'));
  const list = `paths-${Math.random().toString(36).slice(2)}`;
  const field = h('input', { placeholder: placeholder ?? `${pathKind} path`, spellcheck: 'false', list, value: typeof value === 'string' ? value : '', class: 'mono' });
  const options = h('datalist', { id: list });
  const browser = h('div', { class: 'path-browser', hidden: true });
  let listed = null;
  const complete = async () => {
    const dir = field.value.includes('/') ? field.value.slice(0, field.value.lastIndexOf('/')) : '.';
    if (listed === dir) return;
    listed = dir;
    try { const result = await files(dir);
      fill(options, result.entries.map(entry => h('option', { value: `${dir === '.' ? '' : dir + '/'}${entry.name}${entry.kind === 'folder' ? '/' : ''}` }))); } catch { /* completion is optional */ }
  };
  const browse = async dir => {
    try {
      const result = await files(dir);
      // A typed path whose folder does not exist opens its nearest existing parent.
      if (result.missing && dir !== '.' && dir !== '') return browse(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '.');
      const prefix = result.dir ? `${result.dir}/` : '';
      const crumbs = ['.', ...(result.dir ? result.dir.split('/') : [])];
      fill(browser, h('div', { class: 'crumbs small' }, crumbs.map((part, index) => [index ? ' / ' : '', h('a', { href: '#', onclick: event => {
          event.preventDefault(); browse(crumbs.slice(1, index + 1).join('/') || '.'); } }, part === '.' ? 'root' : part)]),
          pathKind === 'folder' ? h('button', { type: 'button', class: 'small', onclick: () => { field.value = result.dir || '.'; browser.hidden = true; ctx.changed(); } }, 'Choose this folder') : null),
        result.entries.length ? h('ul', {}, result.entries.map(entry => h('li', {}, h('a', { href: '#', class: entry.kind, onclick: event => {
          event.preventDefault();
          if (entry.kind === 'folder') browse(prefix + entry.name);
          else if (pathKind === 'file') { field.value = prefix + entry.name; browser.hidden = true; ctx.changed(); }
        } }, entry.kind === 'folder' ? `📁 ${entry.name}` : `📄 ${entry.name}`)))) : h('div', { class: 'small muted' }, result.missing ? 'No such folder.' : 'Empty folder.'));
      browser.hidden = false;
    } catch (error) { ctx.ui.toast(error.message, true); }
  };
  field.addEventListener('input', () => { complete(); ctx.changed(); });
  field.addEventListener('focus', complete);
  const open = h('button', { type: 'button', class: 'small', onclick: () => browser.hidden ? browse(field.value.includes('/') ? field.value.slice(0, field.value.lastIndexOf('/')) : '.') : (browser.hidden = true) }, 'Browse…');
  return { element: h('div', { class: 'path-editor' }, h('div', { class: 'row' }, field, open), options, browser),
    get: () => field.value === '' && !ctx.inside ? undefined : field.value, set(next) { field.value = next ?? ''; }, focus: () => field.focus() };
}


/** Unknown values still have a real editor: choose a shape, then fill its controls. */
function dynamicEditor(ctx, initial, path) {
  const { h, fill } = ctx.ui;
  const shape = value => value === null ? 'empty' : Array.isArray(value) ? 'list' : typeof value === 'object' && value !== undefined ? 'fields' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text';
  const types = { text: { kind: 'prim', name: 'string' }, number: { kind: 'prim', name: 'number' }, boolean: { kind: 'prim', name: 'boolean' },
    empty: { kind: 'prim', name: 'null' }, list: { kind: 'list', element: { kind: 'prim', name: 'unknown' } }, fields: { kind: 'dict', element: { kind: 'prim', name: 'unknown' } } };
  const choices = [['text', 'Text'], ['number', 'Number'], ['boolean', 'Yes / no'], ['fields', 'Fields'], ['list', 'List'], ['empty', 'No value']];
  const select = h('select', { 'aria-label': `${path} kind` }, choices.map(([value, label]) => h('option', { value }, label)));
  select.value = shape(initial);
  const body = h('div', { class: 'dynamic-body' }); let editor;
  const draw = value => {
    const type = types[select.value];
    editor = editorFor({ ...ctx, inside: true }, type, value === undefined ? sampleOf(type) : value, path);
    fill(body, editor.element);
  };
  select.addEventListener('change', () => { draw(undefined); ctx.changed(); });
  draw(initial);
  return { element: h('div', { class: 'dynamic-editor' }, h('div', { class: 'dynamic-kind' }, h('span', { class: 'small muted' }, 'Value kind'), select), body),
    get: () => editor.get(), set(next) { select.value = shape(next); draw(next); }, focus: () => editor.focus?.() };
}

/** Reuse the typed controls for a function parameter or an expected result. No serialized-data textarea is needed. */
export function typedValueEditor(ui, { name = 'value', type = { kind: 'prim', name: 'unknown' }, value, required = true, description, onChange } = {}) {
  const slots = new Map(), problems = []; const errors = ui.h('div', { class: 'field-problems', hidden: true, role: 'alert' });
  const ctx = { ui, inside: true, slot(path, element) { slots.set(path, element); }, local(path, message) { problems.push({ path, message }); }, changed() { onChange?.(); }, submit() {} };
  const editor = editorFor(ctx, type, value, name, { top: true, required });
  const element = ui.h('div', { class: 'argument typed-value-field' }, ui.h('div', { class: 'argument-head' }, ui.h('strong', {}, fieldLabel(name)), typeHint(ui.h, formatType(type))),
    description ? ui.h('p', { class: 'small muted' }, description) : null, editor.element, errors);
  return { element, set: next => editor.set(next), focus: () => editor.focus?.(),
    get() {
      problems.length = 0; errors.hidden = true;
      const value = editor.get();
      if (required && value === undefined) problems.push({ path: name, message: `Choose a value for ${fieldLabel(name).toLowerCase()}.` });
      if (problems.length || value === MISSING) { errors.hidden = false; errors.textContent = problems.map(item => item.message).join(' '); throw new Error('Check the highlighted value.'); }
      return value;
    } };
}
