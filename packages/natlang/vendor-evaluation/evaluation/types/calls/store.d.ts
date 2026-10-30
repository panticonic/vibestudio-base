import { CallStore, type StoreMedium } from './store-core.js';
import type { CallStoreSettings } from './types.js';
export { CallStore } from './store-core.js';
export type { AuditJob, CallFilter, CallSummary, FindingInput, FindingRow, HotDefinition, SavingsRow, SqlDatabase, StoreMedium } from './store-core.js';
/** Blobs as files under `blobs/`, settings in `config.json`, processes by PID within this boot and PID namespace. */
export declare class FileMedium implements StoreMedium {
    readonly root: string;
    private readonly mode?;
    readonly process: {
        pid: number;
        scope: string;
    };
    constructor(root: string, mode?: (() => string | undefined) | undefined);
    private blobPath;
    putBlob(hash: string, text: string): void;
    blob(hash: string): string | undefined;
    deleteBlob(hash: string): void;
    readConfig(): Partial<CallStoreSettings>;
    writeConfig(config: Partial<CallStoreSettings>): void;
    freeBytes(): number;
    databaseBytes(): number;
    modeOverride(): string | undefined;
    /**
     * A row's process is known gone when the row is from an earlier boot, or from this PID namespace and no process has
     * its PID. A row from another namespace (a container) is not: its PID means nothing here.
     */
    gone(pid: number | null, scope: string | null): boolean;
}
/** The store at `root` (one instance per root per process; `mode` is the specialization override of the first open). */
export declare function openCallStore(root: string, options?: {
    mode?: () => string | undefined;
}): CallStore;
