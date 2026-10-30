import type { ValueRef } from './types.js';
/** A snapshot ready to store: the reference, and the JSON text when it is complete. */
export type Snapshot = {
    ref: ValueRef;
    text?: string;
};
/** Snapshot `value` for a record: exact JSON within `maxBytes`, else what can be said of it. */
export declare function snapshot(value: unknown, maxBytes: number, excluded?: boolean): Snapshot;
export declare const VALUE_CLASSES: Record<string, RegExp>;
/** Lowercase word tokens of a string, in first-seen order. */
export declare function tokens(text: string): string[];
/**
 * Typed features of a call's named inputs. Keys name a predicate family and the accessor path the guard would use:
 * `str:request` (short strings), `len:request`, `tok:request:refund`, `cls:request:url`, `num:limit`, `bool:dryRun`,
 * `null:note`, `arr:items` (length), `keys:options` (sorted key list).
 */
export declare function inputFeatures(inputs: Record<string, unknown>): Record<string, string | number | boolean>;
