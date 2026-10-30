// Models: hosted providers and their sign-in, the profiles every natlang command shares, the kept-loaded model and the stock local models.
import { valueView } from '../presentation.js';
import { connection, providersPanel, signIn } from '../providers.js';
import { definePage, bytes, tokens, widgets } from '../common.js';
import { keptModelPanel } from '../parts.js';

export const id = 'models', title = 'Models', requires = ['models'], runKinds = [];

// What a profile changes beyond its model: sampling, reasoning budget and server slots.
function profileSettings(profile) {
  const request = profile.request ?? {}, local = profile.local ?? {}, parts = [];
  if (request.temperature !== undefined) parts.push(`temperature ${request.temperature}`);
  if (request.thinking_budget_tokens !== undefined) parts.push(request.thinking_budget_tokens === 0 ? 'no thinking' : `thinking ≤ ${tokens(request.thinking_budget_tokens)} tokens`);
  if (local.contextTokens) parts.push(`${tokens(local.contextTokens)} context`);
  if (local.parallel) parts.push(`${local.parallel} slots`);
  if (local.server) parts.push('own llama-server');
  if (profile.escalate) parts.push(`escalates to ${profile.escalate}`);
  return parts.join(' · ') || '–';
}

export const mount = definePage({ id, requires, runKinds, async render(target, ctx) {
  const { h, fill, api } = ctx, { pill, header } = widgets(ctx), attempt = ctx.attempt;
  const [config, providers] = await Promise.all([ctx.config(true), api.models.providers().catch(() => [])]);
  const stockRows = h('tbody', {});
  const drawStock = list => fill(stockRows, ...list.map(model => h('tr', {},
    h('td', {}, h('strong', {}, model.label), model.default ? h('span', { class: 'small muted' }, ' · built-in default') : null, h('div', { class: 'small muted mono' }, `${model.source.repository}@${model.source.revision.slice(0, 8)}`)),
    h('td', { class: 'num' }, bytes(model.bytes)),
    h('td', {}, model.installed ? pill('downloaded', 'ok') : model.download && !model.download.done && !model.download.error ?
      h('div', { class: 'row' }, h('div', { class: 'bar' }, h('span', { style: `width: ${Math.round(100 * model.download.received / model.download.total)}%` })), `${Math.round(100 * model.download.received / model.download.total)}%`) :
      model.download?.error ? pill('failed', 'bad') : pill('not downloaded', 'idle')),
    h('td', {}, h('div', { class: 'row' }, !model.installed ? h('button', { onclick: attempt(async () => { await api.models.downloadStock(model.id); }) }, 'Download') : null,
      h('button', { onclick: () => editProfile(model.id.replace(/[^a-z0-9]+/g, '-'), { local: model.default ? undefined : { stock: model.id } }) }, 'Use in a profile'))))));
  drawStock(config.stock);
  ctx.scope.every(attempt(async () => { if (config.stock.some(model => model.download && !model.download.done)) drawStock(config.stock = await api.models.stock()); }), 1500);
  const profileRows = Object.entries(config.profiles);
  const editor = h('div', { id: 'profile-editor' });
  const providerUi = { ...ctx, editProfile };
  const hosted = providersPanel(providerUi, providers, config, ctx.reload);
  const profilesPanel = h('section', { class: 'panel', id: 'profiles' }, h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Profiles'),
      h('label', { class: 'row small muted' }, 'Default', h('select', { id: 'default-profile', onchange: attempt(async event => { await api.models.setDefault(event.target.value || null); ctx.toast('Default profile saved'); ctx.refreshStatus(); ctx.reload(); }) },
        h('option', { value: '' }, 'built-in (stock LFM3 1.7B, local)'), profileRows.map(([name]) => h('option', { value: name, selected: name === config.defaultProfile }, name))))),
      profileRows.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Profile'), h('th', {}, 'Backend'), h('th', {}, 'Model'), h('th', {}, 'Settings'), h('th', {}))),
        h('tbody', {}, profileRows.map(([name, entry]) => h('tr', {}, h('td', {}, h('strong', {}, name), name === config.defaultProfile ? h('span', { class: 'small muted' }, ' · default') : null),
          h('td', {}, entry.error ? pill('invalid', 'bad') : entry.kind), h('td', { class: 'mono small' }, entry.error ?? entry.model),
          h('td', { class: 'small muted' }, profileSettings(entry.profile)),
          h('td', {}, h('div', { class: 'row' }, h('button', { onclick: () => editProfile(name, entry.profile) }, 'Edit'),
            ctx.can('run:ask') ? h('button', { onclick: () => ctx.startRun({ kind: 'ask', instruction: 'Reply with the single word: ready', input: '', profile: name }) }, 'Test') : null,
            h('button', { class: 'danger', onclick: attempt(async () => { await api.models.deleteProfile(name); ctx.toast(`Deleted ${name}`); ctx.reload(); }) }, 'Delete')))))))) :
        h('div', { class: 'muted' }, 'No profiles yet, so every command runs the built-in local model (stock LFM3 1.7B on the managed llama.cpp server). Connecting a hosted model above creates one; New profile sets up anything else.'));
  const localModels = h('section', { class: 'panel', id: 'local-models' }, h('h2', {}, 'Local models'), h('div', { class: 'muted small' }, 'Stock GGUF files natlang serves on its managed llama.cpp server, pinned to one repository revision and checked by SHA-256.'),
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Model'), h('th', { class: 'num' }, 'Size'), h('th', {}, 'State'), h('th', {}))), stockRows)));
  fill(target, header('Models', 'Choose the model natlang runs: a hosted provider or a model on this machine. Every natlang command, program and this dashboard use the same profiles (~/.config/natlang/config.json).',
      h('button', { onclick: () => editProfile('', {}) }, 'New profile')),
    // On a first run the hosted-model choices come first; once profiles exist, the profile list leads.
    h('nav', { class: 'jump', 'aria-label': 'Sections on this page' }, [['Hosted models', hosted], ['Profiles', profilesPanel], ['Local models', localModels]]
      .map(([label, section]) => h('button', { class: 'ghost', onclick: () => section.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, label))),
    ...(profileRows.length ? [profilesPanel, hosted] : [hosted, profilesPanel]), editor, localModels, await keptModelPanel(ctx));

  function editProfile(name, profile) {
    const kind = profile.provider ? 'provider' : profile.endpoint ? 'endpoint' : profile.native ? 'native' : 'local';
    const nameField = h('input', { id: 'p-name', value: name, placeholder: 'e.g. claude, local-fast' });
    const kindField = h('select', { id: 'p-kind' }, [['local', 'Local model (managed llama.cpp)'], ['provider', 'API provider'], ['endpoint', 'OpenAI-compatible server'], ...(kind === 'native' ? [['native', 'Native checkpoint (natlang setup --native)']] : [])]
      .map(([value, label]) => h('option', { value, selected: value === kind }, label)));
    const fields = h('div', { class: 'stack' });
    const makeDefault = h('input', { type: 'checkbox', id: 'p-default' });
    // The inputs of the backend currently shown, read when the profile is saved.
    let refs = {};
    const drawFields = async () => {
      const value = kindField.value;
      refs = {};
      if (value === 'local') {
        refs.stock = h('select', { id: 'p-stock' }, config.stock.map(model => h('option', { value: model.id, selected: (profile.local?.stock ?? config.builtinDefault.model) === model.id }, `${model.label}${model.installed ? '' : ` (${bytes(model.bytes)} download)`}`)));
        refs.context = h('input', { id: 'p-context', type: 'number', min: 1024, step: 1024, value: profile.local?.contextTokens ?? '', placeholder: '32768' });
        refs.parallel = h('input', { id: 'p-parallel', type: 'number', min: 1, value: profile.local?.parallel ?? '', placeholder: 'auto' });
        refs.gpu = h('input', { id: 'p-gpu', type: 'number', min: 0, value: profile.local?.gpuLayers ?? '', placeholder: '99 (all)' });
        refs.server = h('input', { id: 'p-server', value: profile.local?.server ?? '', placeholder: 'managed CPU/Metal build' });
        fill(fields, h('div', { class: 'row' },
          h('label', { class: 'field' }, 'Model', refs.stock), h('label', { class: 'field' }, 'Context per slot', refs.context),
          h('label', { class: 'field' }, 'Parallel slots', refs.parallel), h('label', { class: 'field' }, 'GPU layers', refs.gpu)),
          h('label', { class: 'field' }, 'llama-server binary (optional, e.g. a CUDA build)', refs.server));
      } else if (value === 'provider') {
        // A new provider profile starts on a connected provider (else Anthropic) and its recommended model, listed first.
        const initial = profile.provider ?? providers.find(item => item.connected)?.id ?? 'anthropic';
        const providerField = refs.provider = h('select', { id: 'p-provider' }, providers.map(item => h('option', { value: item.id, selected: item.id === initial }, `${item.name}${item.connected ? ` · ${connection(item)}` : ''}`)));
        const modelField = refs.model = h('select', { id: 'p-model' });
        refs.key = h('input', { id: 'p-key', type: 'password', placeholder: 'leave empty to keep the saved key or use the environment' });
        const signInRow = h('div', { class: 'row small' });
        const loadModels = attempt(async (refresh = false) => {
          const provider = providers.find(item => item.id === providerField.value);
          const list = await api.models.providerModels(providerField.value, { refresh: refresh === true });
          const keep = provider?.id === profile.provider ? profile.model : undefined;
          fill(modelField, ...list.map(item => h('option', { value: item.id, selected: item.id === keep }, `${item.name}${item.family ? ` · newest ${item.family === 'luna' ? 'Luna' : 'Haiku'}` : ''}${item.recommended ? ' (recommended)' : ''}${item.contextWindow ? ` · ${tokens(item.contextWindow)} context` : ''}`)));
          fill(signInRow, h('span', { class: 'muted' }, provider?.connected ? `Connected: ${connection(provider)}.` : 'Not connected yet.'),
            provider?.oauth ? h('button', { type: 'button', onclick: async () => { if (await signIn(providerUi, provider, 'oauth')) loadModels(); } }, provider.oauth.label ?? 'Sign in with subscription') : null,
            h('button', { type: 'button', title: 'Fetch the provider\'s current model list', onclick: () => loadModels(true) }, 'Refresh models'));
        });
        providerField.addEventListener('change', () => loadModels());
        fill(fields, h('div', { class: 'row' }, h('label', { class: 'field' }, 'Provider', providerField), h('label', { class: 'field', style: 'flex: 1' }, 'Model', modelField)),
          h('label', { class: 'field' }, 'API key (saved to natlang\'s credential store for this provider)', refs.key),
          signInRow);
        if (providers.length) await loadModels();
        if (profile.provider && !name) nameField.value = profile.provider;
      } else if (value === 'endpoint') {
        refs.endpoint = h('input', { id: 'p-endpoint', value: profile.endpoint ?? '', placeholder: 'http://127.0.0.1:8080' });
        refs.modelName = h('input', { id: 'p-model-name', value: profile.model ?? '', placeholder: 'as the server expects' });
        refs.keyEnv = h('input', { id: 'p-key-env', value: profile.apiKeyEnv ?? 'NATLANG_API_KEY' });
        refs.key = h('input', { id: 'p-key', type: 'password' });
        fill(fields, h('div', { class: 'row' },
          h('label', { class: 'field', style: 'flex: 2' }, 'Server URL', refs.endpoint),
          h('label', { class: 'field', style: 'flex: 1' }, 'Model name', refs.modelName)),
          h('div', { class: 'row' }, h('label', { class: 'field' }, 'API key variable', refs.keyEnv),
            h('label', { class: 'field', style: 'flex: 1' }, 'API key (optional; saved for that variable)', refs.key)));
      } else fill(fields, valueView(h, profile), h('div', { class: 'small muted' }, 'Native profiles are written by natlang setup --native; edit them there.'));
    };
    kindField.addEventListener('change', drawFields);
    const temperature = h('input', { id: 'p-temperature', type: 'number', min: 0, max: 2, step: 0.1, value: profile.request?.temperature ?? '', placeholder: 'model default' });
    // llama.cpp's per-request reasoning budget: unlimited is how the stock model was evaluated; a budget trades some
    // accuracy for speed, mostly on a CPU. Pi providers set reasoning through their own options.
    const budget = profile.request?.thinking_budget_tokens;
    const thinking = h('select', { id: 'p-thinking', title: 'Reasoning tokens per model turn' },
      [['', 'unlimited'], ['2048', '2,048 tokens'], ['1024', '1,024 tokens'], ['512', '512 tokens'], ['256', '256 tokens'], ['0', 'off']]
        .map(([value, label]) => h('option', { value, selected: String(budget ?? '') === value }, label)));
    const save = attempt(async () => {
      const profileName = nameField.value.trim();
      if (!profileName) throw new Error('Give the profile a name');
      const value = kindField.value, number = element => { const raw = element?.value; return raw === '' || raw === undefined ? undefined : Number(raw); };
      let next;
      if (value === 'local') {
        const stock = refs.stock.value, server = refs.server.value.trim();
        const local = Object.fromEntries(Object.entries({ stock: stock === config.builtinDefault.model ? undefined : stock, contextTokens: number(refs.context),
          parallel: number(refs.parallel), gpuLayers: number(refs.gpu), server: server || undefined }).filter(([, v]) => v !== undefined));
        next = { ...(Object.keys(local).length ? { local } : {}) };
      } else if (value === 'provider') {
        const provider = refs.provider.value, key = refs.key.value.trim();
        if (key) await api.models.saveCredential(provider, key);
        next = { provider, model: refs.model.value };
      } else if (value === 'endpoint') {
        const apiKeyEnv = refs.keyEnv.value.trim() || 'NATLANG_API_KEY', key = refs.key.value.trim();
        if (key) await api.models.saveCredential(`env:${apiKeyEnv}`, key);
        next = { endpoint: refs.endpoint.value.trim(), ...(refs.modelName.value.trim() ? { model: refs.modelName.value.trim() } : {}), apiKeyEnv };
      } else next = profile;
      if (value !== 'provider') {
        const request = { ...(profile.request ?? {}) }, t = number(temperature), think = number(thinking);
        if (t === undefined) delete request.temperature; else request.temperature = t;
        if (think === undefined) delete request.thinking_budget_tokens; else request.thinking_budget_tokens = think;
        if (Object.keys(request).length) next.request = request; else delete next.request;
      }
      if (profile.escalate) next.escalate = profile.escalate;
      await api.models.saveProfile(profileName, next, makeDefault.checked);
      ctx.toast(`Saved profile ${profileName}`); ctx.refreshStatus(); ctx.reload();
    });
    fill(editor, h('section', { class: 'panel' }, h('h2', {}, name ? `Edit ${name}` : 'New profile'),
      h('div', { class: 'row' }, h('label', { class: 'field' }, 'Name', nameField), h('label', { class: 'field' }, 'Backend', kindField),
        h('label', { class: 'field' }, 'Temperature', temperature), h('label', { class: 'field' }, 'Thinking', thinking)),
      fields, h('label', { class: 'row small' }, makeDefault, 'Make this the default profile'),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, 'Save profile'), h('button', { onclick: () => fill(editor) }, 'Cancel'))));
    drawFields(); editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
} });
