// Hosted models on the Models page: Pi's provider catalog (src/model/pi-provider.ts) with each provider's connection, its
// sign-in flows run from the page (subscription OAuth with its URL or device code, or the provider's API-key prompts;
// POST /api/providers/:id/login) and one-click profiles on its recommended model, the newest Luna or Haiku it serves
// (src/model/provider-recommendations.ts). The panel leads a first-time user from "what do you already have?" to a
// working default; once something is connected it shows which provider and model the commands use.

/** Providers listed first: the subscription sign-ins and the common API services. */
const FEATURED = ['anthropic', 'openai', 'github-copilot', 'openrouter', 'google', 'xai', 'mistral', 'groq', 'together', 'amazon-bedrock'];
/** Where each service issues API keys, linked from its key prompt. */
const KEY_PAGES = {
  anthropic: 'https://console.anthropic.com/settings/keys', openai: 'https://platform.openai.com/api-keys', openrouter: 'https://openrouter.ai/settings/keys',
  google: 'https://aistudio.google.com/apikey', xai: 'https://console.x.ai', mistral: 'https://console.mistral.ai/api-keys', groq: 'https://console.groq.com/keys',
  together: 'https://api.together.ai/settings/api-keys', deepseek: 'https://platform.deepseek.com/api_keys', fireworks: 'https://fireworks.ai/settings/users/api-keys',
  cerebras: 'https://cloud.cerebras.ai', huggingface: 'https://huggingface.co/settings/tokens', 'vercel-ai-gateway': 'https://vercel.com/dashboard/ai-gateway',
};
/** The quick start's subscription choices: what the user already pays for, in their words. */
const SUBSCRIPTIONS = [['anthropic', 'Claude Pro or Max'], ['openai', 'ChatGPT Plus or Pro'], ['github-copilot', 'GitHub Copilot']];

/** "API key · saved", "subscription · saved" or "API key · OPENAI_API_KEY" (an environment variable). */
export const connection = provider => {
  if (!provider.connected) return null;
  const source = provider.stored || /stored|oauth/i.test(provider.connected.source ?? '') ? 'saved' : provider.connected.source;
  return `${provider.connected.type === 'oauth' ? 'subscription' : 'API key'}${source ? ` · ${source}` : ''}`;
};
const fromEnvironment = provider => provider.connected && !provider.stored;
const family = (provider, model) => model === provider.recommended.haiku ? 'Haiku' : model === provider.recommended.luna ? 'Luna' : model;
const link = (h, href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** Save (or update) the profile named after the provider on `model`, optionally as the default. */
export async function useProvider(ui, provider, model, makeDefault) {
  await ui.api.models.saveProfile(provider.id, { provider: provider.id, model }, makeDefault);
  ui.toast(makeDefault ? `Every run now uses ${model} through ${provider.name}` : `Saved profile ${provider.id} (${model})`);
  ui.refreshStatus();
}

/**
 * Run a provider's sign-in in a dialog. Resolves when the dialog closes: 'default' when the user made the provider the
 * default, 'choose' when they went on to pick another model (the caller's profile editor opens), 'connected' when it
 * only stored a credential, else null.
 */
export function signIn(ui, provider, type) {
  const { h, fill } = ui;
  const oauth = type === 'oauth';
  const keyPage = KEY_PAGES[provider.id];
  const intro = oauth ?
    h('p', {}, `Sign in with your ${provider.oauth.name.replace(/^[^(]*\(|\)$/g, '') || provider.name} account. Your browser opens the provider's page; approve access there and this window finishes by itself.`) :
    h('p', {}, `Paste an API key for ${provider.name}`, keyPage ? [' (', link(h, keyPage, 'get one here'), ')'] : null,
      '. natlang keeps it in a private file in its config directory and sends it only to this provider.');
  const body = h('div', { class: 'stack' });
  const dialog = h('dialog', { class: 'login', 'aria-label': `Connect ${provider.name}` },
    h('h2', {}, oauth ? `Sign in to ${provider.name}` : `Connect ${provider.name} with an API key`), intro, body,
    h('div', { class: 'row', style: 'justify-content: flex-end' }, h('button', { type: 'button', class: 'dismiss', onclick: () => dialog.close() }, 'Cancel')));
  ui.modal(dialog);
  let login, timer, shownPrompt = null, next = null;
  return new Promise(resolveSignIn => {
    dialog.addEventListener('close', () => {
      clearInterval(timer);
      if (login?.state === 'running') ui.api.models.cancelLogin(login.id).catch(() => {});
      dialog.remove(); resolveSignIn(login?.state === 'done' ? next ?? 'connected' : null);
    });
    const then = (action, value) => ui.attempt(async () => { await action?.(); next = value; dialog.close(); });
    const events = h('div', { class: 'stack' }), question = h('div', {}), state = h('div', {});
    const answer = ui.attempt(async (prompt, value) => { login = await ui.api.models.answerLogin(login.id, prompt.id, value); draw(); });
    const draw = () => {
      const opened = login.events.some(event => event.type === 'auth_url' || event.type === 'device_code');
      fill(events, login.events.map(event => {
        if (event.type === 'auth_url') return h('div', { class: 'callout step' }, h('strong', {}, 'Open the sign-in page'),
          h('div', { class: 'row' }, h('a', { class: 'button primary', href: event.url, target: '_blank', rel: 'noopener' }, `Open ${provider.name} sign-in`),
            h('button', { type: 'button', onclick: () => navigator.clipboard?.writeText(event.url).then(() => ui.toast('Link copied')) }, 'Copy link')),
          h('div', { class: 'small muted' }, 'After you approve, come back here; this window notices and finishes.'));
        if (event.type === 'device_code') return h('div', { class: 'callout step' }, h('strong', {}, 'Enter this code on ', link(h, event.verificationUri, event.verificationUri.replace(/^https?:\/\//, ''))),
          h('div', { class: 'row' }, h('span', { class: 'device-code mono' }, event.userCode),
            h('button', { type: 'button', onclick: () => navigator.clipboard?.writeText(event.userCode).then(() => ui.toast('Code copied')) }, 'Copy code'),
            h('a', { class: 'button primary', href: event.verificationUri, target: '_blank', rel: 'noopener' }, 'Open page')));
        return h('div', { class: 'small muted' }, event.message, ...(event.links ?? []).map(item => [' ', link(h, item.url, item.label ?? item.url)]));
      }));
      if (login.prompt?.id !== shownPrompt) {
        shownPrompt = login.prompt?.id ?? null;
        const prompt = login.prompt;
        if (!prompt) fill(question);
        else if (prompt.type === 'select' && prompt.options.some(option => /\(default\)/i.test(option.label))) {
          // The provider's default way to sign in (the browser) still offers pasting a code for a browser elsewhere.
          answer(prompt, prompt.options.find(option => /\(default\)/i.test(option.label)).id);
        } else if (prompt.type === 'select') {
          // A choice (e.g. how to sign in) is a set of buttons, the provider's default first and highlighted.
          fill(question, h('div', { class: 'stack' }, h('strong', {}, prompt.message.replace(/:$/, '')),
            h('div', { class: 'choices' }, prompt.options.map((option, index) => h('button', { type: 'button', class: `choice${index === 0 ? ' primary' : ''}`, onclick: () => answer(prompt, option.id) },
              h('span', {}, option.label.replace(/\s*\((default)\)$/i, '')), option.description ? h('span', { class: 'small muted' }, option.description) :
                /headless|device|copy/i.test(option.id + option.label) ? h('span', { class: 'small' }, 'For a browser on another machine') : h('span', { class: 'small' }, 'Recommended on this computer'))))));
        } else {
          const field = h('input', { type: prompt.type === 'secret' ? 'password' : 'text', placeholder: prompt.placeholder ?? '', autocomplete: 'off', spellcheck: 'false' });
          const form = h('form', { class: 'stack', onsubmit: event => { event.preventDefault(); answer(prompt, field.value); } },
            h('label', { class: 'field' }, prompt.message.replace(/:\s*$/, ''), field), h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, 'Continue')));
          // Once a sign-in page is open, pasting the code by hand is only the fallback for a browser elsewhere.
          fill(question, prompt.type === 'manual_code' && opened ? h('details', {}, h('summary', { class: 'small' }, 'Signing in from another device? Paste the code or redirect URL instead'), form) : form);
          if (!(prompt.type === 'manual_code' && opened)) field.focus();
        }
      }
      if (login.state === 'done') {
        // The page's provider list shares this object: its profile editor sees the new connection.
        provider.connected = { type, source: 'stored credential' }; provider.stored = type; provider.problem = null;
        const model = provider.recommended.model;
        fill(question); fill(events); dialog.querySelector('.dismiss').textContent = 'Close';
        fill(state, h('div', { class: 'callout ok' }, h('strong', {}, `Connected to ${provider.name}.`),
            model ? h('div', {}, `Recommended model: ${model} (the newest ${family(provider, model)}).`) : h('div', {}, 'Choose which of its models to run.')),
          h('div', { class: 'row' }, model ? h('button', { class: 'primary', onclick: then(() => useProvider(ui, provider, model, true), 'default') }, `Use ${family(provider, model)} for every run`) : null,
            h('button', { class: model ? '' : 'primary', onclick: then(null, 'choose') }, model ? 'Pick another model…' : 'Choose model…'),
            model ? h('button', { onclick: then(null, 'connected') }, 'Not now') : null));
      } else if (login.state === 'failed' || login.state === 'cancelled') {
        fill(question);
        fill(state, h('div', { class: 'callout warn' }, h('strong', {}, login.state === 'failed' ? 'Sign-in did not finish.' : 'Sign-in cancelled.'), login.error ? h('div', { class: 'small' }, login.error) : null),
          h('div', { class: 'row' }, h('button', { class: 'primary', onclick: start }, 'Try again')));
      } else fill(state, login.prompt || opened ? null : h('div', { class: 'small muted' }, 'Contacting the provider…'));
      if (login.state !== 'running') clearInterval(timer);
    };
    function start() {
      clearInterval(timer); shownPrompt = null;
      fill(body, h('div', { class: 'small muted' }, 'Starting…'));
      ui.api.models.startLogin(provider.id, type).then(started => {
        login = started; fill(body, events, question, state); draw();
        timer = setInterval(async () => { try { login = await ui.api.models.login(login.id); draw(); } catch (error) { fill(state, h('div', { class: 'callout warn' }, error.message)); clearInterval(timer); } }, 1000);
      }, error => fill(body, h('div', { class: 'callout warn' }, error.message)));
    }
    start();
  });
}

/** Ask which service an API key is for, then run its key prompts. */
function keyDialog(ui, providers, connect) {
  const { h } = ui;
  const keyed = providers.filter(provider => provider.apiKey?.prompts);
  const ordered = [...FEATURED.map(id => keyed.find(provider => provider.id === id)).filter(Boolean), ...keyed.filter(provider => !FEATURED.includes(provider.id)).sort((a, b) => a.name.localeCompare(b.name))];
  const select = h('select', {}, ordered.map(provider => h('option', { value: provider.id }, provider.name)));
  const dialog = h('dialog', {}, h('form', { class: 'stack', onsubmit: event => { event.preventDefault(); const provider = ordered.find(item => item.id === select.value); dialog.close(); connect(provider, 'api_key'); } },
    h('h2', {}, 'Which service is the key for?'), h('p', {}, 'Any of these works; OpenRouter is a good choice for one key that reaches many models.'),
    h('label', { class: 'field' }, 'Service', select),
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, 'Continue'), h('button', { type: 'button', onclick: () => dialog.close() }, 'Cancel'))));
  ui.modal(dialog); select.focus();
}

/**
 * The hosted-models panel. `ui` carries the page helpers, `config` is api.models.config() (profiles and the default), and
 * `onChange` redraws the page after a connection or the default changes.
 */
export function providersPanel(ui, providers, config, onChange) {
  const { h, fill } = ui;
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  const featured = FEATURED.map(id => byId.get(id)).filter(Boolean);
  const others = providers.filter(provider => !FEATURED.includes(provider.id)).sort((a, b) => a.name.localeCompare(b.name));
  const anyConnected = providers.some(provider => provider.connected);
  const defaultProfile = config.defaultProfile ? config.profiles[config.defaultProfile]?.profile : undefined;
  const connect = async (provider, type) => {
    const outcome = await signIn(ui, provider, type);
    if (ui.scope.disposed) return;
    if (outcome === 'choose') ui.editProfile('', { provider: provider.id, model: provider.recommended.model });
    else if (outcome) onChange();
  };

  const row = provider => {
    const recommended = provider.recommended, isDefault = defaultProfile?.provider === provider.id;
    // Providers serving both families (Copilot, OpenRouter, …) let the user pick which one "Make default" uses.
    const both = recommended.luna && recommended.haiku;
    const modelField = both && provider.connected ? h('select', { 'aria-label': `${provider.name} model` },
      [recommended.model, recommended.model === recommended.luna ? recommended.haiku : recommended.luna].map(id => h('option', { value: id, selected: isDefault ? id === defaultProfile.model : undefined }, `${id} · ${family(provider, id)}`))) : null;
    const chosen = () => modelField?.value ?? recommended.model;
    const status = connection(provider);
    const actions = [];
    if (!provider.connected || provider.problem) {
      if (provider.oauth) actions.push(h('button', { onclick: () => connect(provider, 'oauth') }, provider.problem ? 'Sign in again' : 'Sign in'));
      if (provider.apiKey?.prompts && !provider.connected) actions.push(h('button', { onclick: () => connect(provider, 'api_key') }, 'Add API key'));
    } else {
      const current = () => isDefault && defaultProfile.model === chosen();
      const makeDefault = h('button', { class: 'primary', onclick: ui.attempt(async () => { await useProvider(ui, provider, chosen(), true); onChange(); }) }, 'Make default');
      const badge = h('span', { class: 'pill ok' }, '✓ default');
      const swap = () => fill(slot, recommended.model ? (current() ? badge : makeDefault) : h('button', { class: 'primary', onclick: () => ui.editProfile('', { provider: provider.id }) }, 'Choose model…'));
      const slot = h('span', {});
      modelField?.addEventListener('change', swap); swap();
      actions.push(slot,
        ui.can('run:ask') ? h('button', { title: 'Send one short request with the selected model', onclick: () => ui.startRun({ kind: 'ask', instruction: 'Reply with the single word: ready', input: '', provider: provider.id, model: chosen() }) }, 'Test') : null,
        recommended.model ? h('button', { onclick: () => ui.editProfile('', { provider: provider.id, model: chosen() }) }, 'Other model…') : null,
        provider.stored ? h('button', { class: 'danger', onclick: ui.attempt(async () => {
          if (!confirm(`Disconnect ${provider.name}? natlang deletes its stored ${provider.stored === 'oauth' ? 'sign-in' : 'key'}; profiles that use it stop working until you connect again.`)) return;
          await ui.api.models.disconnectProvider(provider.id); ui.toast(`Disconnected ${provider.name}`); onChange();
        }) }, 'Disconnect') : null);
    }
    return h('tr', { class: provider.connected ? 'connected' : '' },
      h('td', {}, h('strong', {}, provider.name), provider.oauth?.subscription ? h('span', { class: 'tag', title: provider.oauth.name }, 'subscription') : null),
      h('td', {}, status ? h('span', { class: 'pill ok', title: fromEnvironment(provider) ? 'Read from an environment variable; unset it to disconnect.' : 'Stored by natlang' }, status) :
        provider.problem ? h('span', { class: 'pill bad', title: provider.problem }, 'sign-in expired') : h('span', { class: 'muted small' }, '–')),
      h('td', { class: 'mono small' }, modelField ?? (recommended.model ? h('span', { class: provider.connected ? '' : 'muted' }, recommended.model) : h('span', { class: 'muted' }, provider.connected ? 'choose a model' : '–'))),
      h('td', {}, h('div', { class: 'row' }, actions)));
  };

  // First run: start from what the user already has.
  const quickStart = anyConnected ? null : h('div', { class: 'quick-start' },
    h('div', { class: 'small muted' }, 'Already pay for one of these? Sign in and natlang uses it, no API key needed.'),
    h('div', { class: 'choices' },
      SUBSCRIPTIONS.map(([id, label]) => byId.get(id)?.oauth ? h('button', { class: 'choice', onclick: () => connect(byId.get(id), 'oauth') },
        h('strong', {}, label), h('span', { class: 'small muted' }, `Runs ${byId.get(id).recommended.model ?? 'its models'}`)) : null),
      h('button', { class: 'choice', onclick: () => keyDialog(ui, providers, connect) }, h('strong', {}, 'I have an API key'), h('span', { class: 'small muted' }, `${providers.filter(provider => provider.apiKey?.prompts).length} services: Anthropic, OpenAI, OpenRouter, Google…`))));

  // Once something is connected, the table shows what is in use; the remaining providers wait behind one disclosure.
  const connectedFirst = anyConnected ? [...featured, ...others].filter(provider => provider.connected || provider.problem) : [...featured, ...others.filter(provider => provider.connected)];
  const spare = anyConnected ? featured.filter(provider => !connectedFirst.includes(provider)) : [];
  const listed = [...connectedFirst, ...spare];
  const head = () => h('thead', {}, h('tr', {}, h('th', {}, 'Provider'), h('th', {}, 'Connection'), h('th', {}, 'Model'), h('th', {})));
  const tbody = h('tbody', {}, connectedFirst.map(row));
  const more = spare.length ? h('details', { class: 'more-providers' }, h('summary', {}, `Connect another provider (${spare.length})`),
    h('div', { class: 'table-wrap' }, h('table', {}, head(), h('tbody', {}, spare.map(row))))) : null;
  const picker = h('select', { 'aria-label': 'Show another provider', onchange: () => {
    const provider = byId.get(picker.value); picker.value = '';
    if (!provider || listed.includes(provider)) return;
    listed.push(provider); const added = row(provider); tbody.append(added); added.scrollIntoView({ block: 'nearest' }); added.classList.add('flash');
  } }, h('option', { value: '' }, `More providers (${others.filter(provider => !provider.connected).length})…`), others.filter(provider => !provider.connected).map(provider => h('option', { value: provider.id }, provider.name)));
  const current = defaultProfile?.provider ? byId.get(defaultProfile.provider) : undefined;
  return h('section', { class: 'panel', id: 'providers' },
    h('div', { class: 'row', style: 'justify-content: space-between' }, h('h2', {}, 'Hosted models'), picker),
    current ? h('div', { class: 'small' }, `Runs use ${defaultProfile.model} through ${current.name} (profile ${config.defaultProfile}).`) :
      h('div', { class: 'small muted' }, 'Runs use the local model. Connect a provider below to run Claude, GPT or another hosted model instead; natlang picks its newest Luna or Haiku model for you.'),
    quickStart,
    h('div', { class: 'table-wrap' }, h('table', {}, head(), tbody)), more,
    h('div', { class: 'small muted' }, 'Keys in the providers\' usual environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, …) are picked up too. The same connections work in the CLI: natlang run --provider anthropic.'));
}
