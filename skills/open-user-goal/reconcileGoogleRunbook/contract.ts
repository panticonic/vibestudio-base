export type RunbookDocument = { path: string; version: string; text: string };
export type RunbookBasis = { documents: RunbookDocument[]; authorization: string; currentRevision: string };
export type RunbookDecision = { action: "revise" | "held" | "review-only"; path: string | null; approval: string | null; reason: string };
export type RunbookWrite = { status: "written" | "changed" | "held"; path: string | null; version: string | null };
