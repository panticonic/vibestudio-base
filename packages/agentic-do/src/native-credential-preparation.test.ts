import { describe, expect, it } from "vitest";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
} from "@panticonic/pi-ai";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import {
  createRegistry,
  Harness,
  MemoryStorage,
  type TaskId,
} from "@panticonic/pi-durable";
import { reprepareNativeCredentialGeneration } from "./native-credential-preparation.js";

const context = BACKGROUND_CONTEXT;
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
describe("native credential continuation readiness", () => {
  it("reports no continuation when explicit Stop wins while cancellation cleanup is joined", async () => {
    const before = fauxProvider({ provider: "before" }),
      after = fauxProvider({ provider: "after" });
    const entered = gate(),
      cancelled = gate(),
      release = gate();
    before.setResponses([
      async (_messages, options) => {
        entered.resolve();
        await new Promise<void>((resolve) =>
          options!.signal!.addEventListener(
            "abort",
            () => {
              cancelled.resolve();
              resolve();
            },
            { once: true },
          ),
        );
        return fauxAssistantMessage("", { stopReason: "aborted" });
      },
    ]);
    after.setResponses([fauxAssistantMessage("Should not run")]);
    const models = createModels();
    models.setProvider(before.provider);
    models.setProvider(after.provider);
    let taskId!: TaskId;
    const harness = await Harness.open(
      new MemoryStorage(),
      {
        models,
        registry: createRegistry(),
        modelRequests: async (request) => {
          taskId = request.taskId;
          return {
            status: "ready",
            options: {},
            close: async () => {
              await release.promise;
            },
          };
        },
      },
      context,
    );
    let restarting: Promise<boolean> | undefined,
      stopping: Promise<void> | undefined;
    try {
      const conversation = await harness.root(context, {
        agent: { model: { provider: "before", modelId: before.getModel().id } },
      });
      const original = await conversation.submit(
        { type: "input", content: "Original input" },
        context,
      );
      await entered.promise;
      await conversation.configure(
        { model: { provider: "after", modelId: after.getModel().id } },
        context,
      );
      restarting = reprepareNativeCredentialGeneration(
        harness,
        conversation,
        taskId,
        context,
      );
      await cancelled.promise;
      stopping = conversation.abort(context);
      await conversation.commit(() => undefined, context);
      release.resolve();
      expect(await restarting).toBe(false);
      await stopping;
      expect(await original.status(context)).toMatchObject({
        status: "unanswered",
        reason: "aborted",
      });
      expect(after.state.callCount).toBe(0);
    } finally {
      release.resolve();
      await Promise.allSettled([restarting, stopping]);
      await harness.close(context);
    }
  });
});
