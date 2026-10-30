# Sandbox: what is natural language and what is crisp

Ported sub-procedure: choosing an interaction surface (INTERACTION_PATTERNS.md). The rest of the sandbox skill is reference for authoring UI and stays an agent skill.

| Part | Form | Why |
| --- | --- | --- |
| Which surface (eval, ask_user, feedback_form, inline_ui, feedback_custom, load_action_bar, choices, mdx) fits a need | own function, `interactionSurface`, `readout: decision` | Eight finite outcomes. The deciding facts are whether the agent can continue without an answer, whether one answer or several are needed, and whether a component can perform the operation itself; each is a sentence in the rule that applies. |
| Authoring the UI (INLINE_UI.md, ACTION_BAR.md, CUSTOM_MESSAGES.md) | stays an agent skill | Open-ended coding. |
| Eval API, runtime clients | stays reference | Generated surface documentation, not a procedure. |

The program lives in `natlang/` because the skill directory holds unrelated TSX references that a program root would otherwise compile.
