export type StartupUnitStatus = {
  status?: string;
  pendingApproval?: unknown;
} | null;

/** Phase text only; the ticking elapsed counter is rendered separately so assistive tech hears phase changes, not every second. */
export function terminalStartupPendingLabel(args: {
  pending: boolean;
  elapsedSeconds: number;
  shellUnit: StartupUnitStatus;
}): string | undefined {
  if (!args.pending) return undefined;
  if (isUnitApprovalPending(args.shellUnit)) return "Waiting for your approval…";
  if (isExtensionPreparing(args.shellUnit)) {
    return args.elapsedSeconds >= 20
      ? "Still setting up the terminal…"
      : "Setting up the terminal…";
  }
  if (args.elapsedSeconds >= 15) return "Still waiting for your approval…";
  if (args.elapsedSeconds >= 1) return "Waiting for your approval…";
  return "Starting terminal…";
}

export function terminalStartupDetail(args: {
  status: "idle" | "opening" | "waitingApproval" | "failed";
  elapsedSeconds: number;
  shellUnit: StartupUnitStatus;
  error: string | null;
}): { title: string; detail: string } {
  if (args.status === "failed") {
    return {
      title: "Terminal did not open",
      detail: args.error ?? "The shell request failed or was denied. You can try again.",
    };
  }
  if (args.status === "idle") {
    return {
      title: "Open terminal",
      detail: "Start a shell session in this workspace.",
    };
  }
  if (isUnitApprovalPending(args.shellUnit)) {
    return {
      title: "Allow the terminal",
      detail: "Vibestudio needs your OK to start a shell. Look for the approval prompt at the top of the window.",
    };
  }
  if (isExtensionPreparing(args.shellUnit)) {
    return {
      title: args.elapsedSeconds >= 20 ? "Still setting up the terminal" : "Setting up the terminal…",
      detail: args.elapsedSeconds >= 20
        ? "This is taking longer than usual. Your request is already in progress, so clicking again will not start more terminals."
        : "The first start can take around 20 seconds.",
    };
  }
  if (args.status === "waitingApproval") {
    return {
      title: args.elapsedSeconds >= 15 ? "Still waiting for your approval" : "Starting terminal session",
      detail: args.elapsedSeconds >= 15
        ? "Vibestudio is waiting for your OK. Look for the approval prompt at the top of the window instead of opening another terminal."
        : "If an approval prompt appears, allow the terminal session. Your request is already in progress.",
    };
  }
  return {
    title: "Starting terminal",
    detail: "Creating your first terminal session.",
  };
}

export function isUnitApprovalPending(shellUnit: StartupUnitStatus): boolean {
  return !!shellUnit?.pendingApproval || shellUnit?.status === "pending-approval";
}

export function isExtensionPreparing(shellUnit: StartupUnitStatus): boolean {
  return shellUnit?.status === "building" || shellUnit?.status === "available" || shellUnit?.status === "stopped";
}
