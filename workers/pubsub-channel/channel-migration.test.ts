import { describe, expect, it } from "vitest";
import { decodeRpcJson } from "@vibestudio/rpc";
import { LEGACY_PROOF_HEADER } from "@vibestudio/durable/legacyImport";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { PubSubChannel } from "./channel-do.js";
import { CHANNEL_SCHEMA_V125_SHAPE } from "./channel-schema-history.js";
import { newChannelFake } from "./channel-test-support.js";

type Fixture = Awaited<ReturnType<typeof createTestDO<typeof PubSubChannel>>>;

/** The trusted descriptor of the current build: what the host's schema probe hands an admitted object. */
async function currentDescriptor(): Promise<Record<string, unknown>> {
  const fresh = await createTestDO(PubSubChannel, { __objectKey: "probe" });
  const response = (
    fresh.instance as unknown as { schemaDescriptorResponse(): Response }
  ).schemaDescriptorResponse();
  return (await response.json()) as Record<string, unknown>;
}

/**
 * An object as the version-125 class left it: the current tables without
 * `channel_facts`, its identity row at 125 with the 125 shape (the test fails if
 * that shape is not exactly what the current tables minus `channel_facts` are),
 * and its facts in `state`.
 */
async function version125Object(): Promise<Fixture> {
  const object = await createTestDO(PubSubChannel, { __objectKey: "legacy" });
  await (object.instance as unknown as { initializeSchema(): Promise<void> }).initializeSchema();
  const db = object.db;
  db.run("DROP TABLE channel_facts");
  db.run("UPDATE _vibestudio_schema SET version = 125, shape_json = ?", [CHANNEL_SCHEMA_V125_SHAPE]);
  for (const [key, value] of [
    ["contextId", "ctx-legacy"],
    ["config", '{"name":"legacy"}'],
    ["conversationSeed", '{"messages":[]}'],
    ["conversationSeedInstalled", "true"],
    ["createdAt", "1700000000000"],
    ["openingRequestOutcome", "cancel"],
    ["inviteIndexRevision", "4"],
  ] as const)
    db.run("INSERT INTO state (key, value) VALUES (?, ?)", [key, value]);
  db.run(
    "UPDATE channel_delivery_context SET initial_config_json = ?, current_config_json = ? WHERE singleton = 1",
    ['{"name":"legacy"}', '{"name":"legacy"}'],
  );
  return object;
}

describe("a channel's schema 125 to 126 and the import of its SQLite state", () => {
  it("upgrades a version 125 object: its facts move from `state` into the versioned `channel_facts`", async () => {
    const old = await version125Object();
    const legacy = await createTestDO(
      PubSubChannel,
      { __objectKey: "legacy", VIBESTUDIO_SCHEMA_DESCRIPTOR: await currentDescriptor() },
      { db: old.db },
    );
    await (legacy.instance as unknown as { initializeSchema(): Promise<void> }).initializeSchema();
    const facts = Object.fromEntries(
      legacy.sql
        .exec("SELECT key, value FROM channel_facts ORDER BY key")
        .toArray()
        .map((row) => [row["key"], row["value"]]),
    );
    expect(facts).toEqual({
      config: '{"name":"legacy"}',
      conversationSeed: '{"messages":[]}',
      conversationSeedInstalled: "true",
      createdAt: "1700000000000",
      initialConfig: '{"name":"legacy"}',
      openingRequestOutcome: "cancel",
    });
    expect(
      legacy.sql.exec("SELECT version FROM _vibestudio_schema").toArray()[0]!["version"],
    ).toBe(126);
  });

  it("copies a legacy object into the Dolt cell through the class's own import calls, ledger and facts and identity alike", async () => {
    const proof = "root-proof-abcdef";
    const props = { nativeOwner: null, stateArgs: null, image: null, codeHost: { name: "root", proof } };
    const source = await createTestDO(PubSubChannel, { __objectKey: "migrating" }, { props });
    const sourceInstance = source.instance as unknown as { initializeSchema(): Promise<void>; initChannel(c: string, cfg: object): void };
    await sourceInstance.initializeSchema();
    sourceInstance.initChannel("ctx-migrating", { name: "kept" });
    source.sql.exec(
      `INSERT INTO channel_members (user_id, handle, added_by, added_at) VALUES ('user:usr_bob', 'bob', 'user:usr_alice', 5)`,
    );
    const target = await createTestDO(
      PubSubChannel,
      { __objectKey: "migrating" },
      { props, storage: (await newChannelFake()).storage as never },
    );
    await (target.instance as unknown as { initializeSchema(): Promise<void> }).initializeSchema();
    const call = async (
      fixture: Fixture,
      method: string,
      body: unknown,
    ): Promise<any> => {
      const response = await fixture.instance.fetch(
        new Request(`http://do/migrating/__legacy/${method}`, {
          method: "POST",
          headers: { [LEGACY_PROOF_HEADER]: proof, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      const decoded = decodeRpcJson(await response.text()) as { result?: unknown; error?: unknown };
      expect(decoded.error, method).toBeUndefined();
      return decoded.result;
    };
    const tables = (await call(source, "tables", {})) as Array<{ name: string; columns: string[] }>;
    for (const table of tables) {
      let after: number | null = null;
      for (;;) {
        const page = await call(source, "rows", { table: table.name, after });
        if (page.rows.length > 0)
          await call(target, "load", { table: table.name, columns: page.columns, rows: page.rows });
        if (page.next === null) break;
        after = page.next;
      }
    }
    await call(target, "commit", { message: "import: migrating from sqlite" });
    expect(target.sql.exec("SELECT user_id, handle FROM channel_members").toArray()).toEqual([
      { user_id: "user:usr_bob", handle: "bob" },
    ]);
    expect(target.sql.exec("SELECT value FROM channel_facts WHERE key = 'config'").toArray()).toEqual([
      { value: '{"name":"kept"}' },
    ]);
    // The identity (a local `state` row) moved too, and the cell answers as the same conversation.
    expect(await (target.instance as unknown as { getContextId(): Promise<string> }).getContextId()).toBe("ctx-migrating");
    (target.instance as unknown as { assertCleanWorkingSet(): void }).assertCleanWorkingSet();
    // Only the object's own root can ask.
    const refused = await target.instance.fetch(
      new Request("http://do/migrating/__legacy/tables", { method: "POST" }),
    );
    expect(refused.status).toBe(403);
  });
});
