import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  applyCompositeSqliteMigrationsInTransaction,
  CompositeSqliteStorage,
  nativeSqliteExecutor,
  NativeDatabase,
} from "@panticonic/pi-durable/storage/sqlite";
import { openNodeSqliteStorage } from "@panticonic/pi-durable/storage/sqlite/node";
import { hasLegacyPiLayout, splitLegacyPiStore, type PiStoreSql } from "./pi-store-split.js";

const context = BACKGROUND_CONTEXT;
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

/** A node:sqlite connection as the native storage the owner splits through. */
function nativeOver(db: DatabaseSync) {
  const sql: PiStoreSql = {
    exec(query, ...values) {
      const statement = db.prepare(query);
      return { toArray: () => statement.all(...(values as never[])) as Record<string, unknown>[] };
    },
  };
  return {
    sql,
    async transaction<T>(callback: () => Promise<T>): Promise<T> {
      db.exec("BEGIN");
      try {
        const result = await callback();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async sync() {},
  };
}

const count = (db: DatabaseSync, table: string): number =>
  Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);

describe("moving a store made with Pi's single table set into the composite layout", () => {
  it("moves tasks, submissions and operational documents to the local set under the same IDs, keeps conversations, entries and knowledge documents, and carries the counters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-split-"));
    directories.push(directory);
    const path = join(directory, "legacy.sqlite");
    // The store as Pi made it before: one set holds everything.
    const legacy = await openNodeSqliteStorage(path);
    const adopt = () => {};
    await legacy.commit(
      [
        { type: "conversation", value: { id: 1 as never } },
        { type: "entry", value: { id: 2 as never, conversationId: 1 as never, kind: "message", data: "hello" } },
        {
          type: "task",
          value: {
            id: 3 as never,
            conversationId: 1 as never,
            kind: "test.task",
            version: 1,
            state: { status: "pending" },
            abortRequested: false,
            background: false,
            input: null,
          } as never,
        },
        {
          type: "document.create",
          record: {
            id: 4 as never,
            kind: "pi.agent",
            scope: { kind: "conversation", conversationId: 1 as never },
            history: "rewindable",
            fork: "asOf",
          },
          content: { kind: "base", version: 1, value: { knowledge: true } },
        },
        {
          type: "document.create",
          record: { id: 5 as never, kind: "vibestudio.execution-owner", scope: { kind: "session" } },
          content: { kind: "base", version: 1, value: { owner: true } },
        },
        {
          type: "document.create",
          record: {
            id: 6 as never,
            kind: "pi.live",
            scope: { kind: "conversation", conversationId: 1 as never },
            history: "latest",
            fork: "initial",
          },
          content: { kind: "base", version: 1, value: { live: true } },
        },
      ],
      adopt,
      context,
    );
    await legacy.close(context);
    const db = new DatabaseSync(path);
    const native = nativeOver(db);
    // The class's schema gate creates the composite's two table sets (the local one empty) before the split.
    await applyCompositeSqliteMigrationsInTransaction(nativeSqliteExecutor(native.sql as never, () => {}));
    expect(hasLegacyPiLayout(native.sql)).toBe(true);
    splitLegacyPiStore(native.sql);
    expect(hasLegacyPiLayout(native.sql)).toBe(false);
    expect(count(db, "tasks")).toBe(0);
    expect(count(db, "vsl_tasks")).toBe(1);
    expect(count(db, "documents")).toBe(1);
    expect(count(db, "vsl_documents")).toBe(2);
    expect(count(db, "conversations")).toBe(1);
    expect(count(db, "entries")).toBe(1);
    // The scratch table of the move is gone.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'vsl_split_ids'").all()).toEqual([]);
    db.close();
    // Opened as the composite, the same records are read back, each from the set that holds it.
    const composite = await CompositeSqliteStorage.open(
      new NativeDatabase(nativeOver(new DatabaseSync(path)) as never) as never,
    );
    try {
      expect((await composite.task(3 as never, context))?.kind).toBe("test.task");
      expect((await composite.document(4 as never, "current", context))?.value).toEqual({ knowledge: true });
      expect((await composite.document(5 as never, "current", context))?.value).toEqual({ owner: true });
      expect((await composite.document(6 as never, "current", context))?.value).toEqual({ live: true });
      expect((await composite.entry(2 as never, context))?.entry.data).toBe("hello");
      // The counters continue where the legacy store's stood: no ID or sequence is reused.
      expect(await composite.mintId()).toBeGreaterThan(6);
    } finally {
      await composite.close(context);
    }
  });

  it("finds nothing to move in a store that is already split, and moving it twice changes nothing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-split-empty-"));
    directories.push(directory);
    const path = join(directory, "fresh.sqlite");
    const db = new DatabaseSync(path);
    const native = nativeOver(db);
    await applyCompositeSqliteMigrationsInTransaction(nativeSqliteExecutor(native.sql as never, () => {}));
    expect(hasLegacyPiLayout(native.sql)).toBe(false);
    splitLegacyPiStore(native.sql);
    splitLegacyPiStore(native.sql);
    expect(count(db, "vsl_tasks")).toBe(0);
    db.close();
  });
});
