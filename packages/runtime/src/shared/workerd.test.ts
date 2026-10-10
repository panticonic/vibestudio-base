import { z } from "zod";
import { createRpcMethods } from "@vibestudio/shared/rpcMethods";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
/**
 * Tests for the typed workerd client.
 *
 * Worker lifecycle delegates to the canonical runtime entity service while
 * discovery and workspace service resolution use the workers service.
 */

import { createWorkerdClient, type WorkerdClient } from "./workerd.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

const testRpcMethods = createRpcMethods(
  "test",
  {
    ping: {
      website: { kind: "closed", reason: "Test receiver" } as const,
      args: z.tuple([]),
      returns: z.string(),
    },
  },
  "",
);

function createMockRpc() {
  const calls: Array<{ target: string; method: string; args: unknown[] }> = [];

  return {
    rpc: schemaRpcMock({
      call: vi.fn(
        async (
          target: string,
          method: string,
          args: unknown[],
        ): Promise<unknown> => {
          calls.push({ target, method, args });
          if (target === "main" && method === "runtime.createEntity") {
            const spec = args[0];
            if (
              spec === null ||
              typeof spec !== "object" ||
              !("kind" in spec) ||
              (spec.kind !== "worker" && spec.kind !== "do") ||
              !("execution" in spec) ||
              spec.execution === null ||
              typeof spec.execution !== "object" ||
              !("source" in spec.execution) ||
              typeof spec.execution.source !== "string" ||
              !("key" in spec) ||
              typeof spec.key !== "string" ||
              !("contextId" in spec) ||
              typeof spec.contextId !== "string"
            ) {
              throw new TypeError("Expected a runtime entity creation fixture");
            }
            const id = `${spec.kind}:${spec.execution.source}:${spec.key}`;
            return {
              id,
              kind: spec.kind,
              source: {
                repoPath: spec.execution.source,
                effectiveVersion: "test-version",
              },
              buildKey: "a".repeat(64),
              contextId: spec.contextId,
              targetId: id,
            };
          }
          if (target === "main" && method === "runtime.listEntities") return [];
          if (target === "main" && method === "workers.listSources") return [];
          if (target === "main" && method === "workers.listServices") return [];
          if (target === "main" && method === "workers.resolveService") {
            const query = args[0];
            const objectKey = args[1];
            if (typeof query !== "string")
              throw new TypeError("Expected a service query");
            if (
              objectKey !== undefined &&
              objectKey !== null &&
              typeof objectKey !== "string"
            ) {
              throw new TypeError("Expected an optional object key");
            }
            return durableObjectServiceFixture(
              `do:workers/example:ExampleDO:${objectKey ?? "default-key"}`,
              {
              source: "workers/example",
              name: query,
              action: "use example service",
              presentation: { domain: "computer", verb: "manage" },
              authority: { principals: ["code"], binding: "declared" },
              origin: "workspace",
              protocols: [query],
              className: "ExampleDO",
              objectKey: objectKey ?? "default-key",
            });
          }
          if (target === "main" && method === "workers.resolveDurableObject") {
            const [source, className, objectKey] = args;
            if (
              typeof source !== "string" ||
              typeof className !== "string" ||
              typeof objectKey !== "string"
            ) {
              throw new TypeError("Expected a durable object identity");
            }
            return {
              kind: "durable-object",
              source,
              className,
              objectKey,
              targetId: `do:${source}:${className}:${objectKey}`,
            };
          }
          return undefined;
        },
      ),
    }),
    calls,
  };
}

describe("createWorkerdClient", () => {
  let client: WorkerdClient;
  let mock: ReturnType<typeof createMockRpc>;

  beforeEach(() => {
    mock = createMockRpc();
    client = createWorkerdClient(mock.rpc);
  });

  it("exposes ergonomic worker lifecycle and exact-target DO recovery primitives", () => {
    // Raw cloneDO/destroyDO remain closed; only the journaled exact-target
    // reset/backup/restore recovery surface is public.
    expect(Object.keys(client).sort()).toEqual(
      [
        "create",
        "createDurableObject",
        "destroy",
        "durableObjectService",
        "list",
        "listServices",
        "listSources",
        "listStorageBackups",
        "resetStorage",
        "resolveDurableObject",
        "resolveService",
        "restoreStorageBackup",
      ].sort(),
    );
  });

  it("creates and destroys owned workers and Durable Objects through runtime entities", async () => {
    await client.create("workers/example", {
      key: "probe",
      contextId: "ctx-1",
      env: { NON_SECRET_PROBE: "configured" },
    });
    await client.list();
    await client.createDurableObject("workers/example", "ExampleDO", {
      key: "probe-do",
      contextId: "ctx-1",
    });
    await client.destroy({ id: "worker:workers/example:probe" });
    await client.destroy("worker:workers/example:probe-2");

    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "runtime.createEntity",
      [
        {
          kind: "worker",
          execution: { surface: "code", source: "workers/example" },
          key: "probe",
          contextId: "ctx-1",
          env: { NON_SECRET_PROBE: "configured" },
        },
      ],
      undefined,
    );
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "runtime.listEntities",
      [{ kind: "worker" }],
      undefined,
    );
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "runtime.createEntity",
      [
        {
          kind: "do",
          execution: { surface: "code", source: "workers/example" },
          className: "ExampleDO",
          key: "probe-do",
          contextId: "ctx-1",
        },
      ],
      undefined,
    );
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "runtime.retireEntity",
      [{ id: "worker:workers/example:probe" }],
      undefined,
    );
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "runtime.retireEntity",
      [{ id: "worker:workers/example:probe-2" }],
      undefined,
    );
  });

  it("creates a worker from an exact sealed artifact", async () => {
    const artifact = {
      buildKey: "a".repeat(64),
      executionDigest: "b".repeat(64),
    };

    await client.create("workers/example", {
      key: "test-worker",
      contextId: "ctx-1",
      artifact,
    });

    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "runtime.createEntity",
      [
        {
          kind: "worker",
          execution: {
            surface: "code",
            source: "workers/example",
            artifact,
          },
          key: "test-worker",
          contextId: "ctx-1",
        },
      ],
      undefined,
    );
  });

  it("listSources calls workers.listSources", async () => {
    await client.listSources();
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "workers.listSources",
      [],
      undefined,
    );
  });

  it("listServices calls workers.listServices", async () => {
    await client.listServices();
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "workers.listServices",
      [],
      undefined,
    );
  });

  it("resolveService calls workers.resolveService", async () => {
    await client.resolveService("vibestudio.channel.v1", "chat-1");
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "workers.resolveService",
      ["vibestudio.channel.v1", "chat-1"],
      undefined,
    );
  });

  it("durableObjectService resolves then calls the service target through unified RPC", async () => {
    mock.rpc.call.mockImplementation(async (target: string, method: string) => {
      if (target === "main" && method === "workers.resolveService") {
        return durableObjectServiceFixture("do:workers/example:ExampleDO:key-1", { source: "workers/example",
          name: "example.service.v1",
          action: "use example service",
          presentation: { domain: "computer", verb: "manage" },
          authority: { principals: ["code"], binding: "declared" },
          origin: "workspace",
          protocols: ["example.service.v1"],
          className: "ExampleDO",
          objectKey: "key-1" });
      }
      return "ok";
    });

    await expect(
      client
        .durableObjectService("example.service.v1", testRpcMethods, "key-1")
        .call("ping"),
    ).resolves.toBe("ok");
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "workers.resolveService",
      ["example.service.v1", "key-1"],
      undefined,
    );
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "do:workers/example:ExampleDO:key-1",
      "ping",
      [],
      undefined,
    );
  });

  it("resolveDurableObject calls workers.resolveDurableObject", async () => {
    await client.resolveDurableObject("workers/example", "ExampleDO", "key-1");
    expect(mock.rpc.call).toHaveBeenCalledWith(
      "main",
      "workers.resolveDurableObject",
      ["workers/example", "ExampleDO", "key-1"],
      undefined,
    );
  });
});
