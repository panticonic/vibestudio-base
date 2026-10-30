declare module "natlang:services" {
  /** Read-only inspectors over the workspace's canonical conversation store. */
  export namespace gad {
    /** One compact integrity and in-flight activity snapshot for an agent channel. */
    function inspectAgentHealth(input: {
      channelId: string;
      branchId?: string | null;
      limit?: number | null;
      envelopeLimit?: number | null;
      storageLimit?: number | null;
      rowByteLimit?: number | null;
    }): Promise<import("./types.js").AgentHealth>;
  }
}
