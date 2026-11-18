declare module "natlang:services" {
  export const panelRepair: {
    observe(): Promise<
      import("./runWorkflow/repairPanel/types.js").Observation
    >;
    interact(
      generation: string,
      interaction: import("./runWorkflow/repairPanel/types.js").Interaction,
    ): Promise<{
      observations: import("./runWorkflow/repairPanel/types.js").InteractionObservation[];
    }>;
    listSource(revision: string): Promise<string[]>;
    readSource(
      revision: string,
      paths: string[],
    ): Promise<import("./runWorkflow/repairPanel/types.js").SourceFile[]>;
  };
  export const panelRepairEdit: {
    apply(
      revision: string,
      edits: import("./runWorkflow/repairPanel/types.js").Edit[],
    ): Promise<{ revision: string }>;
    build(
      revision: string,
    ): Promise<import("./runWorkflow/repairPanel/types.js").Build>;
    rebuild(
      revision: string,
    ): Promise<import("./runWorkflow/repairPanel/types.js").Observation>;
  };
}

declare module "natlang:services" {
  export const unitRepair: {
    observe(): Promise<import("./runWorkflow/repairUnit/types.js").Evidence>;
    listSource(revision: string): Promise<string[]>;
    readSource(
      revision: string,
      paths: string[],
    ): Promise<import("./runWorkflow/repairUnit/types.js").SourceFile[]>;
  };
  export const unitRepairEdit: {
    apply(
      revision: string,
      edits: import("./runWorkflow/repairUnit/types.js").Edit[],
    ): Promise<{ revision: string }>;
    build(
      revision: string,
    ): Promise<import("./runWorkflow/repairUnit/types.js").Evidence>;
    test(
      revision: string,
    ): Promise<import("./runWorkflow/repairUnit/types.js").Evidence>;
  };
}

declare module "natlang:services" {
  export const projectWorkspace: {
    observe(): Promise<
      import("./runWorkflow/deliverProject/types.js").Snapshot
    >;
  };
  export const projectWorkspaceEdit: {
    prepare(
      head: string,
    ): Promise<import("./runWorkflow/deliverProject/types.js").Snapshot>;
    writeDocuments(
      head: string,
      documents: import("./runWorkflow/deliverProject/types.js").Draft[],
    ): Promise<import("./runWorkflow/deliverProject/types.js").Snapshot>;
    commit(
      head: string,
      message: string,
    ): Promise<{ eventId: string; head: string }>;
  };
}

declare module "natlang:services" {
  export const workspaceIntegration: {
    observe(): Promise<
      import("./runWorkflow/integrateWorkspace/types.js").Snapshot
    >;
    apply(
      head: string,
      edits: import("./runWorkflow/integrateWorkspace/types.js").Edit[],
    ): Promise<{ head: string }>;
    merge(
      head: string,
      decisions: import("./runWorkflow/integrateWorkspace/types.js").Decision[],
    ): Promise<{ head: string }>;
  };
}

declare module "natlang:services" {
  export const ownedOperations: import("./runWorkflow/operate/types.js").OwnedOperations;
}

declare module "natlang:services" {
  export const localMessagingRead: {
    inspect(
      recipientPhrase: string,
    ): Promise<import("./runWorkflow/routeMessage/types.js").Snapshot>;
    inspectDelivery(
      receipt: import("./runWorkflow/routeMessage/types.js").Receipt | null,
    ): Promise<import("./runWorkflow/routeMessage/types.js").DeliveryEvidence>;
  };
  export const localMessagingSend: {
    send(
      revision: string,
      recipientPhrase: string,
      ref: string,
      content: string,
    ): Promise<import("./runWorkflow/routeMessage/types.js").Receipt>;
  };
}
