import type { ModelDriver } from '../runtime/runtime.js';
import type { ManagedModelSession } from './local-server.js';
/** A model session's turns, decisions and context window as a runtime model driver. */
export declare function sessionDriver(session: ManagedModelSession): ModelDriver;
