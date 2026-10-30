/**
 * The self-contained workerd bundle's entry point (scripts/vendor-build.mjs, target `workerd`): everything the core
 * has, plus the folder-call `bash` tool, which `just-bash` makes pure JavaScript and so able to run in an isolate. The
 * build replaces the Python runner with one that says why Python is unavailable there (WebAssembly code generation is
 * disabled in workerd), so the `python` and `sqlite3` commands of that shell report it instead of loading an interpreter.
 * A host puts `runFolderBash` on its platform value (`Platform.runFolderBash`).
 */
export * from './index.js';
export { runFolderBash } from '../native/folder-shell.js';
export type { FolderBashOptions, FolderBashResult } from '../native/folder-shell.js';
