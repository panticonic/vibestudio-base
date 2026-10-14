import type { GitClient, GitCommitTreeEntry } from "@vibestudio/git";
import { vi } from "vitest";

/** Keep full-tree and lazy-index test doubles backed by the same immutable
 * fixture. Production snapshot readers may choose either view without letting
 * a fake object id escape into isomorphic-git. */
export function mirrorCommitTreeIndex(git: GitClient): void {
  const readCommitTree = git.readCommitTree.bind(git);
  vi.spyOn(git, "readCommitTreeIndex").mockImplementation(async (dir, commit) => {
    const entries = await readCommitTree(dir, commit);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    return {
      entries: entries.map(({ path, type, mode, oid }) => ({ path, type, mode, oid })),
      async readFile(filePath) {
        const entry: GitCommitTreeEntry | undefined = byPath.get(filePath);
        return entry?.type === "blob" ? new Uint8Array(entry.bytes) : null;
      },
    };
  });
}
