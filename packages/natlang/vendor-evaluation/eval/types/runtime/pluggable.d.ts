export type PluggableMode = 'crisp' | 'nl' | 'shadow';
/**
 * Older spellings of `nl` that settings and configs already use. Deprecated: write `nl`. They are accepted everywhere a
 * mode is, so existing configs keep working; new settings use the three modes only.
 */
export type LegacyPluggableMode = 'natlang' | 'natural-language';
/** What a setting may hold: a mode, a deprecated spelling, or nothing (the part's default applies). */
export type PluggableSetting = PluggableMode | LegacyPluggableMode | undefined;
export type PluggableImplementations<A extends unknown[], R> = {
    crisp: (...args: A) => R | Promise<R>;
    nl: (...args: A) => R | Promise<R>;
};
export type PluggableOptions<R> = {
    /** The mode when the setting is absent. Default `nl`. */
    default?: PluggableMode;
    /** Names the part in the trace. */
    name?: string;
    /** In shadow mode, the side whose result is returned; the other is only compared. Default `nl`. */
    serve?: 'crisp' | 'nl';
    /** Whether two results agree. Default: equal canonical values. */
    same?: (crisp: R, nl: R) => boolean;
};
/** The mode a setting names: `crisp`, `nl` or `shadow`; `natlang` and `natural-language` (deprecated) mean `nl`; absent means `fallback`. */
export declare function pluggableMode(setting: unknown, fallback?: PluggableMode): PluggableMode;
/**
 * The part as one function. `crisp` and `nl` run that implementation alone. `shadow` runs both on the same arguments
 * (concurrently), returns the served side's result, and records a `pluggable_shadow` trace event with both results and
 * `agree`, as `refinement_shadow` does for refinements. A failure of the side that is not served is recorded as a
 * disagreement and does not fail the call.
 */
export declare function pluggable<A extends unknown[], R>(implementations: PluggableImplementations<A, R>, setting: PluggableSetting, options?: PluggableOptions<R>): (...args: A) => Promise<R>;
