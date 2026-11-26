import completeDelivery from "./completeDelivery.nl";
import bindReport from "./bindReport.js";
import type {
  LocalDeliveryDecision,
  LocalDeliveryReport,
  LocalObservation,
} from "../types.js";

/** Exact native recipient and settlement boundary; semantic work chooses whether it is requested. */
export default async function settleLocalDelivery(
  goal: string,
  observations: LocalObservation[],
  decision: LocalDeliveryDecision,
): Promise<LocalDeliveryReport> {
  const report = bindReport(decision, observations);
  if (!decision.sendRoomId) return report;
  const target = observations.find(
    (row) => row.room.id === decision.sendRoomId,
  );
  if (!target || !target.room.maySend || target.resolution?.kind !== "ref")
    return {
      ...report,
      status: "held",
      reason: "The requested follow-up lacks one exact owned recipient.",
    };
  const delivery = await completeDelivery(goal, observations, target),
    readback = delivery.readback;
  const confirmed =
    readback?.acknowledged &&
    readback.roomId === target.room.id &&
    readback.recipientRef === target.resolution.ref;
  return {
    ...report,
    status: confirmed ? "delivered" : "unconfirmed",
    delivery,
  };
}
