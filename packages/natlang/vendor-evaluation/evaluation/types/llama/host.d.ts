/**
 * What the managed llama.cpp machinery asks of its host. Everything that touches the machine from outside this package
 * is here, so a host decides it: how processes start, where files live, how the network is reached, where output goes.
 * The natlang CLI binds Node's (llama/node.ts); Vibestudio's local-models extension binds its own supervisor's spawn,
 * its roots and its authenticated fetch.
 */
/** A running llama-server (or any child) as the package sees it. */
export type LlamaProcess = {
    readonly pid: number | undefined;
    /** True once the process has exited, or could not be started. */
    hasExited(): boolean;
    /** Resolves when the process has exited or could not be started; never rejects. */
    readonly exited: Promise<void>;
    kill(signal?: NodeJS.Signals): void;
};
/** The result of running a short command to completion (version and help probes, archive extraction, build steps). */
export type LlamaRunResult = {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
};
export type LlamaProcesses = {
    /** Start a long-running process. `onStderr` receives its error output (the tail is kept for startup failures);
     * `onError` a failure to start it. `env` is its environment. */
    spawn(command: string, args: readonly string[], options: {
        env?: NodeJS.ProcessEnv;
        onStderr?(text: string): void;
        onError?(error: Error): void;
    }): LlamaProcess;
    /** Run a command to completion. `output: 'host'` lets the command's output reach the host's own (build steps);
     * the default captures it. `timeoutMs` bounds a probe that must not hang the caller. */
    run(command: string, args: readonly string[], options?: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        output?: 'capture' | 'host';
        timeoutMs?: number;
    }): LlamaRunResult;
    /** A free loopback TCP port for a server to listen on. */
    freePort(): Promise<number>;
};
/** The directories the package reads and writes. */
export type LlamaDirectories = {
    /** Managed llama.cpp runtimes: downloaded releases and fork builds. */
    runtime: string;
    /** Downloaded stock GGUF files. */
    models: string;
    /** Content hashes of configured GGUF files (keyed by path, size and mtime). */
    modelHashes: string;
    /** Saved slot states of warm prompt openings (the server's `--slot-save-path`). */
    warmPrefixes: string;
    /** Records of a server kept loaded for other processes (shared-server record). */
    state: string;
    /** A working checkout's own models directory, searched first for a stock GGUF (null: none). */
    checkoutModels: string | null;
    /** Directories searched, in order, for a stock model's chat template file. */
    templates: readonly string[];
};
export type LlamaLog = {
    write(text: string): unknown;
    isTTY?: boolean;
};
export type LlamaHost = {
    /**
     * The settings the package reads (`NATLANG_MODEL_PATH`, `NATLANG_TEMPLATE`, `NATLANG_LLAMA_SERVER`,
     * `NATLANG_WARM_PREFIXES`, `NATLANG_SHARED_SERVER`, `NATLANG_MODEL_START_TIMEOUT_MS`, `NATLANG_MODEL`,
     * `NATLANG_MODEL_KV_BYTES_PER_TOKEN`, `NATLANG_MODEL_MEMORY_BUDGET_MIB`) and the environment child processes run in
     * (`PATH`, `PATHEXT`).
     */
    environment: NodeJS.ProcessEnv;
    directories: LlamaDirectories;
    processes: LlamaProcesses;
    /** Network access: model and runtime downloads, health checks, slot and warm-state requests. */
    fetch: typeof fetch;
    /** Progress and notices ("starting managed model ...", download progress). */
    log: LlamaLog;
};
