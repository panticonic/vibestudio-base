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
