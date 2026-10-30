import { CallStore } from './calls/store.js';
type Environment = Record<string, string | undefined>;
/** Where this machine's store lives: `$NATLANG_CALL_STORE`, else `~/.local/share/natlang/calls`; `off` disables it. */
export declare function machineStoreRoot(env?: Environment, home?: string): string | null;
/** The store at `root` with the environment's `NATLANG_SPECIALIZATION` as its mode override (read live, so it can change). */
export declare function openMachineStore(root: string, env?: Environment): CallStore;
export {};
