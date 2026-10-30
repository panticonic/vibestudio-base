import { runFolderBash, type Platform } from "../vendor/workerd/natlang-workerd.js";

/**
 * The `bash` tool of folder calls: natlang's shell over the call's folder
 * (just-bash, pure JavaScript, so it runs in the isolate). The shell would
 * allow outbound network by default; a natlang call has no network of its own,
 * so it is switched off. The `python` and `sqlite3` commands report that Python
 * is unavailable: WebAssembly code generation is disabled in the isolate (also
 * through UNSAFE_EVAL), so there is no Python runner to put on the platform.
 */
export const folderBash: NonNullable<Platform["runFolderBash"]> = (folder, command, options) =>
  runFolderBash(folder, command, { ...options, network: false });
