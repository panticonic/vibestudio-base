import { type ItemRecord } from './loader.js';
import { type NatlangCallable } from './callable.js';
import type { CallableDefinition } from './kernel.js';
/** The built-in programs as records of a callable folder. */
export declare function builtinRecords(): Record<string, ItemRecord>;
/** A built-in natlang function by name, callable like any function loaded from a callable folder. */
export declare function builtin(name: string): NatlangCallable;
/** The kernel definition of a built-in, for the runtime's own calls (`invokeDefinition`). */
export declare function builtinDefinition(name: string): CallableDefinition;
/** The revision key a built-in's compilations and calls are stored under (what ran, as run); receipts of a built-in reviewer cite it. */
export declare function builtinDefinitionKey(name: string): string;
