export type GoalCandidate = { url: string; title?: string; snippet?: string };
export type GoalSearchResult = {
  query: string;
  sources: GoalCandidate[];
  error?: string;
};
export type ResearchGoalReport = {
  question: string;
  status: "answered" | "insufficient";
  statements: {
    text: string;
    cites: { url: string; title: string; retrieved: string; published: string | null; quote: string }[];
  }[];
  notRead: { url: string; reason: string }[];
  rejected: number;
};
export type WorkspaceRevision = { path: string; version: string; text: string };
export type WorkspaceWrite =
  | { status: "written"; version: string }
  | { status: "changed" | "unavailable" };
export type WorkspaceEditReport =
  | { status: "edited"; path: string; version: string }
  | { status: "blocked"; reason: string };
export type UserGoalReport =
  | { status: "answered" | "insufficient"; research: ResearchGoalReport }
  | { status: "edited"; path: string; version: string; research: ResearchGoalReport }
  | WorkspaceEditReport
  | BrowserGoalReport
  | WorkspaceSuiteReport
  | { status: "workspace-skill-reviewed"; skill: "news" | "spectrolite" | "google" | "gmail" | "personal" | "operator" | "recovery" | "publication" | "pdf"; outcome: unknown };

export type OpenSuiteRoute = { id: string; target: string; suite: string; purpose: string; runtime: "native" | "workerd" | "browser"; stateHash: string };
export type OpenSuiteChoice = {
  routeId: string;
  mode: "inspect" | "verify";
  file: string | null;
  testName: string | null;
};
export type OpenSuiteRequest = {
  operationId: string;
  goal: string;
  target: string;
  suite: string;
  mode: "inspect" | "verify";
  file: string | null;
  testName: string | null;
};
export type WorkspaceSuiteReport =
  | { status: "suite-reviewed"; selection: OpenSuiteChoice; review: unknown }
  | { status: "blocked"; reason: string };

export type BrowserRow = { label: string; state: string; detail: string; controls: { id: string; label: string }[] };
export type BrowserView = { heading: string; revision: string; rows: BrowserRow[] };
export type BrowserDecision =
  | { kind: "act"; control: string }
  | { kind: "report"; labels: string[] }
  | { kind: "blocked"; reason: string };
export type BrowserGoalReport =
  | { status: "observed" | "changed"; revision: string; rows: { label: string; state: string; detail: string }[] }
  | { status: "blocked"; reason: string };
