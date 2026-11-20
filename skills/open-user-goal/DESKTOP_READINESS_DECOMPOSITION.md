# Review a desktop client's readiness and window continuity

## Exact mechanism inventory

- `system:clients/desktop-browser/SKILL.md` owns the trusted web shell's
  current workspace, startup source, and desktop-specific layout.
  `system:skills/clientdev/SKILL.md` owns client contract and build review.
  The installed `bindClientAdmission` reads the actual working and published
  VCS coordinates, their manifests, System trust configuration, and build unit
  metadata; it does not run builds. Preserve its exact evidence and reuse
  `reviewClientAdmission` for the host candidate judgment.
- Desktop `DesktopClientUpdates` reseeds the shared client update model from
  the host-retained offers and matching supervised units/retained versions.
  Extract that projection without changing the browser's observed behavior.
  The same `@workspace/client-update-core` model owns offered state and
  rejected/rolled-back notices. Its recorded-fixture port forbids applying
  updates or rolling back. The installed browser remains the sole interaction
  surface for a real user. Replayed `adopted` events belong to the desktop
  host; the browser consumes retained state and rejection/rollback events.
- Desktop `layout/usePanelLayout.ts` calls the placement engine for restore,
  pruning, delayed user intent reconciliation and responsive parking. Use the
  exact `validateRestoredLayout`, `reconcileViewport`, `computeViewport`
  and `applyLayoutAction` exports from the installed desktop unit. The replay
  separately scopes a serialized layout to its owner and uses synthetic
  placement intents; no browser DOM, renderer or live document is restarted.
  The selected System runner imports and injects these typed runtime ports.
  The shared test package retains only their erased type imports so other
  workspace compositions have no desktop runtime dependency.
- Host `DesktopClientHost`, `ClientLaunchHost`, `ClientWindows`, and
  ClientHostCore also implement launch/adoption/cache and grant semantics
  under native lifecycle ports. Their source tests provide independent
  mechanism coverage. The fixture does not infer an active device session,
  pending host grant, rendered pixels, document persistence, or actual binary
  rebuild status from synthetic inputs. No external or real device/app calls.
- Existing CDP renderer diagnostics, presentation, asset integrity, mobile
  startup/lease continuity, and launch-contract-only reviews are retained.
  This family joins runtime-specific retained offers and guarded responsive
  window restoration to the actual installed desktop source.

## Stages

1. Locate the owned desk and discover the exact assigned System client and
   host review operation. Run the existing typed clientdev admission lambda.
2. Read the original and currently observed desktop offer state, version
   catalog and layout, keeping their exact source identities. Read these via
   separate typed callables so lifecycle and placement do not share policy.
3. Judge window continuity from valid scope, surviving panels, active pane
   visibility and local transient edits. Decide whether to keep the current
   desktop, inspect or defer a staged update, recover a layout, or hold for
   authority. Exact byte/location comparisons and rollback properties are
   supplied as inputs, not model-assigned truth.
4. For an authorized hold or recovery, retain only the evidence-backed
   recommendation. No apply, rebuild, reload or additional persist operation
   is issued. Verify the final exact projected readback, protected source VCS
   coordinates, no host mutation, and complete trajectory value references.
