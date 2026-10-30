/**
 * The target-neutral runtime specifier. Code that runs on any natlang runtime imports it; each build binds it to the
 * runtime it targets, as it binds `runtimeModule.specifiers` (the Node runtime under `natlang run` and the application
 * builds, the browser runtime in a browser build), so one source serves both hosts. In callable-folder modules it is
 * the natlang surface, as `@natlang/node` and `@natlang/browser` are.
 */
export declare const NEUTRAL_RUNTIME_SPECIFIER = "natlang:runtime";
