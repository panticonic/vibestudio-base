// Programs: the host's natlang programs, each with a typed run form, its functions, saved tests, build state and README.
import { argumentForm, typedValueEditor } from '../arguments.js';
import { valueView, modelDescription, problemView, codeView } from '../presentation.js';
import { definePage, ago, ms, short, tokens, widgets } from '../common.js';
import { openProgramDialog, profileSelect, programDialog } from '../parts.js';

export const id = 'programs', title = 'Programs', requires = ['programs'], runKinds = [];

export const mount = definePage({ id, requires, runKinds, async render(target, ctx) {
  const { h, fill, api } = ctx, { pill, emptyState, header } = widgets(ctx);
  const list = await api.programs.list();
  const selected = ctx.arg ? decodeURIComponent(ctx.arg) : list[0]?.directory;
  const detail = h('div', { class: 'stack' });
  const search = h('input', { id: 'program-search', type: 'search', placeholder: list.length === 1 ? 'Filter programs' : `Filter ${list.length} programs`, 'aria-label': 'Filter programs', style: 'width: 100%' });
  const listBox = h('div', { class: 'list scroll' });
  fill(target, header('Programs', 'Choose a program and run it with sample input, or create your own.',
    h('button', { onclick: () => openProgramDialog(ctx) }, 'Open program'), h('button', { class: 'primary', onclick: () => programDialog(ctx) }, 'Create program')),
    h('div', { class: 'split' }, h('section', { class: 'panel', style: 'padding: 10px' }, search, listBox), detail));
  const draw = () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = list.filter(item => words.every(word => `${item.name} ${item.directory} ${item.description}`.toLowerCase().includes(word)));
    fill(listBox, shown.length ? shown.map(item => h('button', { class: `item${item.directory === selected ? ' selected' : ''}`, onclick: () => ctx.navigate(`programs-${encodeURIComponent(item.directory)}`) },
      h('div', { class: 'title' }, h('span', {}, item.name), item.warm ? pill('warm', 'ok') : item.targets.length ? null : pill('functions', 'idle')),
      h('div', { class: 'small muted mono' }, item.directory), h('div', { class: 'desc' }, item.description))) :
      list.length ? h('div', { class: 'empty' }, 'No program matches.') : emptyState('No programs yet. Create one, or open a directory containing natlang.json.'));
  };
  search.addEventListener('input', draw); draw();
  if (selected) await programDetail(ctx, selected, detail);
} });

// A small Markdown reader for program READMEs, built from elements (never HTML from the file): headings, paragraphs
// with soft line breaks, lists, fenced code, tables as written, inline code, emphasis and web links.
function markdown(h, text) {
  const inline = line => {
    const out = [], pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0, match;
    while ((match = pattern.exec(line))) {
      out.push(line.slice(last, match.index)); last = pattern.lastIndex;
      if (match[1] !== undefined) out.push(h('code', {}, match[1]));
      else if (match[2] !== undefined) out.push(h('strong', {}, match[2]));
      else out.push(/^https?:\/\//.test(match[4]) ? h('a', { href: match[4], target: '_blank', rel: 'noreferrer' }, match[3]) : h('span', { title: match[4] }, match[3]));
    }
    out.push(line.slice(last)); return out;
  };
  const blocks = [], lines = text.replace(/\r/g, '').split('\n');
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = line.trim().slice(0, 3), body = [];
      for (index++; index < lines.length && !lines[index].trim().startsWith(fence); index++) body.push(lines[index]);
      index++; const source = body.join('\n');
      try { blocks.push(valueView(h, JSON.parse(source))); }
      catch { blocks.push(/^\s*(?:```|~~~)json\b/i.test(line) ? problemView(h, source, { title: 'This data example is incomplete' }) : codeView(h, source)); }
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { blocks.push(h(heading[1].length <= 2 ? 'h3' : 'h4', {}, inline(heading[2]))); index++; continue; }
    if (!line.trim()) { index++; continue; }
    const group = [];
    const kind = /^\s*([-*]|\d+\.)\s+/.test(line) ? 'list' : /^\s*\|/.test(line) ? 'table' : 'text';
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s|^\s*(```|~~~)/.test(lines[index])) {
      const current = lines[index];
      if (kind === 'list' && /^\s*([-*]|\d+\.)\s+/.test(current)) group.push(current.replace(/^\s*([-*]|\d+\.)\s+/, ''));
      else if (kind === 'list' && group.length) group[group.length - 1] += ' ' + current.trim();
      else group.push(current);
      index++;
    }
    if (kind === 'list') blocks.push(h('ul', {}, group.map(item => h('li', {}, inline(item)))));
    else if (kind === 'table') { const rows = group.filter(row => !/^\s*\|?[\s:|-]+\|?\s*$/.test(row)).map(row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
      blocks.push(h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, (rows[0] ?? []).map(cell => h('th', {}, inline(cell))))), h('tbody', {}, rows.slice(1).map(row => h('tr', {}, row.map(cell => h('td', {}, inline(cell))))))))); }
    else blocks.push(h('p', {}, inline(group.map(item => item.trim()).join(' '))));
  }
  return blocks;
}

// Where a run will go, in plain words, with the next step when something still has to happen first.
const BACKEND = { 'managed-local': 'a local model on this machine', 'pi-provider': 'a hosted provider', external: 'your own model server' };
function readinessText(ctx, model) {
  const { h } = ctx;
  if (model.kind === 'managed-local') return [h('span', {}, 'Runs on '), h('strong', {}, model.model), `, ${BACKEND[model.kind]}: ${model.detail}`];
  return [h('span', {}, 'Runs on '), h('strong', {}, model.model), `, ${BACKEND[model.kind] ?? model.kind}. `, ...(ctx.can('models') ? [h('a', { href: ctx.href('models') }, 'Test the connection on Models'), '.'] : [])];
}

async function programDetail(ctx, path, container) {
  const { h, fill, api } = ctx, { pill, kv } = widgets(ctx), attempt = ctx.attempt;
  const program = await api.programs.detail(path);
  const manifest = program.manifest, lock = program.lock;
  const targets = Object.entries(manifest.targets ?? {});
  const runnable = ctx.can('run:run');
  const runPanel = h('section', { class: 'panel' }, h('h2', {}, 'Run'),
    targets.length ? targets.map(([name, target]) => {
      const previous = program.lastRuns?.[name];
      let chosen;
      const run = attempt(async () => ctx.startRun({ kind: 'run', path: program.directory, target: name,
        args: await form.args(), profile: chosen?.value || undefined }));
      // The typed form of the target's declared arguments (dashboard/arguments.js); free-form words otherwise.
      const form = argumentForm(ctx, { program: program.directory, target: name, form: program.forms?.[name],
        previous: previous?.args, onSubmit: run });
      const profile = h('span', {});
      const readiness = h('div', { class: 'small muted', role: 'status' }, 'Resolving the model…');
      let revision = 0;
      const refresh = async () => {
        const current = ++revision;
        try { const model = await api.programs.model(program.directory, chosen?.value ?? '');
          if (revision === current) fill(readiness, readinessText(ctx, model));
        } catch (error) { if (revision === current) readiness.textContent = error.message; }
      };
      profileSelect(ctx, `profile-${name}`, previous?.profile).then(select => {
        chosen = select;
        if (select) { fill(profile, select); select.addEventListener('change', refresh); }
        refresh();
      }, error => { fill(profile, error.message); refresh(); });
      return h('div', { class: 'stack run-target' }, h('div', {}, h('strong', { class: 'mono' }, name), target.description ? h('span', { class: 'muted' }, ` · ${target.description}`) : null),
        form.element,
        previous ? h('div', { class: 'small muted' }, 'Inputs restored from the last successful run.') : null,
        // The run bar stays in view while a long argument form scrolls.
        h('div', { class: 'run-bar' }, h('div', { class: 'row' }, h('button', { class: 'primary', title: 'Run (Ctrl+Enter)', onclick: run }, 'Run'), profile,
          h('button', { class: 'ghost', onclick: () => form.reset() }, 'Reset inputs')), readiness));
    }) : h('div', { class: 'muted' }, 'This package has no targets; call its functions below.'));
  const functions = h('section', { class: 'panel' }, h('h2', {}, 'Natural-language functions'),
    program.functions.length ? h('div', { class: 'small muted' }, 'Call one function on its own with your inputs, edit its instructions, or save its result as a test.') : null,
    program.functions.length ? h('div', { class: 'function-list' }, program.functions.map(fn => functionCard(ctx, program, fn))) : h('div', { class: 'muted' }, 'No .nl files.'));
  const warm = lock?.warm;
  const buildable = ctx.can('run:build');
  const build = h('section', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Compiled program'),
    buildable ? h('div', { class: 'row' }, h('button', { onclick: () => ctx.startRun({ kind: 'build', path: program.directory }) }, 'Build'),
      h('button', { class: 'primary', onclick: () => ctx.startRun({ kind: 'build', path: program.directory, warm: true }),
        title: 'Runs the natlang.json warmup calls with tracing and prefills their prompt prefixes' }, 'Build warm')) : null),
    lock ? kv([['Built', ago(lock.builtAt)], ['Model', lock.model.release ? `${lock.model.release.id} · ${lock.model.release.source}@${lock.model.release.revision.slice(0, 8)}` : lock.model.model],
      ['Backend', `${lock.model.kind}${lock.model.runtime ? ` · llama.cpp b${lock.model.runtime.build}` : ''} · profile ${lock.model.profile}`],
      ['Tuning', lock.tuning ? `release ${lock.tuning.release.slice(0, 12)} on checkpoint ${lock.tuning.base.slice(0, 12)}` : 'none'],
      ['Warm', warm ? `${warm.cases.filter(item => item.outcome === 'done').length}/${warm.cases.length} warm-up calls passed · ${warm.prefixes.length} prompt prefix${warm.prefixes.length === 1 ? '' : 'es'} prefilled (${warm.prefixes.map(item => `${tokens(item.tokens)} tokens`).join(', ') || 'none'}) · ${ago(warm.at)}` : 'not warmed']]) :
      h('div', { class: 'muted' }, 'Not built yet. Build writes the lock: the model, runtime, tuning and functions this program runs with.'),
    warm?.cases.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Warm-up call'), h('th', {}, 'Outcome'), h('th', { class: 'num' }, 'Time'), h('th', { class: 'num' }, 'Tokens'))),
      h('tbody', {}, warm.cases.map(item => h('tr', { class: item.call_id && ctx.can('traces') ? 'click' : '', onclick: () => item.call_id && ctx.can('traces') && ctx.navigate(`traces-call-${encodeURIComponent(item.call_id)}`) },
        h('td', {}, item.name, item.detail ? h('div', { class: 'small muted' }, short(item.detail, 200)) : null), h('td', {}, pill(item.outcome)),
        h('td', { class: 'num' }, ms(item.wall_ms)), h('td', { class: 'num' }, `${tokens(item.tokens_in)} + ${tokens(item.tokens_out)}`)))))) : null,
    !(manifest.warmup ?? []).length && program.functions.length ? h('div', { class: 'small muted' }, 'Add a warm-up example to prepare the model before a run. Warm-up settings live in the program manifest.') : null);
  fill(container,
    h('section', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, manifest.name, h('span', { class: 'muted' }, ` ${manifest.version}`)),
      ctx.can('traces') ? h('a', { href: ctx.href(`traces-program-${encodeURIComponent(program.directory)}`) }, 'Traces of this program') : null),
      manifest.description ? h('div', {}, manifest.description) : null,
      program.problem ? h('div', { class: 'callout warn' }, `natlang.json: ${program.problem}`) : null,
      modelDescription(h, manifest.model)),
    runnable ? runPanel : null, functions,
    h('section', { class: 'panel' }, h('h2', {}, 'Saved tests'), h('p', {}, program.examplesProblem ?? `${program.examples} saved input/expected-output example${program.examples === 1 ? '' : 's'}. Tests execute real model calls and compare exact results.`),
      ctx.can('run:test') ? h('button', { onclick: () => ctx.startRun({ kind: 'test', path: program.directory }) }, 'Run tests') : null),
    buildable || lock ? h('details', { class: 'panel' }, h('summary', {}, 'Build and warm-up details'), build) : null,
    program.readme ? h('section', { class: 'panel' }, h('h3', { class: 'muted small' }, program.readme.name), h('div', { class: 'prose' }, markdown(h, program.readme.text))) : null);
}

function functionCard(ctx, program, fn) {
  const { h, fill, api } = ctx, attempt = ctx.attempt;
  const formId = encodeURIComponent(fn.source);
  const fields = fn.fields ?? fn.params.map(param => { const [name, ...type] = param.split(':'); return { name: name.replace('?', '').trim(), required: !name.includes('?'), tree: { kind: 'prim', name: type.join(':').trim() } }; });
  const warmCase = (program.manifest.warmup ?? []).find(item => item.function === fn.source);
  const last = program.lastCalls?.[`${program.directory === '.' ? '' : program.directory + '/'}${fn.source}`];
  const sample = last?.inputs ?? warmCase?.inputs ?? {};
  const inputs = fields.map(field => ({ field, editor: typedValueEditor(ctx, { name: field.name, type: field.tree, value: sample[field.name], required: field.required, description: field.description ?? field.problem }) }));
  const valuesFromFields = () => Object.fromEntries(inputs.map(({ field, editor }) => [field.name, editor.get()]).filter(([, value]) => value !== undefined));
  const sourceBox = h('div', { class: 'stack', hidden: true }), profile = h('span', {});
  let chosen;
  profileSelect(ctx, `call-profile-${formId}`, last?.profile).then(select => { chosen = select; fill(profile, select); }).catch(error => fill(profile, error.message));
  const call = attempt(async () => ctx.startRun({ kind: 'call', function: `${program.directory}/${fn.source}`, inputs: valuesFromFields(), program: program.directory,
    profile: chosen?.value || undefined }));
  const expected = typedValueEditor(ctx, { name: 'Expected result', type: fn.result?.tree, required: true, description: 'Choose what this function should return for the inputs above.' });
  return h('details', { class: 'panel function-card' },
    h('summary', {}, h('span', { class: 'function-title' }, h('strong', {}, fn.name), h('span', { class: 'small muted' }, fn.description || fn.source)), h('span', { class: 'small function-open' }, 'Try it')),
    h('div', { class: 'stack function-body' }, h('code', { class: 'small muted' }, fn.source), inputs.map(({ editor }) => editor.element),
      h('div', { class: 'row' }, profile, ctx.can('run:call') ? h('button', { class: 'primary', onclick: call }, 'Call function') : null,
        ctx.can('traces') ? h('a', { href: ctx.href(`traces-${encodeURIComponent(fn.name)}`) }, 'Recorded calls') : null,
        h('button', { onclick: attempt(async () => { const source = await api.programs.source(`${program.directory}/${fn.source}`);
          const editor = h('textarea', { rows: 14, class: 'source-editor', 'aria-label': `Source of ${fn.name}` }, source.text); let previous = source.text;
          fill(sourceBox, h('code', {}, source.path), editor, h('button', { onclick: attempt(async () => {
            await api.programs.saveSource({ path: source.path, text: editor.value, previous }); previous = editor.value; ctx.toast('Saved. Call the function or run the program to try the change.');
          }) }, 'Save source'), h('p', { class: 'small muted' }, 'Arguments and returns define the contract. Save an example to check the behavior.'));
          sourceBox.hidden = false; }) }, 'Edit instructions')),
      sourceBox, h('details', { class: 'save-test' }, h('summary', {}, 'Save an expected result as a test'), expected.element,
        h('button', { onclick: attempt(async () => {
          await api.programs.saveExample({ path: program.directory, example: { function: fn.source, inputs: valuesFromFields(), expected: expected.get() } });
          ctx.toast('Test saved. Use Run tests to verify the expected result.');
        }) }, 'Save test'))));
}
