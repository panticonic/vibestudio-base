import { useState } from "react";

/** Workspace-scoped reviews survive navigation, with independent update and contribution slots. */
export function useTemplateDraft<T>(
  workspaceId: string,
  slot: "request" | "contribution",
  parse: (value: unknown) => T,
) {
  const key = `template-maintenance:${workspaceId}`;
  const [state, setState] = useState<{ value: T | null; error: string }>(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      return { value: stored[slot] ? parse(stored[slot]) : null, error: "" };
    } catch (error) {
      return {
        value: null,
        error: `Could not restore the saved review: ${String(error)}`,
      };
    }
  });
  const save = (value: T | null) => {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...stored, [slot]: value }),
    );
    setState({ value, error: "" });
  };
  return [state.value, save, state.error] as const;
}
