/**
 * Component-owned actions, as in `@workspace/react`: run a helper from a
 * control and show its pending and failure state next to that control only.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Box, Text as InkText } from "ink";
import { Button } from "./controls.js";
import { Link } from "./text.js";

export type ActionStatus = "idle" | "pending" | "done" | "failed";

export interface ActionState<Args extends unknown[]> {
  /** Run the action. Never rejects: a failure is reported through `error`. */
  run(...args: Args): Promise<void>;
  status: ActionStatus;
  pending: boolean;
  /** The latest run's failure message, or null. */
  error: string | null;
}

/** Track one action's lifecycle; when runs overlap, only the latest settles the state. */
export function useAction<Args extends unknown[]>(
  action: (...args: Args) => unknown
): ActionState<Args> {
  const actionRef = useRef(action);
  actionRef.current = action;
  const latest = useRef(0);
  const [state, setState] = useState<{ status: ActionStatus; error: string | null }>({
    status: "idle",
    error: null,
  });
  const run = useCallback(async (...args: Args) => {
    const runId = ++latest.current;
    setState({ status: "pending", error: null });
    try {
      await actionRef.current(...args);
      if (runId === latest.current) setState({ status: "done", error: null });
    } catch (cause) {
      if (runId === latest.current)
        setState({
          status: "failed",
          error: cause instanceof Error ? cause.message : String(cause),
        });
    }
  }, []);
  return { run, status: state.status, pending: state.status === "pending", error: state.error };
}

/** How the host opens a URL: in an internal browser panel, or in the system browser. */
export interface LinkOpeners {
  openPanel?(url: string): unknown;
  openExternal?(url: string, options?: { expectedRedirectUri?: string }): unknown;
}

export const LinkOpenersContext = createContext<LinkOpeners | null>(null);

/** The two ways to open a URL; where the host gives no opener, a link the terminal opens. */
export function OpenLinkButtons(props: {
  url?: unknown;
  expectedRedirectUri?: unknown;
}): React.ReactElement {
  const openers = useContext(LinkOpenersContext);
  const url = typeof props.url === "string" ? props.url : "";
  const expected =
    typeof props.expectedRedirectUri === "string" ? props.expectedRedirectUri : undefined;
  const internal = useAction(() => openers?.openPanel?.(url));
  const external = useAction(() =>
    openers?.openExternal?.(url, expected ? { expectedRedirectUri: expected } : undefined)
  );
  if (!openers?.openPanel && !openers?.openExternal) return <Link href={url}>{url}</Link>;
  const error = internal.error ?? external.error;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        {openers.openPanel ? (
          <Button disabled={internal.pending} onClick={() => void internal.run()}>
            {internal.pending ? "Opening…" : "Internal"}
          </Button>
        ) : null}
        {openers.openExternal ? (
          <Button disabled={external.pending} onClick={() => void external.run()}>
            {external.pending ? "Awaiting approval…" : "External"}
          </Button>
        ) : null}
      </Box>
      {error ? <InkText color="red">{`${error} — retry when ready.`}</InkText> : null}
    </Box>
  );
}
