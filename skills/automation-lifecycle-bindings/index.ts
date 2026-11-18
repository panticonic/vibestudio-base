import type {
  LifecycleAction,
  LifecycleReceipt,
  LifecycleRequest,
  MissionObservation,
} from "../automation-lifecycle/types.js";

type Missions = {
  get(missionId: string): Promise<MissionObservation | null>;
  pause(missionId: string): Promise<MissionObservation>;
  resume(missionId: string): Promise<MissionObservation>;
};

/** The caller supplies its normal Missions client and one authorized transition. */
export function bindAutomationLifecycle(
  missions: Missions,
  assignment: LifecycleRequest,
) {
  const { missionId, revisionDigest, action } = assignment;
  if (
    !missionId ||
    !revisionDigest ||
    (action !== "pause" && action !== "resume")
  ) {
    throw new Error(
      "Bind an assigned automation revision and a reversible transition.",
    );
  }
  let claimed = false;
  const desired = action === "pause" ? "paused" : "active";

  function assigned(id: string) {
    if (id !== missionId) throw new Error("Read only the assigned automation.");
  }

  async function observe(id: string): Promise<MissionObservation | null> {
    assigned(id);
    try {
      const record = await missions.get(id);
      if (record?.missionId !== id) return null;
      return {
        missionId: record.missionId,
        revisionDigest: record.revisionDigest,
        state: record.state,
      };
    } catch {
      return null;
    }
  }

  async function apply(
    id: string,
    digest: string,
    choice: LifecycleAction,
  ): Promise<LifecycleReceipt> {
    if (
      claimed ||
      id !== missionId ||
      choice !== action ||
      digest !== revisionDigest
    )
      return "blocked";
    claimed = true;
    const current = await observe(id);
    if (!current || current.revisionDigest !== digest) return "blocked";
    if (current.state === desired) return "already";
    if (current.state !== (action === "pause" ? "active" : "paused"))
      return "blocked";
    try {
      const changed = await missions[action](id);
      return changed.missionId === id &&
        changed.revisionDigest === digest &&
        changed.state === desired
        ? "acknowledged"
        : "uncertain";
    } catch {
      return "uncertain";
    }
  }

  return {
    automationLifecycleRead: { observe },
    automationLifecycleChange: { apply },
  };
}
