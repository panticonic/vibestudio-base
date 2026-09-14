/**
 * Drop this task's standing authority when outside content arrives.
 *
 * A grant the user approved was approved for a task as it stood. Once content
 * from outside the workspace enters that task, the approval no longer covers
 * what the agent is acting on, so the standing grants go and the next gated
 * operation asks the person again.
 *
 * This is deliberately a userland decision made by code, not by the model: the
 * agent is never asked whether it feels compromised. It is also deliberately a
 * *self-denial*, which is why it needs no host attestation, no trusted-code
 * allowlist and no reported lineage — nobody has to believe a caller that is
 * giving authority up. The host previously carried all of that apparatus to
 * decide whether to trust a claim of cleanliness; giving up authority instead
 * of claiming cleanliness removes the question.
 *
 * Resetting more often than strictly needed costs one extra approval prompt,
 * so a source is remembered only to avoid re-prompting for the same origin
 * twice in a row — never to decide that a reset can be skipped on new content.
 */
export interface OutsideContentReset {
  /** Note outside content from `source`; drop task authority if it is new. */
  observe(source: string): Promise<void>;
}

export function createOutsideContentReset(deps: {
  resetTaskAuthority: () => Promise<void>;
  onError?: (error: unknown, source: string) => void;
}): OutsideContentReset {
  const seen = new Set<string>();
  return {
    async observe(source: string): Promise<void> {
      const key = source.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      try {
        await deps.resetTaskAuthority();
      } catch (error) {
        // A failed reset must not take down the operation that fetched the
        // content, but it must not look like it succeeded either: forget the
        // source so the next encounter tries again.
        seen.delete(key);
        deps.onError?.(error, source);
      }
    },
  };
}
