export type WorkspaceRevision =
  | { kind: "event"; eventId: string }
  | { kind: "application"; applicationId: string };
export type SkillSourceRevision = {
  state: WorkspaceRevision;
  repositoryId: string;
  fileId: string;
  contentHash: string;
};
export type SkillRow = {
  name: string;
  description: string;
  dirPath: string;
  skillPath: string;
};
export type CurrentMemo = { title: string; text: string; sha256: string };
export type PlanningState = {
  memo: CurrentMemo | null;
  skillIndex: SkillRow[];
  skillIndexComplete: boolean;
  sourceRevision: WorkspaceRevision;
  stageAuthorized: boolean;
};
export type CatalogQuery = {
  query: string;
  surface: "service" | "runtime" | "workspace";
};
export type RequestedDocs = { queries: CatalogQuery[]; inventory: boolean };
export type DocHit = {
  id: string;
  surface: string;
  qualifiedName: string;
  title: string;
  description?: string;
};
export type DetailedCapability = DocHit & {
  sha256: string;
  argumentNames: string[];
  signature: string | null;
  argsSchema: unknown;
  returnsSchema: unknown;
  omittedSchemas: ("args" | "returns")[];
  access: unknown;
};
export type ServiceOverview = {
  serviceCount: number;
  serviceNames: string[];
  surfaces: { surface: string; count: number }[];
};
export type CapabilityEvidence = {
  entries: DetailedCapability[];
  overview: ServiceOverview | null;
};
export type KnowledgeExcerpt = { heading: string; text: string };
export type InstalledKnowledge = {
  skillPath: string;
  sha256: string;
  revision: SkillSourceRevision;
  excerpts: KnowledgeExcerpt[];
};
export type KnowledgeCitation = {
  skillPath: string;
  sha256: string;
  revision: SkillSourceRevision;
  quote: string;
};
export type MissingCapability = { kind: "method" | "skill"; name: string };
export type PlanStep = {
  id: string;
  sha256: string;
  argumentNames: string[];
  signature: string | null;
  purpose: string;
};
export type CapabilityPlan = {
  status: "ready" | "hold";
  sourceRevision: WorkspaceRevision;
  steps: PlanStep[];
  rationale: string;
  knowledge: KnowledgeCitation[];
  missing: MissingCapability[];
  memoDisposition: "none" | "current" | "stale" | "conflicting";
  overview: ServiceOverview | null;
};
export type CapabilityHandoff = { path: string; bytes: number; sha256: string };
export type CapabilityGoalReport = {
  plan: CapabilityPlan;
  handoff: CapabilityHandoff | null;
};

/** Application judgments; immutable interface/source witnesses are joined from native observations. */
export type CapabilityPlanIntent = {
  status: "ready" | "hold";
  steps: { id: string; purpose: string }[];
  rationale: string;
  knowledgePaths: string[];
  missing: MissingCapability[];
  memoDisposition: "none" | "current" | "stale" | "conflicting";
  includeOverview: boolean;
};
