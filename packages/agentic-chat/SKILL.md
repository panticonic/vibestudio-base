---
name: agentic-chat
description: Compose an agentic conversation surface, select browser capabilities, customize or elide stock UI, route natural-language input, and preserve delivery diagnostics.
---

# Agentic chat composition

Use `AgenticChat` when a product wants the standard channel, trajectory,
delivery, and composer behavior with its own presentation. For a fully custom
layout, compose `useAgenticChat`, `ChatProvider`, and the individually exported
chat components instead.

For a change that spans the chat panel, agent worker, channel, or shared event
contract, read [agentic development](../../skills/agentic-development/SKILL.md).

## Capabilities are explicit

Pass `features` on every `AgenticChat` mount. The supported browser-provided
capabilities are `feedback`, `inline-ui`, `action-bar`, and `client-eval`.
`features` controls what the participant can do, not just what is shown: an
omitted feature is neither mounted nor advertised as a channel method. The
selection is fixed for the participant's lifetime, because changing the
advertised methods requires a new channel join.

Presentation callbacks are independent of capabilities. Each receives the
complete stock renderer and may return it, wrap it, replace it, or return
`null`:

- `renderMessage`
- `renderInlineGroup`
- `renderInvocation`
- `renderEmptyState`
- `renderHeader`
- `renderDeliveryStatus`
- `renderComposer`

Prefer these callbacks to CSS selectors that depend on component structure. See
[THEMING.md](THEMING.md) for semantic variables and stable `data-part` styling
slots.

## Natural-language routing

`composerDefaultMentions` supplies recipients only when the player has not
written a mention; explicit mentions always win. In a multi-agent product,
route plain text to one command interpreter and let direct mentions bypass it.
Do not broadcast ambiguous player text to every agent.

- Set agents that should act only on work addressed to them to
  `mentioned-strict`.
- Disable the composer with `composerDisabled` until every required default
  recipient has a participant identity.
- Put participant IDs in `composerDefaultMentions`, not handles or entity keys.

Quick actions should publish through the same addressed conversation protocol
as typed input, not through a separate application command path.

## Diagnostics and elision

Custom invocation renderers must keep a way to inspect failures. A useful
pattern is a product-specific collapsed renderer that delegates to
`defaultContent` when expanded. Hiding routine tool activity must not remove
errors from the stored trajectory or make failed effects impossible to inspect.

`renderDeliveryStatus` renders the stock pending-delivery queue and outbox
together. Elide it only when the product provides equivalent delivery and error
feedback. Connection failures and dirty-repository warnings are rendered
outside it, because they are safety warnings.

## Verification

Test capability selection separately from presentation. At minimum, cover that:

- omitted features do not mount or advertise their methods;
- renderers can keep, wrap, and elide their default output;
- explicit mentions override default routing;
- the composer stays disabled until its required recipient is ready;
- hidden invocations still expose a failure diagnostic.
