// The HTTP implementation of DashboardApi (types.d.ts): natlang's dashboard server (src/dashboard/server.ts). Each method is
// one server route; a host with another transport implements the same groups and the pages do not change.
import { messageSummary } from './presentation.js';

/** @param {{ baseUrl?: string, token: string, fetch?: typeof fetch }} options */
export function httpDashboardApi({ baseUrl = '', token, fetch: fetchImplementation = globalThis.fetch.bind(globalThis) }) {
  async function request(method, path, body, signal) {
    const response = await fetchImplementation(baseUrl + path, { method, headers: { 'x-natlang-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(messageSummary(value.error) || `The request failed (${response.status}).`), { status: response.status });
    return value;
  }
  const get = (path, signal) => request('GET', path, undefined, signal);
  const id = value => encodeURIComponent(value);
  const query = entries => new URLSearchParams(entries.filter(([, value]) => value !== undefined && value !== '' && value !== null)).toString();

  return {
    status: { get: () => get('/api/status') },
    models: {
      config: () => get('/api/config'),
      saveProfile: (name, profile, makeDefault) => request('PUT', `/api/profiles/${id(name)}`, { profile, makeDefault }),
      deleteProfile: name => request('DELETE', `/api/profiles/${id(name)}`),
      setDefault: name => request('POST', '/api/default', { profile: name }),
      stock: () => get('/api/stock'),
      downloadStock: stockId => request('POST', `/api/stock/${stockId}/download`),
      modelServer: () => get('/api/model-server'),
      loadModel: profile => request('POST', '/api/model-server', { profile }),
      unloadModel: () => request('DELETE', '/api/model-server'),
      providers: () => get('/api/providers'),
      providerModels: (provider, { refresh = false } = {}) => get(`/api/providers/${id(provider)}/models${refresh ? '?refresh=1' : ''}`),
      startLogin: (provider, type) => request('POST', `/api/providers/${id(provider)}/login`, { type }),
      login: login => get(`/api/logins/${login}`),
      answerLogin: (login, prompt, value) => request('POST', `/api/logins/${login}/answer`, { prompt, value }),
      cancelLogin: login => request('DELETE', `/api/logins/${login}`),
      disconnectProvider: provider => request('DELETE', `/api/providers/${id(provider)}/credential`),
      saveCredential: (credential, key) => request('PUT', `/api/credentials/${id(credential)}`, { key }),
      deleteCredential: credential => request('DELETE', `/api/credentials/${id(credential)}`),
    },
    programs: {
      list: () => get('/api/programs'),
      detail: path => get(`/api/programs/detail?path=${id(path)}`),
      create: spec => request('POST', '/api/programs', spec),
      model: (path, profile = '') => get(`/api/programs/model?path=${id(path)}&profile=${id(profile)}`),
      checkArguments: spec => request('POST', '/api/programs/arguments', spec),
      files: dir => get(`/api/files?dir=${id(dir)}`),
      source: path => get(`/api/programs/source?path=${id(path)}`),
      saveSource: spec => request('PUT', '/api/programs/source', spec),
      saveExample: spec => request('POST', '/api/programs/example', spec),
    },
    traces: {
      list: (filters = {}) => get(`/api/traces?${query(Object.entries({ limit: 150, ...filters }))}`),
      hot: by => get(`/api/traces/hot${by ? `?by=${by}` : ''}`),
      get: call => get(`/api/traces/${id(call)}`),
      events: call => get(`/api/traces/${id(call)}/events`),
      feedback: (call, feedback) => request('POST', `/api/traces/${id(call)}/feedback`, feedback),
      pin: (call, pinned = true) => request('POST', `/api/traces/${id(call)}/pin`, { pinned }),
      compilations: () => get('/api/compilations'),
    },
    system: {
      warm: () => get('/api/warm'),
      clearWarm: () => request('DELETE', '/api/warm'),
      saveStoreSettings: settings => request('PUT', '/api/store/settings', settings),
    },
    jobs: {
      list: () => get('/api/jobs'),
      start: spec => request('POST', '/api/jobs', spec),
      read: (job, offsets, signal) => get(`/api/jobs/${job}?stdout=${offsets.stdout}&stderr=${offsets.stderr}&live=${offsets.live}`, signal),
      input: (job, text) => request('POST', `/api/jobs/${job}/input`, { text }),
      stop: job => request('POST', `/api/jobs/${job}/stop`),
      remove: job => request('DELETE', `/api/jobs/${job}`),
    },
  };
}
