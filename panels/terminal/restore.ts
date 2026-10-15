import type { TerminalLauncher } from "./terminalLauncher.js";
import type { PerSessionState, SessionInfo, ShellApi, SplitNode, TerminalState } from "./types.js";

export interface RestoreResult {
  tree?: SplitNode;
  focusedSessionId?: string;
  sessions: Record<string, SessionInfo>;
  perSession: Record<string, PerSessionState>;
}

export async function restoreTerminalState(
  shell: ShellApi,
  launcher: TerminalLauncher,
  state: TerminalState
): Promise<RestoreResult> {
  const sessions: Record<string, SessionInfo> = {};
  const perSession: Record<string, PerSessionState> = {};

  if (!state.tree) return { sessions, perSession };
  const restored = await restoreTree(shell, launcher, state.tree, state.perSession, sessions, perSession, {
    scrollbackBytes: state.scrollbackBytes,
    disposeOriginalLeaves: true,
  });
  const focusedSessionId = restored
    ? restored.sessionMap[state.focusedSessionId ?? ""] ?? firstLeaf(restored.node)
    : undefined;

  return {
    tree: restored?.node,
    focusedSessionId,
    sessions,
    perSession,
  };
}

async function restoreTree(
  shell: ShellApi,
  launcher: TerminalLauncher,
  node: SplitNode,
  perSession: TerminalState["perSession"],
  sessions: Record<string, SessionInfo>,
  nextPerSession: Record<string, PerSessionState>,
  opts: { scrollbackBytes?: number; disposeOriginalLeaves: boolean },
): Promise<{ node: SplitNode; sessionMap: Record<string, string> } | undefined> {
  if (node.kind === "leaf") {
    const saved = perSession[node.sessionId];
    let openedRegistryId: string | undefined;
    try {
      try {
        const existing = await shell.get(node.sessionId);
        sessions[node.sessionId] = existing;
        nextPerSession[node.sessionId] = {
          cwd: existing.command.cwd,
          originalArgv: saved?.originalArgv ?? existing.command.argv,
          readCursor: saved?.readCursor ?? 0,
          lastSeenAt: Date.now(),
          label: existing.label,
          ...(saved?.registryId ? { registryId: saved.registryId } : {}),
        };
        if (opts.scrollbackBytes) await shell.setScrollbackLimit?.(node.sessionId, opts.scrollbackBytes);
        return { node, sessionMap: { [node.sessionId]: node.sessionId } };
      } catch {
        // The host no longer has it; recreate a clearly identified fresh shell.
      }
      // The PTY is gone. A registered session starts again as itself (same
      // program, context and folder); one from before sessions were registered
      // is replaced by a fresh shell and its leftover record removed.
      const reopened = saved?.registryId
        ? await launcher.resume(saved.registryId)
        : await launcher.open({ cwd: saved?.cwd, label: "Restored shell (restarted)" });
      const { sessionId, registryId } = reopened;
      if (!saved?.registryId) openedRegistryId = registryId;
      const info = await shell.get(sessionId);
      if (opts.scrollbackBytes) await shell.setScrollbackLimit?.(sessionId, opts.scrollbackBytes);
      sessions[sessionId] = info;
      nextPerSession[sessionId] = {
        cwd: info.command.cwd,
        originalArgv: saved?.originalArgv ?? info.command.argv,
        readCursor: saved?.readCursor ?? 0,
        lastSeenAt: Date.now(),
        label: info.label,
        registryId,
      };
      if (opts.disposeOriginalLeaves && !saved?.registryId) {
        void shell.dispose?.(node.sessionId).catch(() => {});
      }
      return { node: { kind: "leaf", sessionId }, sessionMap: { [node.sessionId]: sessionId } };
    } catch {
      if (openedRegistryId) void launcher.close(openedRegistryId).catch(() => {});
      if (opts.disposeOriginalLeaves && !saved?.registryId) {
        void shell.dispose?.(node.sessionId).catch(() => {});
      }
      return undefined;
    }
  }
  const a = await restoreTree(shell, launcher, node.a, perSession, sessions, nextPerSession, opts);
  const b = await restoreTree(shell, launcher, node.b, perSession, sessions, nextPerSession, opts);
  if (!a) return b;
  if (!b) return a;
  return {
    node: { ...node, a: a.node, b: b.node },
    sessionMap: { ...a.sessionMap, ...b.sessionMap },
  };
}

function firstLeaf(node: SplitNode): string | undefined {
  if (node.kind === "leaf") return node.sessionId;
  return firstLeaf(node.a) ?? firstLeaf(node.b);
}
