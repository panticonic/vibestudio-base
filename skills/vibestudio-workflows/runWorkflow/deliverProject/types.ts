export type ContentFact = { id: string; text: string };

export type ContentRequest = {
  goal: string;
  audience: string;
  facts: ContentFact[];
  documentRoles: string[];
};

export type ContentReview = {
  ready: boolean;
  coveredRoles: string[];
  unsupportedClaims: string[];
  blockers: string[];
  reason: string;
};

export type Brief = {
  audienceNeeds: string[];
  constraints: string[];
  ambiguities: string[];
};
export type PagePlan = {
  path: string;
  role: string;
  factIds: string[];
  purpose: string;
};
export type Plan = { pages: PagePlan[]; rationale: string; blockers: string[] };
export type Draft = { path: string; text: string };
export type Snapshot = {
  contextId: string;
  repoPath: string;
  repositoryId: string | null;
  head: string;
  mainEventId: string;
  committedEventId: string;
  clean: boolean;
  files: Draft[];
};
