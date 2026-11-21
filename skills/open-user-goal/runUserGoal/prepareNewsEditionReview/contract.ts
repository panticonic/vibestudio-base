export type EditorDesk = {
  id: string;
  revision: string;
  title: string;
  topic: string;
  format: "stats" | "checklist" | "timeline";
  facts: string;
  grant: "private-draft" | "inspect" | "withdrawn";
};
export type EditorPacketPlan = { action: "packet" | "review-only" | "hold"; format: string; revision: string; reason: string };
export type EditorPacketReceipt = { path: string; bytes: number; sha256: string };
