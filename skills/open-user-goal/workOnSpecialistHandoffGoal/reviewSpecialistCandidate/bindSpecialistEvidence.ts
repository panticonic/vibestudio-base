import bindObservedSpecialistResult from "../bindObservedSpecialistResult.js";
import type {
  SpecialistIndex,
  SpecialistChoice,
  SpecialistSnapshot,
  MembershipWitness,
  ReceiptJoin,
  OriginalArtifact,
  SpecialistEvidence,
} from "../types.js";
/** Bind only actual selected-scope observations; native readers retain authority over original bytes. */
export default function bindSpecialistEvidence(
  index: SpecialistIndex,
  choice: SpecialistChoice,
  current: SpecialistSnapshot,
  membership: MembershipWitness | null,
  joined: ReceiptJoin,
  original: OriginalArtifact | null,
): SpecialistEvidence {
  if (current.channelId !== index.scope.channelId)
    throw Error("Specialist evidence crossed the owned channel");
  if (
    membership &&
    (membership.request.channelId !== index.scope.channelId ||
      membership.request.contextId !== index.scope.contextId ||
      membership.request.handle !== choice.handle ||
      membership.request.action !== "inspect")
  )
    throw Error("Specialist membership differs from the selected owned scope");
  const result = bindObservedSpecialistResult(
    index,
    choice,
    current,
    joined,
    original,
  );
  return { current, membership, joined, original, result: result ?? null };
}
