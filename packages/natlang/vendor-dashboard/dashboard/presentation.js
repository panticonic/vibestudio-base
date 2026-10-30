// Values are read as reports, records, lists and facts. Serialization is reserved for explicit copy/download actions.
export const fieldLabel = name => String(name).replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, char => char.toUpperCase());
export function messageSummary(value) {
  if (value && typeof value === 'object') { const message = value.message || value.error?.message || value.error; return message ? messageSummary(message) : 'The action could not be completed.'; }
  const source = String(value ?? '').trim(), parsed = interpretOutput(source);
  if (parsed.kind === 'value' && (typeof parsed.value === 'object' || typeof parsed.value === 'string')) return messageSummary(parsed.value);
  if (parsed.kind === 'sequence') return messageSummary(parsed.value[0]);
  if (parsed.kind === 'entries') return parsed.entries.find(entry => entry.prefix)?.prefix || 'The service returned additional details.';
  if (parsed.kind === 'invalid') return 'The service returned incomplete structured data.';
  return source.split('\n')[0].slice(0, 220);
}
const scalar = value => value === null || typeof value !== 'object';
const structuredPrefix = source => /^\s*\{/.test(source) || /^\s*\[\s*(?:[\[{"\d\]-]|true\b|false\b|null\b)/.test(source);
export function valueSummary(value) {
  if (value === null || value === undefined) return 'No value';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 21 }).format(value);
  if (typeof value === 'string') {
    if (structuredPrefix(value)) { try { return valueSummary(JSON.parse(value)); } catch { return 'Structured details'; } }
    return value.length > 110 ? value.slice(0, 110) + '…' : value || 'Empty text';
  }
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  return `${Object.keys(value).length} ${Object.keys(value).length === 1 ? 'field' : 'fields'}`;
}

function inline(h, line) {
  return line.split(/(`[^`]+`)/).map(part => part.startsWith('`') && part.endsWith('`') ? h('code', {}, part.slice(1, -1)) : part);
}
export function prose(h, text) {
  const blocks = String(text).split(/\n\s*\n/).map(block => {
    const lines = block.split('\n');
    if (lines.every(line => /^\s*[-*]\s+/.test(line))) return h('ul', { class: 'result-list' }, lines.map(line => h('li', {}, inline(h, line.replace(/^\s*[-*]\s+/, '')))));
    if (lines.every(line => /^\s*\d+\.\s+/.test(line))) return h('ol', { class: 'result-list' }, lines.map(line => h('li', {}, inline(h, line.replace(/^\s*\d+\.\s+/, '')))));
    if (/^#{1,5}\s+/.test(block) && lines.length === 1) return h('h3', {}, inline(h, block.replace(/^#{1,5}\s+/, '')));
    return h('p', { class: 'value-prose' }, inline(h, block));
  });
  return h('div', { class: 'result-prose' }, blocks);
}

/** A semantic value reader. Large collections and nested data disclose progressively rather than dumping a tree. */
export function valueView(h, value, options = {}) {
  const { depth = 0, ancestors = new Set(), compact = false, path = '$', openPaths = new Set() } = options;
  if (value === undefined || value === null) return h('span', { class: 'value-empty' }, value === undefined ? 'Not provided' : 'No value');
  if (typeof value === 'boolean') return h('span', { class: `value-boolean ${value ? 'yes' : 'no'}` }, h('span', { 'aria-hidden': 'true' }, value ? '✓' : '−'), value ? 'Yes' : 'No');
  if (typeof value === 'number') return h('span', { class: 'value-number', title: String(value) }, valueSummary(value));
  if (typeof value === 'string') {
    if (!value.length) return h('span', { class: 'value-empty' }, 'Empty text');
    if (structuredPrefix(value)) {
      try { const decoded = JSON.parse(value); if (decoded && typeof decoded === 'object') return valueView(h, decoded, options); }
      catch { return h('div', { class: 'output-incomplete' }, h('p', {}, 'This structured text is incomplete.'), h('button', { type: 'button', onclick: () => downloadData(value, 'value.txt') }, 'Download value')); }
    }
    if (/^https?:\/\/\S+$/.test(value)) {
      try { const url = new URL(value); return h('a', { class: 'value-link', href: value, title: value, target: '_blank', rel: 'noopener noreferrer' }, url.hostname + (url.pathname === '/' ? '' : url.pathname)); } catch { /* ordinary text */ }
    }
    if (value.length > 1500 && !options.expanded) return h('div', {}, prose(h, value.slice(0, 350) + '…'), h('details', { class: 'value-disclosure' }, h('summary', {}, 'Read full text'), prose(h, value)));
    return prose(h, value);
  }
  if (typeof value !== 'object') return h('span', { class: 'value-empty' }, typeof value === 'function' ? 'Callable value' : String(value));
  if (ancestors.has(value)) return h('span', { class: 'value-empty' }, 'Reference to an earlier value');
  const next = new Set(ancestors); next.add(value);
  const child = (item, extra = {}) => valueView(h, item, { depth: depth + 1, ancestors: next, path, openPaths, ...extra });
  if (depth > 0 && (compact || depth > 2) && !options.expanded) {
    const disclosure = h('details', { class: 'value-disclosure', 'data-value-path': path }, h('summary', {}, valueSummary(value))); let built = false;
    const build = () => { if (disclosure.open && !built) { built = true; disclosure.append(valueView(h, value, { ...options, compact: false, expanded: true })); } };
    disclosure.addEventListener('toggle', build);
    if (openPaths.has(path)) { disclosure.open = true; build(); }
    return disclosure;
  }
  if (Array.isArray(value)) {
    if (!value.length) return h('div', { class: 'value-empty' }, 'No items');
    if (options.listStyle !== 'list' && value.every(item => typeof item === 'string' && item.length < 45 && !item.includes('\n'))) return collection(h, value, item => h('span', { class: 'value-chip' }, item), 'value-chips', 24);
    const records = value.every(item => item && typeof item === 'object' && !Array.isArray(item));
    if (records && value.length > 1) {
      const keys = [...new Set(value.flatMap(item => Object.keys(item)))];
      const columns = keys.filter(key => value.every(item => item[key] === undefined || scalar(item[key]))).slice(0, 5);
      if (columns.length) {
        const extra = keys.some(key => !columns.includes(key));
        const rows = h('tbody'), table = h('table', { class: 'value-table' }, h('thead', {}, h('tr', {}, columns.map(key => h('th', { scope: 'col', title: key }, fieldLabel(key))), extra ? h('th', { scope: 'col' }, 'Details') : null)), rows);
        let shown = 0;
        const more = h('button', { type: 'button', class: 'value-more' });
        const draw = () => {
          const end = Math.min(value.length, shown + 20);
          for (; shown < end; shown++) rows.append(h('tr', {}, columns.map(key => h('td', {}, child(value[shown][key], { path: `${path}/${shown}/${key}` }))), extra ? h('td', {}, h('details', { class: 'value-disclosure', 'data-value-path': `${path}/${shown}/record`, open: openPaths.has(`${path}/${shown}/record`) }, h('summary', {}, 'Open record'), child(value[shown], { expanded: true, path: `${path}/${shown}` }))) : null));
          more.hidden = shown === value.length; more.textContent = `Show ${Math.min(20, value.length - shown)} more records`;
        };
        more.addEventListener('click', draw); draw();
        return h('div', { class: 'value-collection' }, h('div', { class: 'value-collection-meta' }, `${value.length} records`), h('div', { class: 'table-wrap' }, table), more);
      }
    }
    return collection(h, value, (item, index) => h('li', { class: 'value-list-item' }, !scalar(item) ? h('span', { class: 'value-item-number' }, String(index + 1).padStart(2, '0')) : null, child(item, { path: `${path}/${index}` })), 'value-list', 12, 'ol');
  }
  const entries = Object.entries(value);
  if (!entries.length) return h('div', { class: 'value-empty' }, 'No fields');
  if (entries.every(([, item]) => typeof item === 'number') && entries.length <= 12) return h('dl', { class: 'value-metrics' }, entries.map(([key, item]) => h('div', {}, h('dt', { title: key }, fieldLabel(key)), h('dd', {}, child(item)))));
  const primary = new Set(['summary', 'message', 'description']);
  const facts = entries.filter(([key, item]) => key !== 'code' && !primary.has(key) && scalar(item) && (typeof item !== 'string' || item.length < 160 && !item.includes('\n')));
  const sections = entries.filter(entry => !facts.includes(entry));
  const section = ([key, item]) => h('section', { class: 'value-section' }, h('h4', { title: key }, fieldLabel(key)), key === 'code' && typeof item === 'string' ? codeView(h, item) : child(item, { path: `${path}/${key}`, listStyle: ['actions', 'steps', 'recommendations'].includes(key) ? 'list' : undefined }));
  const elements = sections.filter(([key]) => primary.has(key)).map(section);
  if (facts.length) elements.push(collection(h, facts, ([key, item]) => h('div', {}, h('dt', { title: key }, fieldLabel(key)), h('dd', {}, child(item, { path: `${path}/${key}` }))), 'value-facts', 12, 'dl'));
  const secondary = sections.filter(([key]) => !primary.has(key));
  if (secondary.length) elements.push(collection(h, secondary, section, 'value-sections', 8));
  return h('div', { class: 'value-record' }, elements);
}

function collection(h, items, render, className, pageSize, tag = 'div') {
  const list = h(tag, { class: className }), more = h('button', { type: 'button', class: 'value-more' });
  let shown = 0;
  const draw = () => {
    const end = Math.min(items.length, shown + pageSize);
    for (; shown < end; shown++) list.append(render(items[shown], shown));
    more.hidden = shown === items.length; more.textContent = `Show ${Math.min(pageSize, items.length - shown)} more items`;
  };
  more.addEventListener('click', draw); draw(); return h('div', { class: 'value-collection' }, list, more);
}

/** Recognize complete structured output without ever putting its serialized draft on screen. */
export function interpretOutput(source, running = false) {
  const input = source.trim();
  if (!input) return { kind: 'empty' };
  try { return { kind: 'value', value: JSON.parse(input) }; } catch { /* prose, an incomplete value, or a sequence of entries */ }
  const lines = input.split('\n').filter(Boolean);
  if (lines.length > 1 && lines.every(line => { try { JSON.parse(line); return true; } catch { return false; } })) return { kind: 'value', value: lines.map(line => JSON.parse(line)) };
  if (lines.length > 1) {
    const values = []; let tail = '';
    for (const line of lines) { try { values.push(JSON.parse(line)); } catch { tail = line; break; } }
    if (values.length && values.length === lines.length - 1 && (structuredPrefix(tail) || /^\s*"/.test(tail))) return { kind: 'sequence', value: values, pending: running, incomplete: !running };
  }
  const structured = structuredPrefix(input);
  if (structured) return { kind: running ? 'pending' : 'invalid' };
  const entries = lines.map(line => {
    const match = /^(.*?)\s*([\[{].*)$/.exec(line);
    if (!match) return { text: line };
    try { const value = JSON.parse(match[2]); if (value && typeof value === 'object') return { prefix: match[1].trim(), value }; } catch { /* a partial log entry */ }
    if (/^(?:\{|\[\s*[{"\d\]])/.test(match[2])) return { prefix: match[1].trim(), pending: running };
    return { text: line };
  });
  if (entries.some(entry => 'value' in entry || 'pending' in entry)) return { kind: 'entries', entries };
  return { kind: 'text', text: source };
}

export function downloadData(value, filename = 'result.json') {
  const source = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(new Blob([source], { type: filename.endsWith('.json') ? 'application/json' : 'text/plain' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Persistent viewport for output, model replies and tool results. Prose appends in place; complete values become reports. */
export function createOutputView(h, { label = 'Result', empty = 'Nothing to show yet.', controls = false, className = '' } = {}) {
  const content = h('div', { class: `output-content ${className}`, tabindex: '0', 'aria-label': label });
  const kind = h('span', { class: 'output-kind' }), actions = h('div', { class: 'output-actions' });
  let current = '', previous = '', mode = '', value, copied;
  if (controls) actions.append(kind,
    h('button', { type: 'button', class: 'ghost small', onclick: async event => {
      const button = event.currentTarget;
      try { await navigator.clipboard.writeText(current); button.textContent = 'Copied'; clearTimeout(copied); copied = setTimeout(() => { button.textContent = 'Copy result'; }, 1500); }
      catch { button.textContent = 'Copy unavailable'; }
    } }, 'Copy result'), h('button', { type: 'button', class: 'ghost small', onclick: () => downloadData(current, interpretOutput(current).kind === 'value' ? 'result.json' : 'output.txt') }, 'Download'));
  const element = h('div', { class: 'output-reader' }, controls ? actions : null, content);
  const update = (source = '', { running = false } = {}) => {
    current = String(source); if (current === previous && mode && !(new Set(['pending', 'empty', 'sequence', 'entries']).has(mode) && !running)) return;
    const result = interpretOutput(current, running), next = result.kind;
    const top = content.scrollTop, following = content.scrollHeight - content.scrollTop - content.clientHeight < 28;
    const openPaths = new Set([...content.querySelectorAll('details[data-value-path][open]')].map(node => node.dataset.valuePath));
    if (next === 'text' && mode === 'text' && current.startsWith(previous) && content.firstChild?.nodeType === 3) content.firstChild.appendData(current.slice(previous.length));
    else {
      if (next === 'empty') content.replaceChildren(h('div', { class: 'output-empty' }, h('span', { class: 'output-empty-mark', 'aria-hidden': 'true' }, '↳'), label === 'Program output' && !running ? 'No program output.' : empty));
      else if (next === 'pending') content.replaceChildren(h('div', { class: 'output-pending', role: 'status' }, h('span', { class: 'pending-dot', 'aria-hidden': 'true' }), 'Receiving a structured result…'));
      else if (next === 'invalid') content.replaceChildren(h('div', { class: 'output-incomplete' }, h('strong', {}, 'This result is incomplete'), h('p', {}, 'The program ended before its structured result could be read. Download the output to inspect it.')));
      else if (next === 'value') { value = result.value; content.replaceChildren(valueView(h, value, { openPaths })); }
      else if (next === 'sequence') { value = result.value; content.replaceChildren(valueView(h, value, { openPaths }), h('p', { class: 'small muted', role: 'status' }, result.pending ? 'Receiving the next record…' : 'The last record is incomplete. Download the output to inspect it.')); }
      else if (next === 'entries') content.replaceChildren(h('div', { class: 'log-entries' }, result.entries.map((entry, index) => h('div', { class: 'log-entry' },
        entry.prefix ? h('div', { class: 'log-entry-label' }, entry.prefix) : null,
        'value' in entry ? valueView(h, entry.value, { openPaths, path: `entry/${index}` }) : 'pending' in entry ? h('span', { class: 'small muted' }, entry.pending ? 'Receiving details…' : 'Structured details could not be read. Download the output to inspect them.') : h('span', {}, entry.text)))));
      else content.replaceChildren(current);
    }
    kind.textContent = next === 'value' ? Array.isArray(value) ? `${value.length} items` : value && typeof value === 'object' ? 'Structured result' : 'Result' : next === 'pending' ? 'Receiving' : next === 'text' ? 'Text output' : '';
    content.dataset.format = next; content.scrollTop = following ? content.scrollHeight : top;
    previous = current; mode = next;
  };
  update(); return { element, content, update, value: () => value };
}

/** Errors have a message first, with supporting details behind an explicit disclosure. */
export function problemView(h, message, { title = 'Something needs attention' } = {}) {
  if (message && typeof message === 'object') return h('div', { class: 'problem-card' }, h('h3', {}, messageSummary(message) || title), valueView(h, message));
  const parsed = interpretOutput(String(message ?? ''));
  if (parsed.kind === 'value' && parsed.value && typeof parsed.value === 'object') return h('div', { class: 'problem-card' }, h('h3', {}, messageSummary(parsed.value) || title), valueView(h, parsed.value));
  if (parsed.kind === 'invalid') return h('div', { class: 'problem-card' }, h('h3', {}, title), h('p', {}, 'The structured diagnostic is incomplete. Download the run log to inspect the original message.'));
  if (parsed.kind === 'entries') { const reader = createOutputView(h, { label: 'Error details' }); reader.update(String(message)); return h('div', { class: 'problem-card' }, h('h3', {}, title), reader.element); }
  const lines = String(message ?? '').trim().split('\n'), first = lines.shift() || title;
  const supporting = lines.filter(Boolean).join('\n'), reader = createOutputView(h, { label: 'Supporting details' }); reader.update(supporting);
  return h('div', { class: 'problem-card' }, h('p', { class: 'problem-message' }, first), supporting ? h('details', { class: 'value-disclosure' }, h('summary', {}, 'Supporting details'), reader.element) : null);
}

export function modelDescription(h, model) {
  if (!model) return h('span', { class: 'muted' }, 'Uses your default model');
  const name = model.profile || model.stock || model.model || 'Configured model';
  return h('div', { class: 'model-binding' }, h('span', { class: 'model-binding-mark', 'aria-hidden': 'true' }, '◈'), h('strong', {}, name),
    h('span', { class: 'small muted' }, model.provider ? `via ${model.provider}` : model.endpoint ? String(model.endpoint).replace(/^https?:\/\//, '').split('/')[0] : model.stock ? 'Local model' : 'Model profile'),
    h('details', { class: 'value-disclosure small' }, h('summary', {}, 'Settings'), valueView(h, model)));
}

export function codeView(h, source) {
  const code = h('pre', { class: 'source-code', tabindex: '0' });
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|return|await|async|if|else|for|of|throw|new|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;
  let end = 0;
  for (const match of source.matchAll(pattern)) { code.append(source.slice(end, match.index), h('span', { class: match[1] ? 'syntax-comment' : match[2] ? 'syntax-string' : match[3] ? 'syntax-keyword' : 'syntax-number' }, match[0])); end = match.index + match[0].length; }
  code.append(source.slice(end)); return code;
}

export function eventTimeline(h, events) {
  const labels = { model_request: 'Model request', proposal: 'Model response', action: 'Execution step', scope_failure: 'Step needs attention', model_incomplete: 'Model could not finish',
    service_call: 'Service call', return: 'Function returned', weight_stack: 'Model adaptation', decision_readout: 'Decision' };
  const list = h('ol', { class: 'event-timeline' }), more = h('button', { type: 'button' }); let shown = 0;
  const visible = events.filter(event => !['state', 'reduction'].includes(event.kind));
  const draw = () => {
    const end = Math.min(shown + 30, visible.length);
    for (; shown < end; shown++) {
      const event = visible[shown], fields = Object.fromEntries(Object.entries(event).filter(([key]) => !['version', 'seq', 'kind', 'phase', 'observed_at', 'elapsed_ms', 'call_id'].includes(key)));
      list.append(h('li', { class: `event-item${event.outcome === 'rejected' || event.kind === 'scope_failure' ? ' attention' : ''}` },
        h('span', { class: 'event-time' }, event.elapsed_ms == null ? '—' : `${(event.elapsed_ms / 1000).toFixed(2)} s`),
        h('details', { class: 'event-details' }, h('summary', {}, h('strong', {}, labels[event.kind] || fieldLabel(event.kind)),
          event.phase ? h('span', { class: 'event-phase' }, fieldLabel(event.phase)) : null), valueView(h, fields))));
    }
    more.hidden = shown === visible.length; more.textContent = `Show ${Math.min(30, visible.length - shown)} more events`;
  };
  more.addEventListener('click', draw); draw();
  return h('div', { class: 'timeline-reader' }, h('p', { class: 'small muted' }, `${visible.length} events · times are relative to the start of this call`), list, more);
}
