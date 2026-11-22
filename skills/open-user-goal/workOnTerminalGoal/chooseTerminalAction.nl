---
description: Choose the next authorized action from the live checklist, process exits, bounded test results and user instructions.
args:
  goal: string
  opening: TerminalStart
  progress: TerminalProgress
returns: TerminalAction
---
Use the most recent actual screen or the opening screen. An owned note describes the project context and does not confer permissions. Item 1 is Build prepared, item 2 is Review complete, and item 3 is Rollback confirmed. Apply only the user's requested state changes, in the order and with the keyboard or pointer method the goal requires. Preserve other items and never toggle an already-correct item unless the user explicitly requests an exercised transition and restoration.

A reattach keeps the running PTY. A restart starts a fresh PTY within the same durable session. A resume after a true exit starts a new PTY from durable state. Use the small 62x18 or wide 100x32 viewport as requested. A quit observes normal program exit. An interrupt deliberately ends the owned program for an explicitly granted recovery drill. Retirement removes the owned session and ends terminal work.

If opening.discoveryAvailable is true and the user asks which interface or guidance applies, choose discover once before any action whose authority or correctness depends on it. Use the exact result to select a recovery operation, distinguish similar interfaces, or withhold a change.

When the goal depends on check results, run the assigned suite once before deciding the dependent action. A failed, timed-out, unavailable or truncated check cannot support a dependent success. It may warrant a hold, a requested compensation, or recording independently confirmed facts. Stage only for a requested, granted scratch handoff after the receipts needed by the user exist. Do not retry a refusal. When no authorized work remains, finish.
