---
description: Choose the interaction surface that gives the user the most direct control for the least effort.
args:
  need: string
returns: InteractionSurface
readout: decision
---
need says what the agent wants to show, ask, or do. Choose the surface by the first rule that fits:
1. eval: it is deterministic runtime work that needs no user choice (read state, run a check or test, create something already approved, verify a credential).
2. feedback_custom: the agent cannot continue until the user decides, and the decision selects what the agent itself will write next (choosing among plans, approving a proposal before files change).
3. feedback_form: the agent cannot continue without several related inputs from the user at once.
4. ask_user: the agent cannot continue without one answer from the user.
5. inline_ui: a self-contained workflow whose component can run the operation itself: setup or sign-in, imports, progress with retry and a success state.
6. load_action_bar: compact controls or status that must stay visible above the chat history while work runs.
7. choices: the user may pick a direction or follow-up, but the agent can continue without an answer.
8. mdx: data, options, places, steps or what-if math shown in the reply as components.
