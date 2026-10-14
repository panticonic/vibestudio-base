import { afterEach, describe, expect, it } from "vitest";
import { successfulTestRpcFetch } from "@vibestudio/durable/test-utils";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";
import type { RpcClient } from "@vibestudio/rpc";
import {
  createRegistry,
  MemoryStorage,
  type Conversation,
  type Harness,
  type TaskId,
} from "@panticonic/pi-durable";
import { BACKGROUND_CONTEXT } from "@panticonic/pi-chord/context";
import type { Context } from "@panticonic/pi-chord";
import { createModels } from "@panticonic/pi-ai";
import type { ParticipantDescriptor } from "@workspace/harness";
import { DEFAULT_AGENT_MODEL_REF } from "@workspace/model-catalog/catalog";
import { nativeCredentialProviderOptions } from "./native-credential-presentation.js";
import { createProtectedNativeModels } from "./native-model-provider.js";
import { materializeModel } from "./model-spec.js";
import { AgentVesselBase, type AgentSettings } from "./agent-vessel.js";
import { createNativeVesselTestDO } from "./testing/native-vessel.js";
import { openBoundAgentSession } from "./native-agent-session.js";

const models = createProtectedNativeModels();
const selected = nativeCredentialProviderOptions(
  models,
  (ref) => {
    const split = ref.indexOf(":");
    return materializeModel(ref.slice(0, split), ref.slice(split + 1), null);
  },
  DEFAULT_AGENT_MODEL_REF,
).find((option) => option.providerId !== "openai-codex")!;
const databases: { close(): void }[] = [];
const credential = {
  id: "credential:one",
  label: "Test provider",
  audience: [{ url: selected.modelBaseUrl, match: "path-prefix" }],
  injection: {
    type: "header",
    name: "authorization",
    valueTemplate: "Bearer {token}",
  },
  scopes: [],
  lifecycle: { state: "active", canRefresh: true },
};
const sessions: Harness[] = [];
afterEach(async () => {
  await Promise.all(
    sessions.splice(0).map((session) => session.close(BACKGROUND_CONTEXT)),
  );
  for (const db of databases.splice(0)) db.close();
});
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
class CredentialVessel extends AgentVesselBase {
  protected override getParticipantInfo(): ParticipantDescriptor {
    return { type: "agent", name: "Credentials", handle: "credentials" };
  }
  updates = 0;
  replacements = 0;
  pendingTask = 1 as TaskId;
  session: Harness | null = null;
  conversation: Conversation | null = null;
  protected override async agentSession(_context?: Context) {
    if (!this.session)
      throw new Error(
        "Fixture session was not requested before credentials completed",
      );
    return this.session;
  }
  protected override async admittedNativeChannelConversation() {
    return this.conversation;
  }
  body: (signal?: AbortSignal) => Promise<unknown> = async () => credential;
  protected override get rpc(): RpcClient {
    return schemaRpcClientMock(
      {
        call: async (_target, method, _args, options) => {
          if (method === "credentials.connect")
            return this.body(options!.signal!);
          return undefined;
        },
      },
      "do:workers/test:CredentialVessel:one",
    );
  }
  protected override nativeReasoningChannelIds() {
    return [];
  }
  protected override async credentialWaitingNativeGeneration() {
    return this.pendingTask;
  }
  protected override async reprepareNativeGeneration(
    _channel: string,
    expected: TaskId,
  ) {
    if (this.pendingTask !== expected) return false;
    this.replacements++;
    return true;
  }
  protected override async updateSettings(patch: Partial<AgentSettings>) {
    this.updates++;
    return super.updateSettings(patch);
  }
  selectedModel() {
    return this.getAgentSettings().model;
  }
  connect(signal?: AbortSignal) {
    return this.handleStandardAgentMethodCall(
      "channel:one",
      "connectModelCredential",
      {
        providerId: selected.providerId,
        modelRef: selected.modelRef,
      },
      signal,
    );
  }
}
async function fixture() {
  const fixture = await createNativeVesselTestDO(
    CredentialVessel,
    {
      __objectKey: "one",
      RPC_FETCH: successfulTestRpcFetch,
      WORKER_SOURCE: "workers/test",
      WORKER_CLASS_NAME: "CredentialVessel",
    },
    {
      props: {
        nativeOwner: null,
        stateArgs: null,
        image: {
          effectiveVersion: "a".repeat(64),
          sourceRef: `state:${"b".repeat(64)}`,
        },
      },
    },
  );
  databases.push(fixture.db);
  return fixture.instance;
}
describe("credential method selection ownership", () => {
  it("accepts credential connection without an optional caller signal", async () => {
    const vessel = await fixture();
    vessel.session = await openBoundAgentSession(
      new MemoryStorage(),
      {
        runtimeId: "do:workers/test:CredentialVessel:one",
        contextId: "context:one",
        incarnation: "storage:one",
        authoritySessionId: "lifetime:one",
        generation: 1,
      },
      {
        models: createModels(),
        registry: createRegistry(),
        publishWake: async () => {},
      },
      BACKGROUND_CONTEXT,
    );
    sessions.push(vessel.session);
    vessel.conversation = await vessel.session.root(BACKGROUND_CONTEXT);
    expect(await vessel.connect()).toMatchObject({ result: { credential } });
    expect(vessel.selectedModel()).toBe(selected.modelRef);
  });
  it("connects first and never retargets a newer task that appeared during sign-in", async () => {
    const vessel = await fixture();
    const entered = gate(),
      release = gate();
    vessel.body = async () => {
      entered.resolve();
      await release.promise;
      return credential;
    };
    vessel.session = await openBoundAgentSession(
      new MemoryStorage(),
      {
        runtimeId: "do:workers/test:CredentialVessel:one",
        contextId: "context:one",
        incarnation: "storage:one",
        authoritySessionId: "lifetime:one",
        generation: 1,
      },
      {
        models: createModels(),
        registry: createRegistry(),
        publishWake: async () => {},
      },
      BACKGROUND_CONTEXT,
    );
    sessions.push(vessel.session);
    vessel.conversation = await vessel.session.root(BACKGROUND_CONTEXT);
    const operation = vessel.connect(new AbortController().signal);
    await entered.promise;
    expect(vessel.updates).toBe(0);
    expect(vessel.replacements).toBe(0);
    vessel.pendingTask = 2 as TaskId;
    release.resolve();
    expect(await operation).toMatchObject({ result: { resumed: false } });
    expect(vessel.selectedModel()).toBe(selected.modelRef);
    expect(vessel.replacements).toBe(0);
    expect(vessel.pendingTask).toBe(2);
  });
  it("preserves selection and the captured original wait when connection fails", async () => {
    const vessel = await fixture();
    const original = vessel.selectedModel();
    const error = new Error("Original provider connection failure");
    vessel.body = async () => {
      throw error;
    };
    await expect(vessel.connect(new AbortController().signal)).rejects.toBe(
      error,
    );
    expect(vessel.selectedModel()).toBe(original);
    expect(vessel.pendingTask).toBe(1);
    expect(vessel.updates).toBe(0);
    expect(vessel.replacements).toBe(0);
  });
  it("joins explicit cancelled connection without revising selection or preparation", async () => {
    const vessel = await fixture();
    const original = vessel.selectedModel();
    const entered = gate(),
      release = gate();
    vessel.body = async () => {
      entered.resolve();
      await release.promise;
      return credential;
    };
    const controller = new AbortController();
    const operation = vessel.connect(controller.signal);
    await entered.promise;
    const reason = new Error("Explicit setup cancellation");
    controller.abort(reason);
    release.resolve();
    await expect(operation).rejects.toBe(reason);
    expect(vessel.selectedModel()).toBe(original);
    expect(vessel.updates).toBe(0);
    expect(vessel.replacements).toBe(0);
  });
});
