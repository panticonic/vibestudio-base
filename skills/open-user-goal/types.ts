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
  | { status: "workspace-skill-reviewed"; skill: "capabilityPlan"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "vaultWork"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "googleSetup"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "clientDiagnostics"; outcome: unknown }
  | { status: "answered" | "insufficient"; research: ResearchGoalReport }
  | { status: "edited"; path: string; version: string; research: ResearchGoalReport }
  | WorkspaceEditReport
  | BrowserGoalReport
  | WorkspaceSuiteReport
  | { status: "workspace-skill-reviewed"; skill: "news" | "spectrolite" | "google" | "gmail" | "googleHandoff" | "calendar" | "personal" | "personalArtifacts" | "personalHistory" | "personalAutomation" | "operator" | "localReconciliation" | "diagnostics" | "ownedTaskRecovery" | "unitRollout" | "localDelivery" | "recovery" | "publication" | "ownedPreview" | "visualRecovery" | "pdf"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "terminalHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "evalHandoff"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "programRun"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "browserMigration"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "authoring"; outcome: unknown }
  | { status: "workspace-skill-reviewed"; skill: "pdfVault"; outcome: PdfVaultOutcome };

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

export type PdfVaultDecision =
  | { status: "hold"; reason: string }
  | { status: "use-evidence"; citationIndices: number[] };
export type PdfVaultHandoff =
  | { status: "hold"; reason: string }
  | {
    status: "bound";
    source: { document: string; digest: string; citations: { page: number; line: number; quote: string }[] };
    directive: string;
  };

export type PdfVaultOutcome = { pdf: unknown; handoff: PdfVaultHandoff; vault: unknown };
