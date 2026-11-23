import type { LlamaHost } from './host.js';
export type SharedServer = {
    schema: 'natlang.shared-model-server/2';
    key: string;
    /** The supervisor's pid: stopping it stops the server. */
    pid: number;
    serverPid: number;
    endpoint: string;
    modelSha256: string;
    runtimeBuild: number | null;
    /** The binary's `b<build>g<commit>` label (llama/models.ts runtimeLabel). */
    runtime: string | null;
    slots: number;
    contextPerSlot: number;
    model: string;
    startedAt: string;
    /** The server saves and restores warm prompt openings (it was started with their --slot-save-path). */
    warm: boolean;
    /** Stop after this many idle seconds without a lease. */
    idleSeconds: number;
    /** The tuned adapter artifact IDs and native state IDs it loaded, in load order (adapter index order). */
    adapters: string[];
    states: string[];
};
/** What the supervisor runs and publishes (the record without its pids and start time). */
export type SupervisedServer = {
    command: string;
    args: readonly string[];
    endpoint: string;
    directory: string;
    key: string;
    startTimeoutMs: number;
    record: Omit<SharedServer, 'schema' | 'key' | 'pid' | 'serverPid' | 'startedAt'>;
};
export declare const sharedServersDirectory: (host: LlamaHost) => string;
export declare const sharingEnabled: (environment: NodeJS.ProcessEnv) => boolean;
export declare const sharedIdleSeconds: (environment: NodeJS.ProcessEnv) => number;
/** Everything that makes two servers interchangeable. The slot count is the first starter's (planned from free memory)
 * unless the settings fix it, so it is part of the key only when configured. */
export declare function sharedServerKey(identity: Record<string, unknown>): string;
export declare const alive: (pid: number) => boolean;
export declare const sharedPaths: (directory: string, key: string) => {
    record: string;
    lock: string;
    failed: string;
    log: string;
    leases: string;
};
export declare function readSharedServerAt(path: string): SharedServer | undefined;
export declare function writeSharedServer(directory: string, record: SharedServer): void;
/** Live leases of a server (a dead holder's lease is removed). */
export declare function liveLeases(directory: string, key: string): number;
/** The published servers whose supervisor is alive (a dead one's record is removed). */
export declare function listSharedServers(host: LlamaHost): SharedServer[];
export type SharedLease = {
    server: SharedServer;
    started: boolean;
    release(): void;
};
/**
 * Use the shared server for `key`: the published one, or, when none runs, start it (this process takes the start lock
 * and asks the host to supervise `spec()`, which may first download the model) or wait while another process starts
 * it. Resolves once it answers, holding a lease; null when none runs and this host cannot start one. Throws when the
 * start fails, with the server's output. The supervisor bounds the server's own startup (`startTimeoutMs`).
 */
export declare function acquireSharedServer(host: LlamaHost, key: string, spec: () => Promise<SupervisedServer>, options?: {
    signal?: AbortSignal;
}): Promise<SharedLease | null>;
/** Stop a shared server now (its supervisor stops llama-server and removes its record). */
export declare function stopSharedServer(server: SharedServer): void;
