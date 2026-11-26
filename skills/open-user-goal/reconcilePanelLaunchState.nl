---
description: Reconcile requested launch state using owned observations and exact native authority.
args:
  goal: string
returns: LaunchResult | null
---
Resolve the user's requested launch-state work from the owned index through selectLaunchSlot. Gather the evidence needed for that selected scope through observeLaunchScope, passing the owned index, selection, and workspace.readLaunchSlot as its read callback. If the selected identity or essential observations are unavailable, return null rather than inventing them. Use planLaunchState with the actual selection and observations to express the minimal requested patch in the native state's real field structure. A panel title does not establish a JSON field path.

Use decideLaunchChange to judge the selected opening/current observations. Apply an attempted change through applyAuthorizedLaunchChange: it binds the exact observed basis and patch, reviews native authority, and preserves native refusal. Use verifyLaunchScope with the same goal/index and earlier evidence to obtain the independently persisted active readback and any related observations the goal needs after the operation. Its read callback is workspace.readLaunchSlot and its active-state seal callback is workspace.readbackLaunchSlot. Refresh observations if native state or authority requires it; retain the actual evidence used for each judgment.

Have concludeLaunchState explain the result from these actual observations. Retain a private note through workspace.writeLaunchNote only when requested, using the exact LaunchReport with the actual plan, opening, current, decision, preflight, effect, readback and result, initially handoff:null. Return applicationResult with the independently observed active readback, conclusion, and actual optional handoff. Do not claim that another record was inspected or remained unchanged without observations supporting that claim.
