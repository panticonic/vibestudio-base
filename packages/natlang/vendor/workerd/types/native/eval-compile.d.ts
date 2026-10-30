export type EvalCompileOptions = {
    /** The code is the body of a function (it may `return`) rather than a program whose completion value is its result. */
    body: boolean;
    /** The body may `await` (an async function). */
    asyncBody?: boolean;
    /**
     * Package imports are lowered to `__natlang_import(specifier)` calls (static and dynamic); this validates each
     * specifier and throws for one the eval may not import. Without it imports are left as written and fail to run.
     */
    imports?: (specifier: string) => void;
    /**
     * `await x` becomes `(await __natlang_bindAwait(x))()`, which restores the natlang task after the await. For platforms
     * whose context store cannot follow promises (browsers); the realm must bind `__natlang_bindAwait`.
     */
    restoreAfterAwait?: boolean;
};
/** The JavaScript for `code`. A body is a function declaration; call `evalRealmBody` for what a realm runs. */
export declare function compileEval(code: string, options: EvalCompileOptions): string;
/**
 * The strict-mode function body a realm runs for compiled eval code: the prelude, the code, and its result (the body
 * function's, or the program's completion value). The names a realm binds around it are `self`, `__live`,
 * `__natlang_import`, `console` and, with `restoreAfterAwait`, `__natlang_bindAwait` (see `EVAL_PARAMETERS`).
 */
export declare function evalRealmBody(compiled: string, body: boolean): string;
