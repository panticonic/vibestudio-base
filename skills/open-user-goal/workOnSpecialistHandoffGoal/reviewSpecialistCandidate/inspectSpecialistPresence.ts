import manageChannelAgent from "./inspectSpecialistPresence/agents/manageChannelAgent.nl";
import type {
  MembershipWitness,
  SpecialistChoice,
  SpecialistIndex,
  SpecialistMembershipRequest,
} from "../types.js";
/** Narrow native boundary: this operation can inspect the selected exact member only. */
export default async function inspectSpecialistPresence(
  goal: string,
  index: SpecialistIndex,
  choice: SpecialistChoice,
): Promise<MembershipWitness | null> {
  if (!choice.handle) return null;
  const request: SpecialistMembershipRequest = {
    goal,
    channelId: index.scope.channelId,
    contextId: index.scope.contextId,
    handle: choice.handle,
    action: "inspect",
    options: null,
  };
  const report = await manageChannelAgent(request);
  if (report.status !== "observed" && report.status !== "held")
    throw Error(
      "A specialist inspection returned a membership-changing disposition",
    );
  return { request, report: { ...report, status: report.status } };
}
