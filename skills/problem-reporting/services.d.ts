declare module "natlang:services" {
  /** Read-only inspectors over the workspace's canonical conversation store. */
  export namespace gad {
    /** One bounded causal packet joining an exact invocation to its turn, events and commands. */
    function diagnoseInvocation(input: {
      trajectoryId: string;
      branchId: string;
      invocationId: string;
      eventLimit?: number;
      commandLimit?: number;
      effectLimit?: number;
    }): Promise<{
      invocation: {
        invocation_id: string;
        status: string;
        terminal_outcome: string | null;
        terminal_reason_code: string | null;
      } | null;
      events: unknown[];
      commands: unknown[];
    }>;
  }
  /** Read-only view of the calling user's local problem reports. */
  export namespace problemReports {
    /** Reporting destination, limits, anonymous submission policy, and owned incident counts. */
    function availability(): Promise<{ destination: string }>;
  }
}
