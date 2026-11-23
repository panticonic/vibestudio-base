/**
 * CPU profiling + heap snapshots for panels (Chromium via the CDP bridge) and
 * — once the workerd inspector service lands — workerd isolates.
 *
 * Output is standard V8 format: load .cpuprofile files in speedscope or
 * Chrome DevTools Performance panel as-is. Artifacts are written to context
 * fs via profiles-store; only compact ProfileRefs travel through eval.
 */
import type { PanelHandle } from "@workspace/runtime";
import {
  rawCdpSession,
  withCdpSession,
  _usingCdpSession,
  type RawCdpSession,
} from "./cdp.js";
import {
  cpuProfileRef,
  topFunctions,
  type ProfileRef,
  type V8Profile,
} from "./profile-core.js";
import { profilePath, saveProfile } from "./profiles-store.js";

export { topFunctions };

async function captureCpuProfile(
  session: RawCdpSession,
  target: string,
  run: () => Promise<void>,
  opts?: { samplingIntervalUs?: number },
): Promise<ProfileRef> {
  const startedAt = Date.now();
  await session.send("Profiler.enable");
  if (opts?.samplingIntervalUs) {
    await session.send("Profiler.setSamplingInterval", {
      interval: opts.samplingIntervalUs,
    });
  }
  await session.send("Profiler.start");
  let savedProfile: ProfileRef | undefined;
  try {
    await run();
  } finally {
    const result = (await session.send("Profiler.stop")) as {
      profile: V8Profile;
    };
    await session
      .send("Profiler.disable")
      .catch((error: unknown) =>
        console.warn("[profile] Failed to disable the profiler:", error),
      );
    savedProfile = await saveProfile(
      cpuProfileRef(target, startedAt, result.profile),
      JSON.stringify(result.profile),
    );
  }
  if (!savedProfile) throw new Error("CPU profile was not saved");
  return savedProfile;
}

/** Profile a panel's main world while `run` executes. */
export async function profilePanel(
  handle: PanelHandle,
  run: () => Promise<void>,
  opts?: { samplingIntervalUs?: number },
): Promise<ProfileRef> {
  return withCdpSession(handle, (session) =>
    captureCpuProfile(session, `panel:${handle.id}`, run, opts),
  );
}

/** Start profiling a panel; call the returned stop() to finish and persist. */
export async function startPanelProfile(
  handle: PanelHandle,
  opts?: { samplingIntervalUs?: number },
): Promise<{ stop(): Promise<ProfileRef> }> {
  const session = await rawCdpSession(handle);
  const startedAt = Date.now();
  try {
    await session.send("Profiler.enable");
    if (opts?.samplingIntervalUs) {
      await session.send("Profiler.setSamplingInterval", {
        interval: opts.samplingIntervalUs,
      });
    }
    await session.send("Profiler.start");
  } catch (error) {
    return _usingCdpSession(session, async () => {
      throw error;
    });
  }
  let stopped: Promise<ProfileRef> | undefined;
  return {
    stop: () =>
      (stopped ??= _usingCdpSession(session, async () => {
        const result = (await session.send("Profiler.stop")) as {
          profile: V8Profile;
        };
        return saveProfile(
          cpuProfileRef(`panel:${handle.id}`, startedAt, result.profile),
          JSON.stringify(result.profile),
        );
      })),
  };
}

/** Take a heap snapshot of a panel. Streams chunks; can be tens of MB. */
export async function heapSnapshot(handle: PanelHandle): Promise<ProfileRef> {
  const startedAt = Date.now();
  return withCdpSession(handle, async (session) => {
    const chunks: string[] = [];
    const unsubscribe = session.on(
      "HeapProfiler.addHeapSnapshotChunk",
      (params) => {
        chunks.push((params as { chunk: string }).chunk);
      },
    );
    await session.send("HeapProfiler.enable");
    await session.send("HeapProfiler.takeHeapSnapshot", {
      reportProgress: false,
    });
    unsubscribe();
    await session.send("HeapProfiler.disable").catch(() => undefined);
    const data = chunks.join("");
    const ref: ProfileRef = {
      path: profilePath(`panel:${handle.id}`, "heapsnapshot", startedAt),
      kind: "heapsnapshot",
      target: `panel:${handle.id}`,
      startedAt,
      durationMs: Date.now() - startedAt,
      summary: {},
    };
    return await saveProfile(ref, data);
  });
}
