import type { MissionRecord } from "@vibestudio/automation/mission";

/** A host change wakes existing default watches through the ordinary durable
 * automation run. Saved schedules and paused/retired choices remain authoritative. */
export async function reconcileDefaultAutomationHost(input: {
  id: string;
  appVersion: string;
  existing: boolean;
  events: readonly string[];
  mission: MissionRecord;
  read(key: string): string | null;
  write(key: string, value: string): void;
  run(missionId: string, commandId: string): Promise<unknown>;
}): Promise<void> {
  if (!input.events.includes("app-update")) return;
  const key = `default-automation:${input.id}:app-update-observation`;
  const stored = input.read(key);
  const observation = stored
    ? (JSON.parse(stored) as {
        appVersion: string;
        revision: number;
        accepted: boolean;
      })
    : null;
  if (observation?.appVersion === input.appVersion && observation.accepted)
    return;
  const revision =
    observation?.appVersion === input.appVersion
      ? observation.revision
      : (observation?.revision ?? 0) + 1;
  const current = { appVersion: input.appVersion, revision, accepted: false };
  input.write(key, JSON.stringify(current));
  const execution = input.mission.charter.execution;
  if (
    input.existing &&
    input.mission.state === "active" &&
    execution.kind === "agent" &&
    execution.action.kind === "watch"
  )
    await input.run(
      input.mission.missionId,
      `default-automation:${input.id}:app-update:${revision}`,
    );
  // Only record accepted work. Failed dispatch is retried with the same command
  // identity by the next lifecycle reconciliation, not by a second scheduler.
  input.write(key, JSON.stringify({ ...current, accepted: true }));
}
