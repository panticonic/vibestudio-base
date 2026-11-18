import { bindAutomationLifecycle } from "../automation-lifecycle-bindings/index.js";
import type {
  LifecycleAction,
  LifecycleReport,
} from "../automation-lifecycle/types.js";
import type { automationLifecycleWorlds } from "./worlds.js";

type World = (typeof automationLifecycleWorlds)[number];

export function createAutomationLifecycleFixture(world: World) {
  const operations: { action: LifecycleAction | "get"; missionId: string }[] =
    [];
  let readCount = 0;
  async function transition(action: LifecycleAction, missionId: string) {
    operations.push({ action, missionId });
    if (!world.effect || world.effect === "acknowledgment-lost")
      throw new Error("No acknowledged transition.");
    return {
      missionId: world.effect === "wrong-receipt" ? "unrelated" : missionId,
      revisionDigest: world.request.revisionDigest,
      state:
        world.effect === "wrong-receipt" ? ("paused" as const) : world.effect,
    };
  }
  const bindings = bindAutomationLifecycle(
    {
      async get(missionId) {
        operations.push({ action: "get", missionId });
        const observed = world.reads[readCount++];
        if (observed === "offline" || observed === undefined)
          throw new Error("Readback is unavailable.");
        return structuredClone(observed);
      },
      pause: (missionId) => transition("pause", missionId),
      resume: (missionId) => transition("resume", missionId),
    },
    world.request,
  );
  return { bindings, audit: () => structuredClone(operations) };
}

export function verifyAutomationLifecycle(
  world: World,
  report: LifecycleReport,
  operations: ReturnType<
    ReturnType<typeof createAutomationLifecycleFixture>["audit"]
  >,
) {
  const steps = world.effect
    ? ["get", "get", world.request.action, "get"]
    : world.reads.length === 1
      ? ["get"]
      : ["get", "get", "get"];
  return (
    operations.length === steps.length &&
    operations.every(
      ({ action, missionId }, index) =>
        action === steps[index] && missionId === world.request.missionId,
    ) &&
    report?.missionId === world.expected.missionId &&
    report?.status === world.expected.status &&
    report?.state === world.expected.state &&
    report?.revisionDigest === world.expected.revisionDigest
  );
}
