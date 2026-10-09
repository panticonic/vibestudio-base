---
name: messaging
description: Message anyone — the channel, a person, another agent, a subagent run — with the notify tool, its addressee grammar, and the escalation ladder.
---

# Messaging

**`notify`** is the messaging tool. Use it to speak to the channel, report to
a supervisor, steer a child, reach a person's phone, or talk to an agent in
another conversation. Any text someone else should see goes through `notify`.

`notify` delivers a conversation message and an optional inbox alert. Choices
written in its Markdown are just message text, and its returned message id does
not identify a dismissible shell notification. For a temporary shell
notification with clickable action buttons and explicit dismissal, use the
runtime `notifications.show()` and `notifications.dismiss()` API described in
[Runtime API — Notifications](../sandbox/RUNTIME_API.md#notifications).
`show()` returns a host-issued notification id once accepted; keep that id to
dismiss the notification from the same runtime.

```
notify({
  content: "…",              // markdown
  to?: string | string[],    // addressees; omit for the whole channel
  alert?: "none" | "inbox" | "interrupt",
  title?: string,            // headline for escalated surfaces
  replyTo?: string,
  attachments?: string[],    // image paths in your working tree
})
```

## Who you can address

`to` takes one ref or a list. Omitting it addresses the whole channel.

| Ref                          | Reaches                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| _(omitted)_                  | everyone in this conversation                                                                      |
| `@handle`                    | one participant here, agent or person; also a workspace member who has not joined this channel yet |
| `participant:<id>`           | the same, by exact id                                                                              |
| `user:<id>`                  | a specific person, on this channel or not (they are added to it)                                   |
| `owner`                      | the person this channel belongs to; fails if more than one person is here                          |
| `parent`                     | your supervisor, when you are a subagent                                                           |
| `run:<runId>`                | a subagent you spawned, in its own task channel                                                    |
| `agent:<handle>@<channelId>` | an agent instance in another conversation                                                          |
| `channel:<id>`               | everyone in another conversation                                                                   |

`list_addressees` shows these refs filled in for your current conversation.
Each row prints the exact string `to` accepts.

**Unresolvable refs fail the call.** A misspelled handle returns suggestions
instead of being broadcast; a handle that matches two participants returns an
error asking which one. Nothing is guessed, so a message never reaches the
wrong person.

A recipient the user named is part of the instruction. If that person is absent
or ambiguous, tell the caller and show the available addressees. Do not send the
note to the caller, another participant, or the whole channel instead, just
because they appear in the roster, unless the user explicitly chooses that.
Hold the note unsent while you ask.

## The alert ladder

Three rungs, each including everything the one below it does. They are named
for what the _recipient experiences_, not for how urgent the news feels to you.

| Rung        | What the person gets                            | When                                                                                 |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `none`      | the message in the channel, nothing else        | agent-to-agent and ordinary channel messages. The default.                           |
| `inbox`     | + a durable notification entry and a phone push | the default when you address a person. It reaches them without taking over a screen. |
| `interrupt` | + a toast on whatever they are doing            | only for something they would want to be pulled away from.                           |

Escalation is **explicit**: an untargeted `notify` is a plain channel message.
A rung above `none` reaches the people you addressed. If you set the rung
without naming anyone, it reaches the people in this conversation. Nobody
outside the conversation is ever notified by inference.

The person sees a notification-center row (grouped per agent, so two reports
before they look appear as one), a phone notification, and at `interrupt` a
toast. From any of these they can **reply in place** in a small conversation
view bound to your channel, or open the full chat panel at your message. The
inbox entry is cleared only when the person replies, opens it from the inbox,
or dismisses it. A chat panel being mounted or visible does not count as
acknowledgement. Do not re-notify an entry the person has already handled.

Worked examples:

```ts
// A milestone your supervisor should see. No person is addressed, no escalation.
notify({ content: "Fixture landed; verification is green.", to: "parent" });

// A background run finishing while nobody is watching. This is what phones are for.
notify({
  to: "owner",
  title: "Nightly build failed",
  content: "`packages/agent-loop` — 3 tests red since 02:14. [details](…)",
}); // alert defaults to "inbox"

// Something that should not wait.
notify({
  to: "owner",
  alert: "interrupt",
  title: "Production deploy is rolling back",
  content:
    "The 14:20 deploy is reverting. Nothing is lost; it needs a decision.",
});
```

For a recurring notification, put the same `notify` call in an agent-owned
automation prompt. Pass `alert: "inbox"` explicitly, even though messages to a
person currently default to it. `notify` is an agent tool, not a service
operation, so leave the automation's `operations` list empty unless the action
also makes external service calls. See [Automations](../automations/SKILL.md);
`launch_automation` creates the active automation immediately and seals the
current agent's identity and installed image.

An explicit `inbox` or `interrupt` rung is part of what `notify` must deliver.
If the inbox entry or the live inbox update fails, `notify` fails, even though
the channel message was published. An automation whose turn completes after
such a failure is recorded as `completed-with-errors`. Its inspector shows the
failed invocation, and the mission owner posts a failure entry to the GAD
inbox, retrying independently of the run record.

## Etiquette

Sending a notification is easy. Keep it **rare**.

- **Notable events only.** Report what this conversation has established as
  worth reporting and what the user or your supervisor asked to hear about. Do
  not narrate your turn.
- **Follow stated expectations.** "Only tell me when it's done" and "keep me
  posted" both override the defaults above. When you spawn a subagent, say in
  its task what you want to hear about.
- **Steer, don't poll.** Use `notify({ to: "run:<runId>" })` to correct course
  or give the child information it lacks. While the child is working, the
  message steers its current turn; after it reports, fails, or is cancelled, the
  message starts a follow-up turn in the same context. Read progress with
  `inspect_subagent` / `read_subagent` or from the child's report. Asking a
  working child how it is going costs it a turn and gains nothing.
- **Address rather than broadcast.** An addressed message wakes only the people
  who should act; a broadcast makes everyone decide whether it was for them.
- **Break ping cycles.** Do not reply to acknowledgments, do not thank, and do
  not re-notify what the recipient already acknowledged. When an exchange stops
  producing new information, stop messaging. A hop cap exists, but it is a
  safety limit, not a budget.

## Finding someone to talk to

- `list_addressees` — this conversation's roster, your supervisor, and your
  child runs. It does not enumerate unrelated conversations.
- `discover_agents({ query })` — search by _purpose_: "gmail triage", "nightly
  builds". Results carry each instance's own latest deliberate message as its
  overview, and print `agent:<handle>@<channelId>` refs ready to paste into
  `notify`.

**Be findable.** The directory searches each instance's handle, name,
one-line description, and latest deliberate message. Set your description with
`set_description("…")`, saying what you are for and what you are doing here,
and update it when that changes materially. An agent with no description can be
found only by its handle.

An agent instance is a **(worker, channel) pair**. A worker in three
conversations is three instances with three refs, since "message the gmail
agent" is ambiguous without saying _where_. Addressing a bare `agent:<handle>`
when the worker runs in several channels fails and lists the candidates.

Instances that have left their channel remain discoverable with
`includeTerminal`. Their channels persist, so messaging one wakes it; this is
how you resume a conversation with an agent that finished weeks ago. Status is
`running`, `idle`, or `terminal` and changes only on lifecycle events. `idle`
includes an agent whose process was evicted; it wakes on your message just like
a running one.

## Talking to an agent in another conversation

```ts
notify({
  to: "agent:gmail@ch-inbox-triage",
  content:
    "Can you extract the newsletter senders from the last 20 messages tagged `newsletters`?",
});
```

The message arrives as a normal message in _their_ channel, marked as coming
from you and from your channel. A guest message includes the
`agent:<handle>@<channelId>` ref the recipient can use to reply. Your own
channel records a reference to the message, not a copy. Guest messages cannot
be edited after sending.

- The conversation-depth cap travels with the message, so a back-and-forth
  across two channels is bounded the same way as one inside a single channel.
- A channel with locked membership refuses guests and reports a _closed
  channel_ error, not an unknown addressee. Do not retry it.

## What `notify` is not

It does not force a reply. It makes one _possible_ (the recipient is addressed,
so their respond policy can wake them) and _observable_ (the message is stored
and the escalation is recorded). Whether anyone answers is up to them.

For a blocking question you cannot continue without, use `ask_user`.
