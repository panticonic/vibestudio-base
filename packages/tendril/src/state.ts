/**
 * Tendril shared-state operations. The same functions run in the page (local,
 * optimistic) and in TendrilDO (authoritative, last-writer-wins per path in
 * TendrilDO order). Ported from the standalone Tendriller `state.ts`.
 */
import type { StateOp } from "./protocol.js";

export type StatePath = string | readonly string[] | null | undefined;
export type StateRoot = Record<string, unknown>;

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

export function toPath(p?: StatePath): string[] {
  if (p == null || p === "") return [];
  if (Array.isArray(p)) return p.map(String);
  return String(p).split(".");
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function cloneJson<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

export function assertPathAllowed(path: readonly string[]): void {
  for (const key of path)
    if (FORBIDDEN.has(key)) throw new Error(`State key "${key}" is not allowed`);
}

function stripNulls(v: unknown): unknown {
  if (!isPlainObject(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v))
    if (x !== null && x !== undefined && !FORBIDDEN.has(k)) out[k] = stripNulls(x);
  return out;
}

/**
 * RFC 7396 merge patch → leaf ops against the current state: nested objects
 * recurse where the target is an object, otherwise the null-stripped subtree is
 * one `set`; `null` deletes (only if present); arrays and primitives are set whole.
 */
export function mergePatchToOps(
  state: unknown,
  patch: Record<string, unknown>,
  prefix: string[] = [],
  out: StateOp[] = [],
): StateOp[] {
  for (const k of Object.keys(patch)) {
    if (FORBIDDEN.has(k)) throw new Error(`State key "${k}" is not allowed`);
    const v = patch[k];
    const path = [...prefix, k];
    const cur = isPlainObject(state) ? state[k] : undefined;
    if (v === null) {
      if (cur !== undefined) out.push({ op: "delete", path });
    } else if (isPlainObject(v)) {
      if (isPlainObject(cur)) mergePatchToOps(cur, v, path, out);
      else out.push({ op: "set", path, value: stripNulls(v) });
    } else if (v !== undefined) out.push({ op: "set", path, value: v });
  }
  return out;
}

export function getPath(root: unknown, path: readonly string[]): unknown {
  let node = root;
  for (const k of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[k];
  }
  return node;
}

/** Apply one op in place where possible; returns the (possibly replaced) root. */
export function applyOp(root: StateRoot, op: StateOp): StateRoot {
  if (!isPlainObject(root)) root = {};
  const path = op.path;
  assertPathAllowed(path);
  if (path.length === 0) {
    if (op.op === "delete") return {};
    if (!isPlainObject(op.value))
      throw new Error("The state root must be an object");
    return cloneJson(op.value);
  }
  let node: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    if (!isPlainObject(node[k])) {
      if (op.op === "delete") return root;
      node[k] = {};
    }
    node = node[k] as Record<string, unknown>;
  }
  const last = path[path.length - 1]!;
  if (op.op === "delete" || op.value === undefined) delete node[last];
  else node[last] = cloneJson(op.value);
  return root;
}

export function applyOps(root: StateRoot, ops: readonly StateOp[]): StateRoot {
  for (const op of ops) root = applyOp(root, op);
  return root;
}

/**
 * Optimistic local view: the authoritative snapshot with the page's own
 * unacknowledged ops replayed on top, in send order. When the server's order
 * puts another writer after ours, the next authoritative snapshot wins.
 */
export function rebase(
  authoritative: StateRoot,
  pending: readonly { ops: readonly StateOp[] }[],
): StateRoot {
  let view = cloneJson(authoritative);
  for (const entry of pending) view = applyOps(view, entry.ops);
  return view;
}
