import { afterEach, expect, it, vi } from "vitest";
import { createRpcFs } from "@workspace/runtime/worker/rpc-fs";
import { createNativeVesselTestDO } from "./testing/native-vessel.js";
import { executeTool } from "@workspace/harness/testing/native-tool";
import type { ParticipantDescriptor } from "@workspace/harness";
import { AgentWorkerBase } from "./agent-worker-base.js";
import { ChannelClient } from "./channel-client.js";

class MediaAgent extends AgentWorkerBase {
  readonly send = vi.fn(
    async (..._args: Parameters<ChannelClient["send"]>) => {},
  );
  protected override getParticipantInfo(): ParticipantDescriptor {
    return { name: "Artist", type: "agent", handle: "artist", metadata: {} };
  }
  protected override async addresseeContext() {
    return { channelId: "chat", roster: [] };
  }
  protected override createChannelClient() {
    const client = new ChannelClient(this.rpc, {
      source: "workers/pubsub-channel",
      className: "PubSubChannel",
      objectKey: "chat",
    });
    client.send = this.send;
    return client;
  }
  notify() {
    vi.spyOn(this.subscriptions, "getParticipantId").mockReturnValue("artist");
    return this.createNotifyTool("chat", createRpcFs(this.rpc), {
      invocationId: "notify-media",
      commandId: "notify-media",
      rpc: this.rpc,
    });
  }
}
const databases: Array<{ close(): void }> = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
it("shares asset IDs with escaped accessible media and one destination ownership declaration", async () => {
  const { instance, db } = await createNativeVesselTestDO(MediaAgent);
  databases.push(db);
  const tool = instance.notify();
  await executeTool(tool, {
    content: "The illustration",
    images: [
      {
        assetId: "asset-one",
        alt: 'A fox "by the river"',
        caption: "Opening scene",
      },
      { assetId: "asset-one", alt: "A second view" },
    ],
  });
  expect(instance.send).toHaveBeenCalledOnce();
  const [author, id, content, options] = instance.send.mock.calls[0]!;
  expect(author).toBe("artist");
  expect(id).toBe("say:notify-media");
  expect(content).toContain('<Image assetId={"asset-one"}');
  expect(content).toContain(JSON.stringify('A fox "by the river"'));
  expect(options?.metadata?.["imageAssetIds"]).toEqual(["asset-one"]);
  expect(options?.attachments).toBeUndefined();
});
