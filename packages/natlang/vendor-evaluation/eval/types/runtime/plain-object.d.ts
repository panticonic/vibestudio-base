/**
 * A plain object (`{...}` or `Object.create(null)`) from any realm: callable-folder modules, the eval sandbox, workers
 * and browser compartments each bring their own `Object.prototype`, so an identity test against this realm's misreads
 * their records as opaque values. Arrays, class instances, dates and other built-ins are not plain.
 */
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
