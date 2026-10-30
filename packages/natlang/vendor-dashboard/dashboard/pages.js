// The dashboard's pages, in navigation order. Each module exports `id`, `title`, `requires` (the DashboardApi groups and
// `runs` it reads), `runKinds` (the kinds of run it starts) and `mount(el, host) => dispose` (types.d.ts).
import * as overview from './pages/overview.js';
import * as programs from './pages/programs.js';
import * as runs from './pages/runs.js';
import * as traces from './pages/traces.js';
import * as playground from './pages/playground.js';
import * as models from './pages/models.js';
import * as system from './pages/system.js';
import { can } from './common.js';

export const pages = [overview, programs, runs, traces, playground, models, system];

/** The pages `host` ({ api, runs }) can support: a page whose capabilities are absent is not offered. */
export function availablePages(host) {
  return pages.filter(page => [...page.requires, ...page.runKinds.map(kind => `run:${kind}`)].every(capability => can(host, capability)));
}

export { httpDashboardApi } from './api.js';
export { httpRunHost, inProcessRunHost, rerunSpec } from './run-host.js';
