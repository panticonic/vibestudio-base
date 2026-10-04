import { AiChatWorker } from "../agent-worker/ai-chat-worker.js";
import type { ParticipantDescriptor } from "@workspace/harness";
import type { ToolRegistration } from "@panticonic/pi-durable";

type SilentAgentConfig = {
  handle?: string;
  name?: string;
  allowedTools?: string[];
};

function asSilentAgentConfig(config: unknown): SilentAgentConfig {
  return config && typeof config === "object"
    ? (config as SilentAgentConfig)
    : {};
}

export class SilentAgentWorker extends AiChatWorker {
  static override schemaVersion = AiChatWorker.schemaVersion;

  constructor(
    ctx: ConstructorParameters<typeof AiChatWorker>[0],
    env: unknown,
  ) {
    super(ctx, env);
    void this.setOwnTitle("Silent Agent");
  }

  protected override getParticipantInfo(
    channelId: string,
    config?: unknown,
  ): ParticipantDescriptor {
    const base = super.getParticipantInfo(channelId, config);
    const cfg = asSilentAgentConfig(config);
    return {
      ...base,
      handle: cfg.handle ?? "silent-agent",
      name: cfg.name ?? "Silent Agent",
    };
  }

  /** Native model responses stay private; the explicit notify tool publishes
   * user-facing messages. Native task/invocation evidence remains inspectable. */
  protected override getPublishPolicy(
    _channelId: string,
  ): "all" | "turn-final" | "notify-only" {
    return "notify-only";
  }

  protected override async getTools(
    channelId: string,
  ): Promise<ToolRegistration[]> {
    const cfg = asSilentAgentConfig(this.subscriptions.getConfig(channelId));
    // The generalized `notify` tool is provided by AgentWorkerBase.getTools.
    const tools = await super.getTools(channelId);
    if (!cfg.allowedTools || cfg.allowedTools.length === 0) return tools;
    const allowed = new Set([...cfg.allowedTools, "notify"]);
    return tools.filter((tool) => allowed.has(tool.name));
  }
}

export default {
  fetch(_req: Request) {
    return new Response("silent-agent-worker DO service");
  },
};
