export type ArchitectureOwner =
  | "semantic-vcs"
  | "durable-channel"
  | "durable-provider"
  | "panel-state"
  | "build-projection"
  | "rpc-adapter";
export type ArchitectureConcern =
  | "workspace-history"
  | "conversation-history"
  | "mission-record";
export type ArchitectureRequest = {
  goal: string;
  operationId: string;
  concern: ArchitectureConcern;
  proposedOwner: ArchitectureOwner;
};
export type ArchitectureRoute = {
  receipt: string;
  contextId: string;
  revision: string;
  protocol: string;
  name: string;
  source: string;
  receiver: {
    kind: "durable-object" | "worker";
    address: string;
    className: string | null;
    creatorScoped: boolean;
  };
};
export type ArchitectureDeclaration = {
  routeReceipt: string;
  source: string;
  revision: string;
  hash: string;
  name: string;
  protocols: string[];
  className: string | null;
  creatorScoped: boolean;
};
export type ArchitectureProvider = {
  route: ArchitectureRoute;
  declaration: ArchitectureDeclaration | null;
  consistent: boolean;
};
export type ArchitectureOwnership = {
  owner: ArchitectureOwner;
  proposedOwner: ArchitectureOwner;
  aligned: boolean;
};
export type ArchitectureReport = {
  provider: ArchitectureProvider;
  ownership: ArchitectureOwnership;
  decision: "review-declaration" | "retain-boundary" | "move-state-to-owner";
};
