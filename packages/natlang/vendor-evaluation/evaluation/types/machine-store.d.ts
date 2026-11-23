import { CallStore } from './calls/store.js';
type Environment = Record<string, string | undefined>;
/** Where this machine's store lives: `$NATLANG_CALL_STORE`, else `~/.local/share/natlang/calls`; `off` disables it. */
export declare function machineStoreRoot(env?: Environment, home?: string): string | null;
/** The store at `root` with the environment's `NATLANG_SPECIALIZATION` as its mode override (read live, so it can change). */
export declare function openMachineStore(root: string, env?: Environment): CallStore;
/**
 * `NATLANG_EPISODE_CALL_STORE=machine` (debugging only): collector episodes record to the machine's store as before,
 * with specialization still off.
 */
export declare function episodeCallStoreShared(env?: Environment): boolean;
/** A fresh, empty episode store in a temporary directory, removed by `dispose`. */
export declare function createEpisodeCallStore(): {
    root: string;
    store: CallStore;
    dispose(): void;
};
export {};
