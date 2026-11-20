export * from "./workspace/types.js";

export type SpecialistChoice = { handle: string | null; reason: "chosen" | "no-suitable-specialist" | "ambiguous-specialist" };
export type RosterState = { status: string; state: "member" | "absent" | "conflict" | "unavailable"; participantId: string | null };
