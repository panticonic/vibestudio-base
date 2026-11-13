import { describe, expect, it } from "vitest";
import { LOCAL_PROVIDER_ID } from "@workspace/model-catalog/catalog";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { modelsFor } from "./models.js";
import { EXECUTOR_ENTRY } from "./testSupport.js";

const STOCK_REQUEST = { temperature: 0, chat_template_kwargs: { preserve_thinking: true } };

function local() {
  const entry = makeTestCatalogEntry({
    ref: "local:lfm3-1.7b",
    id: "lfm3-1.7b",
    name: "LFM3 1.7B",
    provider: LOCAL_PROVIDER_ID,
    baseUrl: "http://127.0.0.1:1/v1",
  });
  return { ...entry, modelSpec: { ...entry.modelSpec, samplingParams: STOCK_REQUEST } };
}

describe("the executor identity", () => {
  const build = () =>
    modelsFor({ gateway: {} as never, directory: { resolve: async () => EXECUTOR_ENTRY } as never, turnPrefix: "t" });

  it("names the role until the executor is pinned", () => {
    const { executor, executorIdentity } = build();
    expect(executor.id).toBe("executor");
    expect(executorIdentity).toMatchObject({ id: "gateway:executor", configuration: { model: "executor", request: {} } });
  });

  it("carries a local model's serving request and guidance once pinned", () => {
    const { executor, executorIdentity, pinExecutor } = build();
    pinExecutor(local());
    expect(executor).toMatchObject({ id: "local:lfm3-1.7b", guidance: true });
    expect(executorIdentity).toEqual({
      id: "gateway:local:lfm3-1.7b",
      configuration: { model: "local:lfm3-1.7b", request: STOCK_REQUEST, guidance: true, decisionReply: "result-object" },
    });
  });

  it("asks a hosted model for no guidance and records an empty request", () => {
    const { executor, executorIdentity, pinExecutor } = build();
    pinExecutor(EXECUTOR_ENTRY);
    expect(executor.guidance).toBeUndefined();
    expect(executorIdentity.configuration).toEqual({ model: EXECUTOR_ENTRY.ref, request: {} });
  });
});

describe("guided generation", () => {
  it("is asked for by the config and offered by the driver together, exactly for a local model", () => {
    const { executor, models, pinExecutor } = modelsFor({
      gateway: {} as never,
      directory: { resolve: async () => EXECUTOR_ENTRY } as never,
      turnPrefix: "t",
    });
    expect([executor.guidance, (executor.driver as any).guidance]).toEqual([undefined, undefined]);
    pinExecutor(local());
    expect([executor.guidance, (executor.driver as any).guidance]).toEqual([true, true]);
    const named = models["local:lfm3-1.7b"]!;
    expect([named.guidance, (named.driver as any).guidance]).toEqual([true, true]);
    const hosted = models["test:executor-small"]!;
    expect([hosted.guidance, (hosted.driver as any).guidance]).toEqual([undefined, undefined]);
  });
});
