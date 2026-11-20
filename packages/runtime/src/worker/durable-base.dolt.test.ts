import { describe, expect, it, vi } from "vitest";
import { doltLocalPatterns } from "@vibestudio/durable/dolt";
import { FakeDoltStorage } from "@vibestudio/durable/test-dolt";
import { DurableObjectBase } from "./durable-base.js";
import { createTestDO } from "./durable-test-utils.js";

/** Base's durable base on a Dolt cell: commits, the call-nonce gate, and hosting code. */
class NotesDO extends DurableObjectBase {
  protected createTables(): void {
    this.sql.exec(
      "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)",
    );
  }
  protected override requiredTables(): readonly string[] {
    return ["notes"];
  }
  add(body: string): number {
    return this.committedTransaction(
      (id) => `add note ${id}`,
      () => {
        this.sql.exec("INSERT INTO notes(body) VALUES (?)", body);
        return Number(
          this.sql.exec("SELECT max(id) AS id FROM notes").one()["id"],
        );
      },
    );
  }
  noopTransaction(): void {
    this.transactionSync(() => {
      this.sql.exec("SELECT count(*) FROM notes").toArray();
    });
  }
  check(): void {
    this.assertCleanWorkingSet();
  }
  engine(): boolean {
    return this.dolt !== null;
  }
  sqlStateValue(key: string): string | null {
    return this.getStateValue(key);
  }
  kernel(name: string) {
    return this.hostCode({
      name,
      executable: { source: "workers/k", className: "K" },
    });
  }
  /** Admit a call the way the inbound envelope does, then run `fn` as that call. */
  runCall<T>(
    nonce: string,
    mutating: boolean,
    fn: () => T,
  ): { result: T; persisted: boolean | null } {
    const internals = this as unknown as {
      _directCalls: {
        admit(
          a: { nonce: string; issuedAt: number; expiresAt: number },
          mutating: boolean,
        ): {
          ok: boolean;
          pending: { persisted: boolean; baseline: number | null } | null;
          reason?: string;
        };
      };
      totalChanges(): number;
      _invocationContext: { run<R>(context: unknown, operation: () => R): R };
    };
    const now = Date.now();
    const admitted = internals._directCalls.admit(
      { nonce, issuedAt: now + 1, expiresAt: now + 60_000 },
      mutating,
    );
    if (!admitted.ok) throw new Error(`refused: ${admitted.reason}`);
    if (admitted.pending) admitted.pending.baseline = internals.totalChanges();
    const result = internals._invocationContext.run(
      admitted.pending ? { pendingNonce: admitted.pending } : {},
      fn,
    );
    return {
      result,
      persisted: admitted.pending ? admitted.pending.persisted : null,
    };
  }
  consumeNonce(nonce: string): boolean {
    const ledger = (
      this as unknown as {
        _directRpcNonces: { consume(n: string, e: number): boolean };
      }
    )._directRpcNonces;
    return ledger.consume(nonce, Date.now() + 60_000);
  }
}

async function onDolt() {
  const fake = await FakeDoltStorage.create({
    doltLocal: doltLocalPatterns([]),
  });
  const probe = await createTestDO(NotesDO, undefined, {
    storage: fake.storage,
  });
  return { fake, ...probe };
}

describe("Base durable base on a Dolt cell", () => {
  it("installs its schema as a commit, commits through committedTransaction, stays clean", async () => {
    const { fake, instance } = await onDolt();
    expect(instance.engine()).toBe(true);
    expect(fake.dolt.log()[0]?.message).toBe("schema: TestDO v1");
    expect(instance.add("one")).toBe(1);
    expect(instance.add("two")).toBe(2);
    expect(fake.dolt.log({ limit: 2 }).map((entry) => entry.message)).toEqual([
      "add note 2",
      "add note 1",
    ]);
    expect(() => instance.check()).not.toThrow();
  });

  it("keeps the nonce ledger in a local table, and records a mutating call's nonce in its own commit", async () => {
    const { fake, instance } = await onDolt();
    const count = () =>
      fake.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE name = 'vsl_direct_rpc_nonces'",
        )
        .toArray().length === 0
        ? 0
        : Number(
            fake.sql
              .exec("SELECT count(*) AS n FROM vsl_direct_rpc_nonces")
              .one()["n"],
          );
    expect(
      instance.runCall("123e4567-e89b-42d3-a456-426614174001", false, () => 1),
    ).toEqual({
      result: 1,
      persisted: null,
    });
    expect(count()).toBe(0);
    const logBefore = fake.dolt.log().length;
    const write = instance.runCall(
      "123e4567-e89b-42d3-a456-426614174002",
      true,
      () => instance.add("x"),
    );
    expect(write).toEqual({ result: 1, persisted: true });
    expect(count()).toBe(1);
    expect(fake.dolt.log().length).toBe(logBefore + 1);
    expect(() => instance.check()).not.toThrow();
    // A replay of a recorded nonce is refused; a call that changed nothing records none.
    expect(() =>
      instance.runCall("123e4567-e89b-42d3-a456-426614174002", true, () => 1),
    ).toThrow(/refused/);
    const noop = instance.runCall(
      "123e4567-e89b-42d3-a456-426614174004",
      true,
      () => instance.noopTransaction(),
    );
    expect(noop.persisted).toBe(false);
    expect(count()).toBe(1);
  });

  it("refuses an attestation issued before the object's activation, before anything runs", async () => {
    const { instance } = await onDolt();
    const internals = instance as unknown as {
      _directCalls: {
        admit(
          a: { nonce: string; issuedAt: number; expiresAt: number },
          m: boolean,
        ): { ok: boolean; reason?: string };
      };
    };
    const old = Date.now() - 120_000;
    expect(
      internals._directCalls.admit(
        {
          nonce: "123e4567-e89b-42d3-a456-426614174009",
          issuedAt: old,
          expiresAt: Date.now() + 60_000,
        },
        false,
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is a plain transaction on a SQLite cell: no Dolt, the old nonce table", async () => {
    const { instance, sql } = await createTestDO(NotesDO);
    expect(instance.engine()).toBe(false);
    expect(instance.add("one")).toBe(1);
    expect(instance.consumeNonce("123e4567-e89b-42d3-a456-426614174000")).toBe(
      true,
    );
    const tables = sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table'")
      .toArray()
      .map((row) => row["name"]);
    expect(tables).toContain("_vibestudio_direct_rpc_nonces");
    expect(tables).not.toContain("vsl_direct_rpc_nonces");
  });
});

/** A class on a short compaction schedule (`DEFAULT_DOLT_GC_POLICY` is 64 commits), and one that never compacts. */
class GcNotesDO extends NotesDO {
  protected override doltGcPolicy() {
    return { minCommits: 4, growth: 0.5 };
  }
}
class NeverGcNotesDO extends NotesDO {
  protected override doltGcPolicy() {
    return null;
  }
}

describe("Base durable base compacts a Dolt cell (docs/dolt-redesign.md §6.11.8)", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 450));

  it("asks for a check after every eighth commit, runs it later in a block of the object, and remembers it", async () => {
    const fake = await FakeDoltStorage.create({ doltLocal: doltLocalPatterns([]) });
    const { instance } = await createTestDO(GcNotesDO, undefined, { storage: fake.storage });
    const gc = vi.spyOn(fake.dolt, "gc");
    for (let i = 0; i < 7; i++) instance.add(`note ${i}`);
    await settle();
    expect(gc).not.toHaveBeenCalled();
    instance.add("the eighth");
    // The check is not run inside the commit's own event: nothing has been collected yet.
    expect(gc).not.toHaveBeenCalled();
    await settle();
    expect(gc).toHaveBeenCalledOnce();
    expect(instance.sqlStateValue("__dolt_gc_head")).toBe(fake.dolt.hashOf("HEAD"));
    // The object is intact and the schedule is not due again.
    expect(() => instance.check()).not.toThrow();
    // The next check is asked for at the sixteenth commit; the cell held nine commits when it was collected, so
    // it is due again after five more, and the sixteenth commit's check finds it so.
    for (let i = 0; i < 7; i++) instance.add(`more ${i}`);
    await settle();
    expect(gc).toHaveBeenCalledOnce();
    instance.add("the sixteenth");
    await settle();
    expect(gc).toHaveBeenCalledTimes(2);
  });

  it("never compacts a class that returns no schedule, nor a SQLite cell", async () => {
    const fake = await FakeDoltStorage.create({ doltLocal: doltLocalPatterns([]) });
    const { instance } = await createTestDO(NeverGcNotesDO, undefined, { storage: fake.storage });
    const gc = vi.spyOn(fake.dolt, "gc");
    for (let i = 0; i < 16; i++) instance.add(`note ${i}`);
    await settle();
    expect(gc).not.toHaveBeenCalled();
    const sqlite = await createTestDO(GcNotesDO);
    for (let i = 0; i < 9; i++) sqlite.instance.add(`note ${i}`);
    await settle();
  });
});

describe("Base durable base hosts code", () => {
  it("reaches its root through CODE_HOST with the proof in its props, and refuses without them", async () => {
    const seen: Array<{ headers: Record<string, string>; op: string }> = [];
    const env = {
      CODE_HOST: {
        fetch: async (_url: string, init: RequestInit) => {
          const body = JSON.parse(String(init.body)) as { op: string };
          seen.push({
            headers: init.headers as Record<string, string>,
            op: body.op,
          });
          return body.op === "call"
            ? Response.json({ result: 42 })
            : Response.json({ hosted: true });
        },
      },
    };
    const hosting = await createTestDO(NotesDO, env, {
      props: {
        nativeOwner: null,
        stateArgs: null,
        image: null,
        codeHost: { name: "root-name", proof: "proof" },
      },
    });
    const kernel = await hosting.instance.kernel("repl:default");
    expect(await kernel.call("run", "40 + 2")).toBe(42);
    expect(seen.map((entry) => entry.op)).toEqual(["host", "call"]);
    expect(seen[0]!.headers["X-Code-Host-Proof"]).toBe("proof");

    const plain = await createTestDO(NotesDO);
    await expect(plain.instance.kernel("repl:default")).rejects.toMatchObject({
      code: "EUNAVAILABLE",
    });
  });

  it("a hosted class serves its exposed methods to the root and acts as its host entity", async () => {
    const hosted = await createTestDO(NotesDO, undefined, {
      props: {
        nativeOwner: null,
        stateArgs: null,
        image: null,
        host: { entityId: "do:workers/agent:Agent:a1", token: "host-token" },
      },
    });
    const instance = hosted.instance as unknown as { rpcSelfId: string };
    expect(instance.rpcSelfId).toBe("do:workers/agent:Agent:a1");
    // `__hosted/__revoked` reaches `onHostedRevoked`; an ordinary object refuses `__hosted`.
    const refused = await createTestDO(NotesDO);
    const response = await (
      refused.instance as unknown as DurableObjectBase & {
        fetch(request: Request): Promise<Response>;
      }
    ).fetch(
      new Request("http://x/test-key/__hosted/__revoked", {
        method: "POST",
        body: JSON.stringify({ reason: "drain" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
