import type { CallStoreLike } from '../calls/recorder.js';
import { type Platform } from '../runtime/platform.js';
import type { Realm } from '../native/realm.js';
export type WorkerdPlatformOptions = {
    /** Where eval code and compiled modules run. */
    realm: Realm;
    /** The call record store of runtimes that name none; absent: calls are not recorded. */
    callStore?: () => CallStoreLike | undefined;
    /** Platform modules callable-folder code can import. */
    builtinModules?: Platform['builtinModules'];
};
/** A platform for runtimes in a workerd isolate; module state belongs to the value returned, so keep one per realm. */
export declare function workerdPlatform(options: WorkerdPlatformOptions): Platform;
