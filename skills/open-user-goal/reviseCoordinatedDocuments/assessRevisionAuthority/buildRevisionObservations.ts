import type { RevisionScope } from "../types.js";

export default function buildRevisionObservations(scope: RevisionScope): string[] {
  return scope.files.map(({ path, version, text }) => path + " @ " + version + "\n" + text);
}
