# Installed package identity guidance (2026-11-25)

Actual V34 wave 0065 gateway workspace-link task failed to restore the approved field. The sampled decidePackage eval compared receiver.name to observed.name. The former is the worker declaration `model-gateway`; the latter is the npm package `@workspace-workers/model-gateway`. Native declaredReceiverMatches was true. No historical outcome is changed: the requested repair did not occur.

## Mechanism and consumers

- Base reviewInstalledPackage/contract.ts defines the observation, inspectPackage.nl/readOwnedPackage.ts obtain it, decidePackage.nl interprets it, and reviewInstalledPackage.ts delegates restoration only for restore-approved-field. restorePackage.nl and its service preserve CAS authority.
- SST open-goal-installed-package-managed.ts:191-224 constructs package/catalog/receiver evidence; declaredReceiverMatches compares receiver.name with the actual worker declaration name, not the package name. decisionFor at 246-256 independently uses that native match and package identities. Verification at 360-407 still requires the requested persisted effect.
- The scoped contract is imported by Base services.d.ts; comments and guidance change no signature, scope, service grant, task ID or goal. No duplicate receiver-name comparison exists in this Base codebase.
- Notification-state original-only was also inspected: its literal goal asks an explanation if the arrival changes. Actual refresh read 16:00 revision1 becoming 18:20 revision2; a captured provider failure prevented the requested explanation. The native effects pass but the requested return is absent. Its verifier is unchanged.
- Native, managed llama, wllama, Python and SGLang are consumers of the same authored lambda instructions, not implementers of VibeStudio package identity joins. No engine-specific identity predicate is present here; no engine code changes are needed.

This corrects the meaning of supplied application fields while leaving the semantic decision to the model. No teacher calls or retrospective success waivers. Existing interface headers and exported type syntax are checked statically; no prompt-mirroring test or model probe.
