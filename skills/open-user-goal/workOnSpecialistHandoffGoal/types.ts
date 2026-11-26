import type {SpecialistSnapshot,MembershipWitness,ReceiptJoin,OriginalArtifact,Result} from "./workspace/types.js";
export * from "./workspace/types.js";

export type SpecialistChoice = { handle: string | null; reason: "chosen" | "no-suitable-specialist" | "ambiguous-specialist" };
export type RosterState = { status: string; state: "member" | "absent" | "conflict" | "unavailable"; participantId: string | null };

export type SpecialistEvidence = {current: SpecialistSnapshot; membership: MembershipWitness | null; joined: ReceiptJoin; original: OriginalArtifact | null; result: Result | null};
export type SpecialistHandoffIntent = {action: "hold" | "report" | "stage"; explanation: string};
