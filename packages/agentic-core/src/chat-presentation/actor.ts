/**
 * How a chat surface names the actor behind a lineage fact ("<who> forked this
 * conversation"). One vocabulary for every surface: the person themself is
 * "You", a named participant is their display name, and an actor without a
 * name is described by its role. A raw principal id is never shown.
 */

export interface PresentableActor {
  kind: string;
  id: string;
  participantId?: string;
  displayName?: string;
}

/**
 * `selfIds` is every identity the local person acts under: their channel
 * participant id and the RPC principal their calls are attributed to. The two
 * differ on every surface, and the durable record carries the principal.
 */
export function presentActor(
  actor: PresentableActor,
  selfIds: ReadonlyArray<string | null | undefined>
): string {
  if (isSelfActor(actor, selfIds)) return "You";
  const name = actor.displayName?.trim();
  if (name) return name;
  switch (actor.kind) {
    case "agent":
      return "An agent";
    case "system":
      return "The system";
    default:
      return "Someone";
  }
}

export function isSelfActor(
  actor: PresentableActor,
  selfIds: ReadonlyArray<string | null | undefined>
): boolean {
  return selfIds.some((id) => !!id && (id === actor.id || id === actor.participantId));
}
