import { afterEach, describe, expect, it, vi } from "vitest";
import { schemaRpcClient, wireClientFor } from "@vibestudio/rpc/internal";
import type { RpcClient } from "@vibestudio/rpc";
import type { ParticipantDescriptor } from "@workspace/harness";
import { createNativeVesselTestDO } from "./testing/native-vessel.js";
import { AgentWorkerBase } from "./agent-worker-base.js";

/** Workspace freshness belongs to the exact-state host resource owner, rather
 * than a prompt cached indefinitely in one agent's execution isolate. */
describe("workspace prompt resources", () => {
  const databases = new Set<{ close(): void }>();
  afterEach(() => {
    for (const database of databases) database.close();
    databases.clear();
  });
  class ResourceAgent extends AgentWorkerBase {
    resources = vi.fn(async () => ({ workspacePrompt: "before", skills: [] }));
    protected override getParticipantInfo(): ParticipantDescriptor {
      return {
        name: "Resources",
        handle: "resources",
        type: "agent",
        metadata: {},
      };
    }
    protected override get rpc(): RpcClient {
      const wire = wireClientFor(super.rpc);
      return schemaRpcClient({
        ...wire,
        call: async (destination, method, args, options) => {
          if (
            destination === "main" &&
            method === "workspace.getAgentResources"
          ) {
            return this.resources();
          }
          return wire.call(destination, method, args, options);
        },
      });
    }
    readResources() {
      return this.loadPromptResources("channel");
    }
  }
  async function agent() {
    const fixture = await createNativeVesselTestDO(ResourceAgent);
    databases.add(fixture.db);
    return fixture.instance;
  }

  it("coalesces concurrent loads but asks the exact-state owner again on later configuration", async () => {
    const vessel = await agent();
    const [first, concurrent] = await Promise.all([
      vessel.readResources(),
      vessel.readResources(),
    ]);
    expect(first.workspacePrompt).toBe("before");
    expect(concurrent).toEqual(first);
    expect(vessel.resources).toHaveBeenCalledTimes(1);
    vessel.resources.mockResolvedValue({
      workspacePrompt: "after",
      skills: [],
    });
    expect((await vessel.readResources()).workspacePrompt).toBe("after");
    expect(vessel.resources).toHaveBeenCalledTimes(2);
  });

  it("propagates failed resource acquisition and admits a subsequent fresh load", async () => {
    const vessel = await agent();
    vessel.resources.mockRejectedValueOnce(
      new Error("semantic resource read failed"),
    );
    await expect(vessel.readResources()).rejects.toThrow(
      "semantic resource read failed",
    );
    expect((await vessel.readResources()).workspacePrompt).toBe("before");
    expect(vessel.resources).toHaveBeenCalledTimes(2);
  });
});
