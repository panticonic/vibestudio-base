/** Hash domains are versioned; object order is irrelevant, array order remains significant. */
export { canonical } from '../native/canonical-data.js';
export { fingerprint } from '../native/content-identity.js';
export declare function componentKey(program: string, path: string, site?: string): string;
export declare function immutable<T>(value: T): T;
export declare function cloneData<T>(value: T): T;
