// The dashboard's embedding contract. A page is `mount(el, host) => dispose`; the host supplies a DashboardApi (the data
// the pages read and write, one group per capability) and a RunHost (starting and observing runs). Both are interfaces:
// `httpDashboardApi` and `httpRunHost` talk to natlang's own dashboard server, `inProcessRunHost` runs on an embedded
// runtime. A host may supply a subset: a page whose capabilities are absent is not offered (`availablePages`).

// ---- live events ----------------------------------------------------------------------------------------------------
/** The runtime's LiveEvent (src/runtime/runtime.ts) as the live file and in-process hosts deliver it, stamped with `at` (ms). */
export type LiveEvent = { at: number; taskId: string; callId: string; parentCallId: string | null; definitionId: string; name: string } & (
  | { type: 'call_start' }
  | { type: 'call_end'; outcome: string; detail: string }
  | { type: 'model_delta'; turn: number; delta: { type: 'text' | 'reasoning'; text: string } | { type: 'tool_call'; index: number; name?: string; arguments?: string } | { type: 'reset' } }
  | { type: 'trace'; event: Record<string, unknown> });

// ---- runs -----------------------------------------------------------------------------------------------------------
export type RunKind = 'run' | 'call' | 'ask' | 'test' | 'build' | 'setup' | 'runtime-build' | 'tune' | 'specialize';
export type RunStatus = 'running' | 'done' | 'failed' | 'stopped' | 'lost';
/** What to start. Paths are relative to the host's program root. */
export type RunSpec =
  | { kind: 'run'; path: string; target?: string; args?: string[]; profile?: string; stdin?: string; interactive?: boolean }
  | { kind: 'call'; function: string; inputs?: Record<string, unknown>; program?: string; profile?: string }
  | { kind: 'ask'; instruction: string; input?: string; returns?: string; profile?: string; provider?: string; model?: string; cwd?: string }
  | { kind: 'test'; path: string; profile?: string }
  | { kind: 'build'; path: string; warm?: boolean; profile?: string }
  | { kind: 'setup'; profile?: string }
  | { kind: 'runtime-build'; cuda?: boolean }
  | { kind: 'tune'; path: string }
  | { kind: 'specialize' };
export type RunRecord = {
  id: string; kind: RunKind; title: string; status: RunStatus; exitCode: number | null;
  startedAt: string; endedAt: string | null; interactive: boolean;
  /** The equivalent natlang command line (CLI hosts); the page offers "copy command" only when present. */
  argv?: string[]; cwd?: string; pid?: number | null;
  /** What "Run again" needs: run {path,target,args,profile}; call {path,inputs,profile,program}; ask {instruction,input,returns,profile}. */
  meta?: Record<string, unknown>;
};
/** Output a run produced since the observer last heard (the first chunk carries everything so far). */
export type RunChunk = {
  run: RunRecord; stdout: string; stderr: string; live: LiveEvent[];
  /** The run has ended and nothing more will be delivered. */
  drained: boolean;
};
export type RunObserver = {
  /** May be called before `watch` returns (a run that already has output delivers it at once). */
  update(chunk: RunChunk): void;
  /** The run cannot be followed (it does not exist); nothing more is delivered. */
  error?(error: Error): void;
  /** Whether the transport to the run is up (a polling host reports a failed poll here and keeps trying). */
  connection?(connected: boolean): void;
};
export interface RunHost {
  /** The kinds of run this host starts; pages offer only those. */
  readonly kinds: readonly RunKind[];
  /** Every known run, newest first. */
  list(): Promise<RunRecord[]>;
  start(spec: RunSpec): Promise<RunRecord>;
  /** Follow one run: its output so far, then what it produces. Returns the function that stops following. */
  watch(id: string, observer: RunObserver): () => void;
  /** `listener` gets the full list whenever a run starts, ends or is removed; `error` hears why a refresh failed. Returns the function that unsubscribes. */
  subscribe(listener: (runs: RunRecord[]) => void, error?: (error: Error) => void): () => void;
  /** Text for a run reading input (interactive runs only). */
  input(id: string, text: string): Promise<void>;
  stop(id: string): Promise<RunRecord>;
  remove(id: string): Promise<void>;
}
/** `inProcessRunHost(runtime, executors)`: how each kind runs on the embedded runtime. It runs inside `runtime.run`, so its natlang calls report to onLive. */
export type RunExecutors = Partial<Record<RunKind, (spec: RunSpec, io: { signal: AbortSignal; stdout(text: string): void; stderr(text: string): void }) => unknown>>;
export function inProcessRunHost(runtime: { run<T>(fn: () => T | Promise<T>, options?: { signal?: AbortSignal; onLive?: (event: any) => void; name?: string }): Promise<T> },
  executors: RunExecutors, options?: { now?: () => number }): RunHost;
export function httpRunHost(api: { jobs: JobsApi }): RunHost;
export function rerunSpec(run: RunRecord): RunSpec;

// ---- API groups -----------------------------------------------------------------------------------------------------
type Json = Record<string, any>;
export type StockModel = { id: string; label: string; bytes: number; installed: boolean; default: boolean; path: string | null;
  source: { repository: string; revision: string }; download: { received: number; total: number; done?: boolean; error?: string } | null };
export type Status = {
  version: string; node: string; root: string; configPath: string;
  model: { profile: string; kind: string; model?: string; error?: string; provider?: string; endpoint?: string; release?: StockModel };
  calls: { root: string; calls: number; bytes: number; settings: StoreSettings } | null;
  runtime: { selected: (Json & { fork: boolean }) | null; recommended: { version: string; build: number | string }; fork: { repository: string; commit: string }; candidates: Json[] };
  machine: { cpus: number; cpu: string | null; memory: number; free: number; platform: string };
  jobs: { running: number; total: number };
};
export type StoreSettings = { specialization: 'off' | 'shadow' | 'on' } & Json;
export type Profile = Json;
export type Provider = { id: string; name: string; stored: string | null; connected: { type: string; source: string | null } | null; problem: string | null;
  apiKey: { name: string; prompts: boolean } | null; oauth: { name: string; subscription: boolean; label: string | null } | null; models: number;
  recommended: { luna?: string; haiku?: string; model?: string } };
export type Login = { id: string; provider: string; type: 'oauth' | 'api_key'; state: 'running' | 'done' | 'failed' | 'cancelled'; events: Json[];
  prompt: { id: number; type: string; message: string; placeholder?: string; options?: { id: string; label: string; description?: string }[] } | null; error: string | null; startedAt: string };
export type ProgramSummary = { name: string; directory: string; description: string; targets: string[]; functions: number; warm: Json | null; builtAt: string | null } & Json;

export interface StatusApi { get(): Promise<Status>; }
export interface ModelsApi {
  config(): Promise<{ path: string; defaultProfile: string | null; profiles: Record<string, { profile: Profile; kind?: string; model?: string; error?: string }>;
    credentials: { id: string; type: string }[]; stock: StockModel[]; builtinDefault: { kind: string; model: string } }>;
  saveProfile(name: string, profile: Profile, makeDefault?: boolean): Promise<{ ok: true }>;
  deleteProfile(name: string): Promise<{ ok: true }>;
  setDefault(name: string | null): Promise<{ ok: true }>;
  stock(): Promise<StockModel[]>;
  downloadStock(id: string): Promise<{ started: boolean; download: Json }>;
  /** The model the host keeps loaded for every natlang command on its machine. */
  modelServer(): Promise<{ running: boolean; profile?: string; server?: Json; other?: Json; log?: string[] }>;
  loadModel(profile?: string): Promise<Json>;
  unloadModel(): Promise<Json>;
  providers(): Promise<Provider[]>;
  providerModels(id: string, options?: { refresh?: boolean }): Promise<{ id: string; name: string; reasoning: boolean | null; contextWindow: number | null; recommended: boolean; family: 'luna' | 'haiku' | null }[]>;
  startLogin(provider: string, type: 'oauth' | 'api_key'): Promise<Login>;
  login(id: string): Promise<Login>;
  answerLogin(id: string, prompt: number, value: string): Promise<Login>;
  cancelLogin(id: string): Promise<Login>;
  disconnectProvider(id: string): Promise<{ ok: true }>;
  saveCredential(id: string, key: string): Promise<{ ok: true }>;
  deleteCredential(id: string): Promise<{ ok: true }>;
}
export interface ProgramsApi {
  list(): Promise<ProgramSummary[]>;
  detail(path: string): Promise<Json>;
  create(spec: { name: string; instruction?: string; input?: string; returns?: string; profile?: string }): Promise<{ directory: string }>;
  /** The model a program would use under `profile` and what its first run needs. */
  model(path: string, profile?: string): Promise<{ model: string; kind: string; detail: string }>;
  /** Check a draft of a target's arguments exactly as the CLI reads them. */
  checkArguments(spec: { path: string; target: string; args: string[] }): Promise<{ problems: Json[] }>;
  files(dir: string): Promise<{ dir: string; entries: { name: string; kind: 'folder' | 'file' }[]; missing?: boolean }>;
  source(path: string): Promise<{ path: string; text: string }>;
  saveSource(spec: { path: string; text: string; previous: string }): Promise<{ path: string }>;
  saveExample(spec: { path: string; example: { function: string; inputs: Json; expected: unknown } }): Promise<{ examples: number }>;
}
export interface TracesApi {
  /** Recorded calls; rejects with `status` 409 when recording is off. */
  list(filters?: { definition?: string; outcome?: string; program?: string; executor?: string; limit?: number }): Promise<Json[]>;
  hot(by?: 'calls' | 'tokens' | 'wall_ms'): Promise<Json[]>;
  get(id: string): Promise<Json>;
  events(id: string): Promise<Json[]>;
  feedback(id: string, feedback: { verdict: 'good' | 'bad' | 'fix'; expected?: unknown }): Promise<{ message: string }>;
  pin(id: string, pinned?: boolean): Promise<{ ok: true }>;
  compilations(): Promise<Json[]>;
}
export interface SystemApi {
  /** Warm prompt openings the managed model server saved. */
  warm(): Promise<Json[]>;
  clearWarm(): Promise<{ ok: true }>;
  saveStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings>;
}
/** The server's own job routes: `httpRunHost` is built on them; pages use the RunHost, not these. */
export interface JobsApi {
  list(): Promise<RunRecord[]>;
  start(spec: RunSpec): Promise<RunRecord>;
  read(id: string, offsets: { stdout: number; stderr: number; live: number }, signal?: AbortSignal):
    Promise<{ job: RunRecord; stdout: { text: string; offset: number }; stderr: { text: string; offset: number }; live: { text: string; offset: number } }>;
  input(id: string, text: string): Promise<{ ok: true }>;
  stop(id: string): Promise<RunRecord>;
  remove(id: string): Promise<{ ok: true }>;
}
/** Every request rejects with an Error whose message is the server's explanation and whose `status` is the HTTP status. */
export interface DashboardApi {
  status?: StatusApi; models?: ModelsApi; programs?: ProgramsApi; traces?: TracesApi; system?: SystemApi; jobs?: JobsApi;
}
export function httpDashboardApi(options: { baseUrl?: string; token: string; fetch?: typeof fetch }): Required<DashboardApi>;

// ---- pages ----------------------------------------------------------------------------------------------------------
/** What a host supplies to mount a page. */
export type DashboardHost = {
  api: DashboardApi;
  runs?: RunHost;
  /** Go to `page` or `page-ARG` (a program directory, a run id, `call-ID` for a trace): mount that page again, even when it is the current one. */
  navigate(route: string): void;
  toast(text: unknown, error?: boolean): void;
  /** The sub-route of this page (the part after `page-`). */
  arg?: string;
  /** The link target for a route; default `#route`. */
  href?(route: string): string;
  /** Called after something the host's status display shows has changed. */
  refreshStatus?(): void;
  /** DOM builder; default builds elements of the mount element's document. */
  h?: (tag: string, attrs?: Record<string, unknown> | null, ...children: unknown[]) => HTMLElement;
};
/** A page module: draw into `el`, return the function that disposes everything the page started. */
export type PageMount = (el: HTMLElement, host: DashboardHost) => () => void;
export type PageModule = { id: string; title: string; requires: readonly string[]; runKinds: readonly RunKind[]; mount: PageMount };
export const pages: readonly PageModule[];
/** The pages `host` can support, in navigation order. */
export function availablePages(host: Pick<DashboardHost, 'api' | 'runs'>): PageModule[];
