/**
 * Blobstore client — the portable runtime binding for the per-workspace
 * content-addressable blob store, shared by panel · worker · eval.
 *
 * This is the curated client behind the `blobstore` binding / `import { blobstore }
 * from "@workspace/runtime"`. Most methods are thin typed wrappers over the
 * `blobstore` RPC service (`@vibestudio/service-schemas/blobstore`). The
 * runtime adds byte conveniences (`putBytes`/`getBytes`) that losslessly bridge
 * the wire's base64 representation, and `materializeTree` composes read-only
 * CAS calls with the caller-scoped RuntimeFs. The raw host materializer remains
 * admin-only because it accepts an absolute host path; userland never receives
 * that authority.
 *
 * Read/write methods (`putText`/`putBase64`/`putBytes`/`getText`/`getRange`/`grep`/…) admit
 * `panel`/`worker`/`do` callers (BLOBSTORE_READ_POLICY), so persisting a
 * screenshot or large artifact from agent eval works. Admin methods
 * (`delete`/`list`) are shell/server-only and reject other caller kinds at the
 * service policy gate — same as any other namespaced service method.
 */

import { base64ToBytes, bytesToBase64, type RpcCaller } from "@vibestudio/rpc";
import { type TypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { createLazyTypedServiceClient } from "@vibestudio/shared/lazyTypedServiceClient";
import type { blobstoreMethods } from "@vibestudio/service-schemas/blobstore";
import { BLOBSTORE_METHOD_NAMES } from "@vibestudio/service-schemas/clients/generated/runtimeClientMethods";
import type { RuntimeFs } from "../types.js";
import { currentJournal, type OperationJournalEntry } from "./journal.js";

export const BLOBSTORE_MEMBERS = [
  ...BLOBSTORE_METHOD_NAMES,
  "putBytes",
  "getBytes",
  "readText",
  "putPathTree",
] as const;

type BlobstoreServiceClient = TypedServiceClient<typeof blobstoreMethods>;
type PutBlobResult = Awaited<ReturnType<BlobstoreServiceClient["putBase64"]>>;

export type BlobstoreBytes = Uint8Array | ArrayBuffer;

type ReadText = (digest: string) => Promise<string | null>;
type GetBytes = (digest: string) => Promise<Uint8Array | null>;

type PutTreeResult = Awaited<ReturnType<BlobstoreServiceClient["putTree"]>>;
type TreeEntry = Parameters<BlobstoreServiceClient["putTree"]>[0][number];
type FileTreeEntry = Extract<TreeEntry, { kind: "file" }>;

/**
 * One file of a `putPathTree` input: a string is UTF-8 text, bytes are stored
 * as-is, and `{ digest }` (for example a `putText`/`putBytes` result) references
 * a blob that is already stored. `mode` defaults to a regular file.
 */
export type PathTreeFile =
  | string
  | BlobstoreBytes
  | { digest: string; mode?: FileTreeEntry["mode"] };

type PutPathTree = (
  files: Record<string, PathTreeFile>,
  opts?: Parameters<BlobstoreServiceClient["putTree"]>[1],
) => Promise<PutTreeResult>;

type MaterializeTree = (
  treeRef: string,
  outDir: string,
  opts?: { link?: boolean },
) => Promise<{ written: number; unchanged: number }>;

export type BlobstoreClient = Omit<
  BlobstoreServiceClient,
  "materializeTree"
> & {
  /** Runtime-only byte convenience; the wire service remains base64-only. */
  putBytes(bytes: BlobstoreBytes): Promise<PutBlobResult>;
  /** Runtime-only byte convenience; decodes the wire service's base64 representation. */
  getBytes: GetBytes;
  /** Readable alias for `getText`, available uniformly in panel, worker, and eval. */
  readText: ReadText;
  /** Copy a CAS tree into this runtime's context-scoped filesystem. */
  materializeTree: MaterializeTree;
  /**
   * Store a nested file tree from `{ "a/b.txt": text | bytes | { digest } }`.
   * Stores the file blobs, then every directory bottom-up with `putTree`, and
   * returns the root's `putTree` result (`opts` applies to the root only).
   */
  putPathTree: PutPathTree;
};

export function createBlobstoreClient(
  rpc: RpcCaller,
  fs?: RuntimeFs,
  recordOperation: (entry: OperationJournalEntry) => void = (entry) =>
    currentJournal()?.append(entry),
): BlobstoreClient {
  const serviceClient = createLazyTypedServiceClient(
    "blobstore",
    BLOBSTORE_METHOD_NAMES,
    async () =>
      (await import("@vibestudio/service-schemas/blobstore")).blobstoreMethods,
    (svc, method, args) => rpc.call("main", `${svc}.${method}`, args),
  );

  const putBytes = async (...args: unknown[]): Promise<PutBlobResult> => {
    if (args.length !== 1) {
      throw new TypeError(
        `blobstore.putBytes accepts exactly one Uint8Array or ArrayBuffer argument; ` +
          `MIME metadata is not stored, so return it alongside the digest instead (received ${args.length} arguments).`,
      );
    }

    const input = args[0];
    if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) {
      throw new TypeError(
        "blobstore.putBytes expects a Uint8Array or ArrayBuffer argument.",
      );
    }

    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
    return serviceClient.putBase64(bytesToBase64(bytes));
  };

  const readText: ReadText = (digest) => serviceClient.getText(digest);
  const getBytes: GetBytes = async (digest) => {
    const base64 = await serviceClient.getBase64(digest);
    return base64 === null ? null : base64ToBytes(base64);
  };

  const materializeTree: MaterializeTree = async (treeRef, outDir, opts) => {
    if (!fs) {
      throw new Error(
        "blobstore.materializeTree requires a hosted runtime filesystem; use getTree/listTree from a transport-only client.",
      );
    }
    if (!outDir || outDir.includes("\0")) {
      throw new TypeError(
        "blobstore.materializeTree requires a non-empty output directory.",
      );
    }
    if (opts?.link) {
      throw new Error(
        "blobstore.materializeTree link mode is not supported by the context-scoped runtime filesystem; omit link to copy the tree safely.",
      );
    }

    const cleanRoot = outDir.replace(/\/+$/u, "") || "/";
    await fs.mkdir(cleanRoot, { recursive: true });
    let written = 0;
    let unchanged = 0;

    let cursor: string | undefined;
    let expectedBasis:
      | { ref: string; rootTreeHash: string; prefix: string; order: string }
      | undefined;
    const seenCursors = new Set<string>();
    for (;;) {
      const page = await serviceClient.listTree(treeRef, {
        limit: 1_000,
        ...(cursor ? { cursor } : {}),
      });
      if (page === null) throw new Error(`Tree object missing: ${treeRef}`);
      if (!expectedBasis) {
        expectedBasis = page.basis;
        if (page.basis.ref !== treeRef || page.basis.prefix !== "") {
          throw new Error(
            "blobstore.listTree returned a basis different from materializeTree's request",
          );
        }
      } else if (
        page.basis.ref !== expectedBasis.ref ||
        page.basis.rootTreeHash !== expectedBasis.rootTreeHash ||
        page.basis.prefix !== expectedBasis.prefix ||
        page.basis.order !== expectedBasis.order
      ) {
        throw new Error(
          "blobstore.listTree changed basis while materializing a tree",
        );
      }

      for (const entry of page.entries) {
        const path = safeMaterializedPath(cleanRoot, entry.path);
        if (entry.kind === "dir") {
          await fs.mkdir(path, { recursive: true });
          continue;
        }

        const bytesBase64 = await serviceClient.getBase64(entry.contentHash);
        if (bytesBase64 === null) {
          throw new Error(
            `Tree blob missing: ${entry.contentHash} (${entry.path})`,
          );
        }
        const bytes = base64ToBytes(bytesBase64);
        await fs.mkdir(parentPath(path), { recursive: true });

        if (await fs.exists(path)) {
          const current = await fs.readFile(path);
          if (bytesEqual(current as Uint8Array, bytes)) {
            // Content equality does not imply metadata equality. Re-apply the
            // tree's Git mode so repeated materialization repairs executable bits.
            await fs.chmod(path, entry.mode);
            unchanged += 1;
            continue;
          }
        }

        await fs.writeFile(path, bytes);
        await fs.chmod(path, entry.mode);
        written += 1;
      }

      if (page.completeness === "complete") break;
      if (seenCursors.has(page.nextCursor)) {
        throw new Error("blobstore.listTree repeated a continuation cursor");
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }

    recordOperation({
      type: "blob-tree.observation",
      receipt: {
        protocol: "blob-tree-observation.v1",
        method: "materializeTree",
        ref: treeRef,
        written,
        unchanged,
      },
    });
    return { written, unchanged };
  };

  const putPathTree: PutPathTree = async (files, opts) => {
    type Dir = { files: Map<string, PathTreeFile>; dirs: Map<string, Dir> };
    const newDir = (): Dir => ({ files: new Map(), dirs: new Map() });
    const root = newDir();
    for (const [path, file] of Object.entries(files)) {
      const segments = path.split("/");
      if (
        segments.some(
          (segment) =>
            segment === "" ||
            segment === "." ||
            segment === ".." ||
            segment.includes("\0"),
        )
      ) {
        throw new TypeError(
          `blobstore.putPathTree requires relative file paths without empty, "." or ".." segments (received ${JSON.stringify(path)}).`,
        );
      }
      const name = segments.pop()!;
      let dir = root;
      for (const segment of segments) {
        if (dir.files.has(segment)) {
          throw new TypeError(
            `blobstore.putPathTree path ${JSON.stringify(path)} nests under a file.`,
          );
        }
        let child = dir.dirs.get(segment);
        if (!child) {
          child = newDir();
          dir.dirs.set(segment, child);
        }
        dir = child;
      }
      if (dir.dirs.has(name)) {
        throw new TypeError(
          `blobstore.putPathTree path ${JSON.stringify(path)} is both a file and a directory.`,
        );
      }
      dir.files.set(name, file);
    }

    const storeFile = async (
      name: string,
      file: PathTreeFile,
    ): Promise<FileTreeEntry> => {
      if (typeof file === "string") {
        const { digest } = await serviceClient.putText(file);
        return { name, kind: "file", contentHash: digest, mode: 33188 };
      }
      if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
        const { digest } = await putBytes(file);
        return { name, kind: "file", contentHash: digest, mode: 33188 };
      }
      if (typeof (file as { digest?: unknown } | null)?.digest !== "string") {
        throw new TypeError(
          `blobstore.putPathTree file ${JSON.stringify(name)} must be a string, Uint8Array, ArrayBuffer, or { digest }.`,
        );
      }
      return {
        name,
        kind: "file",
        contentHash: file.digest,
        mode: file.mode ?? 33188,
      };
    };

    const storeDir = async (
      dir: Dir,
      treeOpts: Parameters<PutPathTree>[1],
    ): Promise<PutTreeResult> => {
      const entries: TreeEntry[] = await Promise.all([
        ...[...dir.files].map(([name, file]) => storeFile(name, file)),
        ...[...dir.dirs].map(async ([name, child]): Promise<TreeEntry> => {
          const { treeHash } = await storeDir(child, {});
          return { name, kind: "dir", childHash: treeHash };
        }),
      ]);
      return serviceClient.putTree(entries, treeOpts ?? {});
    };

    return storeDir(root, opts);
  };

  return Object.assign(serviceClient, {
    putBytes,
    getBytes,
    readText,
    materializeTree,
    putPathTree,
  }) as BlobstoreClient;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function safeMaterializedPath(root: string, relativePath: string): string {
  const segments = relativePath.split("/");
  if (
    relativePath.startsWith("/") ||
    relativePath.includes("\0") ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Unsafe tree path: ${JSON.stringify(relativePath)}`);
  }
  return root === "/" ? `/${relativePath}` : `${root}/${relativePath}`;
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf("/");
  if (slash < 0) return ".";
  return slash === 0 ? "/" : path.slice(0, slash);
}
