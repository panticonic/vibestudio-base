export type BoardCard = {
  id: string;
  title: string;
  list: string;
  archived: boolean;
  summary: string;
  checklist: string[];
  attachments: string[];
};

export type LegacyBoard = {
  id: string;
  title: string;
  edition: string;
  revision: string;
};

export type MigrationView = {
  board: LegacyBoard;
  cards: BoardCard[];
};

export type MigrationApproval = {
  boardId: string;
  revision: string;
  target: string;
  authorizedCardIds: string[];
} | null;

export type MigrationBasis = {
  approval: MigrationApproval;
  target: string;
  existing: BoardCard[] | null;
};

export type MigrationSelection = {
  target: string;
  cards: BoardCard[];
};

export type BoardMigrationReceipt = {
  target: string;
  boardId: string;
  revision: string;
  cards: BoardCard[];
};

export type BoardMigrationOutcome = { disposition: "audit" | "held" | "retained" | "existing"; receipt: BoardMigrationReceipt | null; reason: string };

export type BoardInquiry={view:MigrationView|null;basis:MigrationBasis|null;selection:MigrationSelection|null};
