import { describe, expect, it } from "vitest";
import { createNativeVesselTestDO } from "@workspace/agentic-do/testing/native-vessel";
import { SilentAgentWorker } from "./index.js";
class TestSilentAgentWorker extends SilentAgentWorker {
  publishPolicy() {
    return this.getPublishPolicy("ch-1");
  }
}
describe("SilentAgentWorker", () => {
  it("selects native notify-only publication", async () => {
    const resource = await createNativeVesselTestDO(TestSilentAgentWorker);
    try {
      expect(resource.instance.publishPolicy()).toBe("notify-only");
    } finally {
      try {
        const released = await resource.instance.releaseForLifecycle({
          epoch: "test-end",
          mode: "suspend",
          reason: "test",
          deadlineMs: 0,
        });
        expect(released.status).toBe("ready");
      } finally {
        resource.db.close();
      }
    }
  });
});
