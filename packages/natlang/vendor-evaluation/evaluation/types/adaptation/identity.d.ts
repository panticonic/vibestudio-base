/** Hash domains are versioned; object order is irrelevant, array order remains significant. */
export { canonical } from '../native/canonical-data.js';
export declare function fingerprint(value: unknown, domain?: string): string;
export declare function componentKey(program: string, path: string, site?: string): string;
export declare function immutable<T>(value: T): T;
export declare function cloneData<T>(value: T): T;
