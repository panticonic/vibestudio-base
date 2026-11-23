export type { MobileAssignment } from "./mobile/types.js";
import type { MobileAssignment, MobileReport } from "./mobile/types.js";

export type AndroidDeliveryScope = {
  workspace: string;
  deviceId: string | null;
  deviceKind: "disposable-emulator";
  note: string;
};
export type AndroidDeliveryOutcome = MobileReport;
