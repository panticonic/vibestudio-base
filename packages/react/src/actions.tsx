/**
 * Component-owned actions: run a trusted helper from a control and show its
 * pending, failure, and done state next to that control only.
 */
import { useCallback, useRef, useState } from "react";
import { Button, Flex, Text } from "@radix-ui/themes";
import { GlobeIcon, OpenInNewWindowIcon } from "@radix-ui/react-icons";
import { openExternal, openPanel } from "@workspace/runtime";

export type ActionStatus = "idle" | "pending" | "done" | "failed";

export interface ActionState<Args extends unknown[]> {
  /**
   * Run the action. Never rejects: a failure is reported through `error`, so
   * it can be passed straight to an event handler.
   */
  run(...args: Args): Promise<void>;
  status: ActionStatus;
  pending: boolean;
  /** The latest run's failure message, or null. */
  error: string | null;
}

/**
 * Track one action's lifecycle. Each control owns its own `useAction`, so a
 * pending approval prompt or panel boot disables only that control. When runs
 * overlap, only the latest one settles the state.
 *
 * @example
 * ```tsx
 * const save = useAction(() => saveSettings(draft));
 * <Button loading={save.pending} onClick={() => save.run()}>Save</Button>
 * {save.error && <Text color="red">{save.error} — retry when ready.</Text>}
 * ```
 */
export function useAction<Args extends unknown[]>(
  action: (...args: Args) => unknown,
): ActionState<Args> {
  const actionRef = useRef(action);
  actionRef.current = action;
  const latest = useRef(0);
  const [state, setState] = useState<{
    status: ActionStatus;
    error: string | null;
  }>({
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
  return {
    run,
    status: state.status,
    pending: state.status === "pending",
    error: state.error,
  };
}

export interface OpenLinkButtonsProps {
  url: string;
  /** Pass for OAuth authorize URLs; forwarded to `openExternal`. */
  expectedRedirectUri?: string;
  size?: "1" | "2" | "3";
}

/**
 * The two ways to open a URL from a component: an internal browser panel
 * (`openPanel(url, { focus: true })`) and the system browser (`openExternal`,
 * which asks for approval). Each button tracks its own action and the failure
 * is shown beside them.
 */
export function OpenLinkButtons({
  url,
  expectedRedirectUri,
  size = "1",
}: OpenLinkButtonsProps) {
  const internal = useAction(() => openPanel(url, { focus: true }));
  const external = useAction(() =>
    openExternal(
      url,
      expectedRedirectUri ? { expectedRedirectUri } : undefined,
    ),
  );
  const error = internal.error ?? external.error;
  return (
    <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
      <Flex gap="2" wrap="wrap">
        <Button
          type="button"
          size={size}
          variant="soft"
          disabled={internal.pending}
          onClick={() => void internal.run()}
        >
          <GlobeIcon /> {internal.pending ? "Opening…" : "Internal"}
        </Button>
        <Button
          type="button"
          size={size}
          variant="soft"
          disabled={external.pending}
          onClick={() => void external.run()}
        >
          <OpenInNewWindowIcon />{" "}
          {external.pending ? "Awaiting approval…" : "External"}
        </Button>
      </Flex>
      {error && (
        <Text as="p" size="1" color="red">
          {error} — retry when ready.
        </Text>
      )}
    </Flex>
  );
}
