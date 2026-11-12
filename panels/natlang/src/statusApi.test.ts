import { describe, expect, it } from "vitest";
import { readExecutorStatus, statusApi } from "./statusApi.js";
import { fakePorts } from "./testSupport.js";

describe("statusApi", () => {
  it("describes the executor role, local engine, machine and store in the shape natlang's pages read", async () => {
    const { ports, records } = fakePorts();
    records.calls = [];
    const status = await statusApi(ports, () => ({ running: 2, total: 5 })).get();
    expect(status).toMatchObject({
      model: { profile: "executor role", kind: "managed-local", model: "LFM3 1.7B", provider: "local", release: { id: "lfm3-1.7b", label: "LFM3 1.7B", installed: true } },
      calls: { calls: 0, settings: { specialization: "off" } },
      runtime: { selected: { version: "b12067", source: "local-models", fork: true }, recommended: { version: "b12067" } },
      machine: { cpus: 8, platform: "linux-x64" },
      jobs: { running: 2, total: 5 },
    });
    // The Overview page slices these.
    expect(status["runtime"].fork.commit.slice(0, 10)).toBe("abc123");
  });

  it("reports a hosted executor without a local release, and an unresolvable role as the model's problem", async () => {
    const hosted = fakePorts({
      resolveRole: async () => ({
        role: "executor",
        ref: "anthropic:haiku",
        source: "hosted",
        model: { ref: "anthropic:haiku", name: "Haiku", provider: "anthropic" } as never,
        reason: "Billed low-tier model.",
      }),
    });
    const status = await statusApi(hosted.ports, () => ({ running: 0, total: 0 })).get();
    expect(status["model"]).toMatchObject({ kind: "pi-provider", model: "Haiku", provider: "anthropic" });
    expect(status["model"].release).toBeUndefined();

    const none = fakePorts({ resolveRole: async () => ({ role: "executor", ref: null, source: "unavailable", model: null, reason: "Connect a provider." }) });
    expect((await statusApi(none.ports, () => ({ running: 0, total: 0 })).get())["model"]).toMatchObject({ model: "none", error: "Connect a provider." });
  });

  it("keeps showing what can be read when one source fails, and says which one failed", async () => {
    const { ports, records } = fakePorts();
    ports.localModels.status = async () => {
      throw new Error("local-models is not running");
    };
    records.stats = async () => {
      throw new Error("records service unavailable");
    };
    const state = await readExecutorStatus(ports);
    expect(state.role).toMatchObject({ source: "local" });
    expect(state.localModelsProblem).toBe("local-models is not running");
    expect(state.storeProblem).toBe("records service unavailable");
    expect(state.store).toBeNull();
    const status = await statusApi(ports, () => ({ running: 0, total: 0 })).get();
    expect(status["calls"]).toBeNull();
    expect(status["runtime"].selected).toBeNull();
  });
});
