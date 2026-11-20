import type { BuildPerformanceProfileWire } from "@vibestudio/service-schemas/build";

/** The same bounded observation for a live profile or a retained native receipt. */
export function observeBuildProfile(
  profile: BuildPerformanceProfileWire,
) {
  const error = profile.report.diagnostics.find(({ severity }) => severity === "error");
  return {
    source: profile.source,
    stateHash: profile.report.stateHash,
    status: profile.report.status,
    first: {
      elapsedMs: profile.firstRun.elapsedMs,
      cacheState: profile.firstRun.cacheState,
      phases: profile.firstRun.phases ?? null,
    },
    repeat: profile.verifiedCacheRun ?? null,
    targets: profile.targets.map((target) => ({
      target: target.target,
      buildKey: target.buildKey,
      artifactBytes: target.artifactBytes,
      executableSourceBytes: target.executableSourceBytes,
      payload: target.bundleReport
        ? {
            initialBytes: target.bundleReport.initial.bytes,
            lazyBytes: target.bundleReport.lazy.bytes,
            totalBytes: target.bundleReport.total.bytes,
            largestInitialInputs: target.bundleReport.largestInitialInputs.slice(0, 10),
          }
        : null,
    })),
    firstError: error
      ? { file: error.file, message: error.message.slice(0, 600) }
      : null,
  };
}
