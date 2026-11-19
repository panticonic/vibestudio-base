import { bindChannelMembership } from "../agents/channelMembershipBoundary.js";
import type {
  AttachOptions,
  ChannelAgentReport,
} from "../agents/channel-membership/types.js";
import type { MembershipWorld } from "./worlds.js";

export type MembershipEffect =
  | { kind: "attach"; options: AttachOptions }
  | { kind: "detach" };

export function membershipFixture(world: MembershipWorld) {
  const effects: MembershipEffect[] = [];
  let reads = 0;
  async function effect(value: MembershipEffect) {
    effects.push(value);
    if (world.response === "transport-lost")
      throw new Error("Roster operation response lost");
    if (!world.response)
      throw new Error("This case has no initial effect response");
    return { ...world.response };
  }
  const services = bindChannelMembership(world.request, {
    async roster() {
      const row = world.roster[reads++];
      if (!row) throw new Error("Unexpected additional roster read");
      return { ...row };
    },
    add: (options) => effect({ kind: "attach", options }),
    remove: () => effect({ kind: "detach" }),
  });
  return { services, evidence: () => ({ effects: [...effects], reads }) };
}

export function checkMembershipOutcome(
  world: MembershipWorld,
  result: ChannelAgentReport,
  evidence: ReturnType<ReturnType<typeof membershipFixture>["evidence"]>,
): boolean {
  if (
    result.status !== world.expected.status ||
    result.state !== world.expected.state ||
    result.participantId !== world.expected.participantId ||
    evidence.reads !== world.roster.length ||
    evidence.effects.length !== world.expectedWrites
  )
    return false;
  return evidence.effects.every((effect) => {
    if (effect.kind !== world.request.action) return false;
    if (effect.kind === "detach") return true;
    return (
      effect.options.replay === world.request.options?.replay &&
      effect.options.response === world.request.options?.response &&
      effect.options.modelRef === world.request.options?.modelRef
    );
  });
}
