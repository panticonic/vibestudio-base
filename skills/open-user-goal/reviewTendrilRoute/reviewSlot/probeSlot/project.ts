import { tendrilRouteRead } from "natlang:services";
import type { TendrilRouteProbe, TendrilRouteSlot, TendrilRouteSnapshot } from "../../../types.js";

/** Forward typed observed records to their exact native coordinates. */
export default async function project(board: TendrilRouteSnapshot, slot: TendrilRouteSlot): Promise<TendrilRouteProbe> {
  const selected = board.slots.find(candidate => candidate.id === slot.id);
  if (!selected) throw new Error("The chosen slot is not in the observed board");
  return tendrilRouteRead.probe(board.id, selected.id, board.revision);
}
