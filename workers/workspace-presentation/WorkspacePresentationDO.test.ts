import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { DURABLE_OBJECT_FRAMEWORK_RPC_METHODS } from "@vibestudio/durable";
import type {
  DurableObjectContext,
  SqlResult,
} from "@workspace/runtime/worker";
import { rpcExposedMethodNames } from "@vibestudio/rpc";
import { workspacePresentationMethods } from "@vibestudio/service-schemas/workspacePresentation";
import type { MethodSchema } from "@vibestudio/shared/typedServiceClient";
import { WorkspacePresentationDO } from "./WorkspacePresentationDO.js";

const createPresentation = async () => {
  const db = new DatabaseSync(":memory:");
  const instance = new WorkspacePresentationDO(sqliteContext(db), {});
  await (
    instance as unknown as { initializeSchema(): Promise<void> }
  ).initializeSchema();
  return { instance, db };
};

describe("WorkspacePresentationDO", async () => {
  it("exposes exactly the Base-owned presentation contract", async () => {
    const { instance, db } = await createPresentation();
    const productMethods = [...rpcExposedMethodNames(instance)].filter(
      (method) => !DURABLE_OBJECT_FRAMEWORK_RPC_METHODS.has(method),
    );
    expect(productMethods.sort()).toEqual(
      Object.keys(workspacePresentationMethods).sort(),
    );
    db.close();
  });

  it("resolves every open presentation method without a fictitious source capability", async () => {
    const { instance, db } = await createPresentation();
    const authority = instance as unknown as {
      rpcAuthorityDeclaration(method: string, schema: MethodSchema): unknown;
    };
    for (const [method, schema] of Object.entries(
      workspacePresentationMethods,
    )) {
      expect(authority.rpcAuthorityDeclaration(method, schema)).toMatchObject({
        effect: { kind: "open" },
      });
    }
    db.close();
  });

  it("owns entity titles and follows the current slot binding", async () => {
    const { instance, db } = await createPresentation();
    instance.bindSlot("slot-1", "entity-1", "panels/chat");
    instance.updatePanelTitle("slot-1", "entity-1", "Support inbox");
    expect(instance.titlesForSlots(["slot-1"])).toEqual({
      "slot-1": "Support inbox",
    });

    instance.setEntityTitle("entity-2", "Calendar");
    instance.bindSlot("slot-1", "entity-2", "panels/calendar");
    expect(instance.titlesForSlots(["slot-1"])).toEqual({
      "slot-1": "Calendar",
    });
    expect(instance.listEntityTitles()).toEqual([
      { id: "entity-1", title: "Support inbox", explicit: false },
      { id: "entity-2", title: "Calendar", explicit: false },
    ]);
    db.close();
  });

  it("clears a panel and entity title together", async () => {
    const { instance, db } = await createPresentation();
    instance.bindSlot("slot-1", "entity-1", "panels/chat");
    instance.updatePanelTitle("slot-1", "entity-1", "Support inbox", {
      explicit: true,
    });

    instance.updatePanelTitle("slot-1", "entity-1", null, {
      explicit: true,
    });

    expect(instance.titlesForSlots(["slot-1"])).toEqual({});
    expect(instance.listEntityTitles()).toEqual([]);
    db.close();
  });

  it("names a slot from the title the binder knew, without ever presenting a slot id", async () => {
    const { instance, db } = await createPresentation();
    // A panel is bound the moment it is created, long before its document has
    // loaded and reported a title of its own.
    instance.bindSlot("slot-1", "entity-1", "about/adblock", "Ad Blocking");
    expect(instance.titlesForSlots(["slot-1"])).toEqual({
      "slot-1": "Ad Blocking",
    });
    expect(instance.listEntityTitles()).toEqual([
      { id: "entity-1", title: "Ad Blocking", explicit: false },
    ]);

    // A better title arriving later still wins, and re-binding cannot undo it.
    instance.updatePanelTitle("slot-1", "entity-1", "Ad Blocking — rules");
    instance.bindSlot("slot-1", "entity-1", "about/adblock", "Ad Blocking");
    expect(instance.titlesForSlots(["slot-1"])).toEqual({
      "slot-1": "Ad Blocking — rules",
    });

    // An explicit human title is never displaced by a binder's default.
    instance.setEntityTitle("entity-2", "My inbox", { explicit: true });
    instance.bindSlot("slot-2", "entity-2", "panels/chat", "Agentic Chat");
    expect(instance.titlesForSlots(["slot-2"])).toEqual({
      "slot-2": "My inbox",
    });

    // No title anywhere: the slot stays unnamed rather than being named after
    // itself; naming the fallback is the presenter's job, not the store's.
    instance.bindSlot("slot-3", "entity-3", "panels/chat");
    expect(instance.titlesForSlots(["slot-3"])).toEqual({});
    db.close();
  });

  it("keeps durable search facts and rebuilds only the derived FTS projection", async () => {
    const { instance, db } = await createPresentation();
    instance.indexPanel(
      {
        id: "slot-1",
        source: "panels/chat",
        title: "Support inbox",
        path: "panels/chat",
        tags: ["mail"],
      },
      "entity-1",
    );
    instance.incrementAccess("slot-1");
    instance.rebuildIndex();

    expect(instance.search("support").results).toEqual([
      expect.objectContaining({
        id: "slot-1",
        title: "Support inbox",
        accessCount: 1,
      }),
    ]);
    expect(instance.sourceUsage()).toEqual([
      expect.objectContaining({ source: "panels/chat", accessCount: 1 }),
    ]);

    instance.removeSlots(["slot-1"]);
    expect(instance.search("support").results).toEqual([]);
    db.close();
  });

  it("treats punctuation in copied titles as separators rather than required FTS terms", async () => {
    const { instance, db } = await createPresentation();
    instance.indexPanel(
      {
        id: "trello-slot",
        source: "browser:https://trello.com/b/example/vibestudio",
        title: "vibestudio | Trello",
        path: "https://trello.com/b/example/vibestudio",
      },
      "trello-entity",
    );

    expect(instance.search("vibestudio | Trello").results).toEqual([
      expect.objectContaining({
        id: "trello-slot",
        title: "vibestudio | Trello",
      }),
    ]);
    expect(instance.search("https://trello.com/b/example").results).toEqual([
      expect.objectContaining({ id: "trello-slot" }),
    ]);
    expect(instance.search(" | / : ").results).toEqual([]);
    db.close();
  });

  it("owns explicit-title precedence without a host-side hook", async () => {
    const { instance, db } = await createPresentation();
    instance.bindSlot("slot-1", "entity-1", "panels/chat");
    instance.updatePanelTitle("slot-1", "entity-1", "Pinned", {
      explicit: true,
    });
    instance.updatePanelTitle("slot-1", "entity-1", "Inferred");

    expect(instance.isEntityTitleExplicit("entity-1")).toBe(true);
    expect(instance.titlesForSlots(["slot-1"])).toEqual({ "slot-1": "Pinned" });
    db.close();
  });

  it("preserves a newer runtime title when observation repairs the slot index", async () => {
    const { instance, db } = await createPresentation();
    instance.setEntityTitle("entity-1", "Current conversation");
    instance.indexPanel(
      {
        id: "slot-1",
        source: "panels/chat",
        title: "Agentic Chat",
        path: "panels/chat",
      },
      "entity-1",
    );

    expect(instance.titlesForSlots(["slot-1"])).toEqual({
      "slot-1": "Current conversation",
    });
    db.close();
  });
});

function sqliteContext(db: DatabaseSync): DurableObjectContext {
  const sql = {
    exec(query: string, ...bindings: unknown[]): SqlResult {
      if (
        bindings.length === 0 &&
        /^\s*CREATE\b/i.test(query) &&
        query.includes(";")
      ) {
        db.exec(query);
        return {
          toArray: () => [],
          one: () => {
            throw new Error("Expected one row, received 0");
          },
        };
      }
      const statement = db.prepare(query);
      const rows =
        /^\s*(?:SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(query) ||
        /\bRETURNING\b/i.test(query)
          ? (statement.all(...(bindings as [])) as Record<string, unknown>[])
          : (statement.run(...(bindings as [])), []);
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1)
            throw new Error(`Expected one row, received ${rows.length}`);
          return rows[0]!;
        },
      };
    },
  };
  return {
    id: {
      toString: () => "workspace-presentation-test",
      name: "workspace-presentation-test",
    },
    storage: {
      sql,
      async sync() {},
      setAlarm() {},
      async getAlarm() {
        return null;
      },
      deleteAlarm() {},
      async transaction<T>(callback: () => Promise<T>): Promise<T> {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = await callback();
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
      transactionSync<T>(callback: () => T): T {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = callback();
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
    acceptWebSocket() {},
    getWebSockets: () => [],
    blockConcurrencyWhile: (fn) => fn(),
  };
}
