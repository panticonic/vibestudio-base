import { afterEach, describe, expect, it } from "vitest";
import { createNativeVesselTestDO } from "@workspace/agentic-do/testing/native-vessel";
import type { ParticipantDescriptor } from "@workspace/harness";

import { AiChatWorker } from "./ai-chat-worker.js";
import { SilentAgentWorker } from "../silent-agent-worker/index.js";

const databases = new Set<{ close(): void }>();
afterEach(() => {
  for (const database of databases) database.close();
  databases.clear();
});
async function nativeWorker<T>(
  ...args: Parameters<typeof createNativeVesselTestDO<T>>
) {
  const fixture = await createNativeVesselTestDO<T>(...args);
  databases.add(fixture.db);
  return fixture.instance;
}

const STANDARD_METHODS = [
  "pause",
  "resume",
  "connectModelCredential",
  "setModel",
  "setThinkingLevel",
  "setApprovalLevel",
  "setRespondPolicy",
  "getAgentSettings",
  "getModelExecutionEvidence",
  "getDebugState",
];

class ContractAiChatWorker extends AiChatWorker {
  participant(): ParticipantDescriptor {
    return this.getParticipantInfo("ch-1");
  }
}

class ContractSilentAgentWorker extends SilentAgentWorker {
  participant(): ParticipantDescriptor {
    return this.getParticipantInfo("ch-1");
  }
}

describe("agent worker contracts", () => {
  it.each([
    ["AI chat", async () => await nativeWorker(ContractAiChatWorker)],
    ["Silent", async () => await nativeWorker(ContractSilentAgentWorker)],
  ] satisfies Array<
    [string, () => Promise<{ participant(): ParticipantDescriptor }>]
  >)(
    "%s exposes the standard agent control methods",
    async (_name, createWorker) => {
      const methodNames = (await createWorker())
        .participant()
        .methods?.map((method) => method.name);

      expect(methodNames).toEqual(expect.arrayContaining(STANDARD_METHODS));
    },
  );
});
