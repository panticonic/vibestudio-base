import path from "node:path";
import type { RuntimeFs } from "./runtime-fs.js";
import { decodeUtf8 } from "./portable-bytes.js";

export interface AgentFileVisibility {
  isHidden(absolutePath: string): Promise<boolean>;
  filterVisible<T>(items: readonly T[], pathOf: (item: T) => string): Promise<T[]>;
}

/**
 * Keeps development-only skills and units out of the model-facing filesystem
 * tools.
 *
 * `agentVisible: false` is one visibility contract, not merely a catalog hint:
 * an agent cannot rediscover the same unit by listing, reading, or searching
 * the source tree. Other callers retain the ordinary workspace filesystem.
 *
 * A path is hidden when it is inside a directory that declares itself hidden —
 * `agentVisible: false` in a skill's `SKILL.md` frontmatter, or
 * `vibestudio.agentVisible: false` in a unit's `package.json`. The declaration
 * is resolved by walking up from the path rather than by scanning a fixed
 * root, because a workspace nests: an adopted project holds an entire second
 * workspace tree under `projects/`, so a scan rooted at `skills/` hid
 * `skills/x` while leaving `projects/base/skills/x` in plain view. Depth is
 * not what makes a unit private, so depth must not be what the contract reads.
 */
export function createAgentFileVisibility(cwd: string, fs: RuntimeFs): AgentFileVisibility {
  const root = path.resolve(cwd);
  /** Directory → does it declare itself hidden. One read per directory. */
  const declarations = new Map<string, Promise<boolean>>();

  const readOptional = async (file: string): Promise<string | Uint8Array | null> => {
    try {
      return await fs.readFile(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      // ENOTDIR arrives when the walk passes through a file path, which it
      // does for every ordinary read; both mean "no declaration here".
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw error;
    }
  };

  const declaresHidden = (directory: string): Promise<boolean> => {
    const cached = declarations.get(directory);
    if (cached) return cached;
    const resolved = (async () => {
      const skill = await readOptional(path.join(directory, "SKILL.md"));
      if (skill !== null && hasHiddenAgentFrontmatter(skill)) return true;
      const manifest = await readOptional(path.join(directory, "package.json"));
      return manifest !== null && hasHiddenManifestFlag(manifest);
    })();
    declarations.set(directory, resolved);
    return resolved;
  };

  const isHidden = async (absolutePath: string): Promise<boolean> => {
    let directory = path.resolve(absolutePath);
    for (;;) {
      if (await declaresHidden(directory)) return true;
      if (directory === root) return false;
      const parent = path.dirname(directory);
      // Stop at the filesystem root even when the path escapes `cwd`, so a
      // malformed path terminates instead of looping.
      if (parent === directory) return false;
      directory = parent;
    }
  };

  return {
    isHidden,
    async filterVisible<T>(items: readonly T[], pathOf: (item: T) => string): Promise<T[]> {
      const visibility = await Promise.all(
        items.map(async (item) => ({ item, hidden: await isHidden(pathOf(item)) }))
      );
      return visibility.filter(({ hidden }) => !hidden).map(({ item }) => item);
    },
  };
}

function text(source: string | Uint8Array): string {
  return typeof source === "string" ? source : decodeUtf8(source);
}

function hasHiddenAgentFrontmatter(source: string | Uint8Array): boolean {
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text(source))?.[1];
  return Boolean(frontmatter && /^agentVisible\s*:\s*false\s*(?:#.*)?$/imu.test(frontmatter));
}

/**
 * A unit declares its own visibility beside the rest of its `vibestudio`
 * manifest. Parsed rather than pattern-matched: a package.json is JSON, and a
 * regex over it would also match the string inside an unrelated field.
 */
function hasHiddenManifestFlag(source: string | Uint8Array): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(source));
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const manifest = (parsed as Record<string, unknown>)["vibestudio"];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;
  return (manifest as Record<string, unknown>)["agentVisible"] === false;
}
