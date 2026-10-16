/**
 * The response kit for the terminal: the same names, props and conversation
 * protocol as `@workspace/ui/response`. A control that talks back sends the
 * same user message with the same `interaction` metadata as in the browser,
 * so an agent cannot tell which surface answered, and both read "answered"
 * from the durable transcript.
 */
import React, { createContext, useContext, useState } from "react";
import { Box, Text as InkText } from "ink";
import { ButtonFace, Pressable } from "./interaction.js";
import { TextField } from "./controls.js";
import { list, record, text } from "./theme.js";

export interface ResponseInteraction {
  source: string;
  kind: string;
  action: string;
  targetId: string;
  values?: string[];
}

export interface ResponseAnswer {
  text: string;
  values?: string[];
}

export interface ResponseActions {
  send(text: string, options?: { interaction?: ResponseInteraction }): Promise<void>;
  answer(source: string, targetId: string): ResponseAnswer | undefined;
}

const ResponseActionsContext = createContext<ResponseActions | null>(null);

export function ResponseActionsProvider({
  actions,
  children,
}: {
  actions: ResponseActions;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <ResponseActionsContext.Provider value={actions}>{children}</ResponseActionsContext.Provider>
  );
}

export function useResponseActions(): ResponseActions | null {
  return useContext(ResponseActionsContext);
}

function useSend() {
  const actions = useResponseActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = (message: string, interaction?: ResponseInteraction) => {
    if (!actions || pending) return;
    setPending(true);
    setError(null);
    actions
      .send(message, interaction ? { interaction } : undefined)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setPending(false));
  };
  return { actions, pending, error, send };
}

function Problem({ children }: { children: React.ReactNode }): React.ReactElement {
  return <InkText color="red">{children}</InkText>;
}

/** A button that sends a fixed message to the conversation as the person. */
export function ActionButton(props: {
  message?: unknown;
  children?: React.ReactNode;
  id?: unknown;
  action?: unknown;
}): React.ReactElement {
  const { actions, pending, error, send } = useSend();
  const message = text(props.message);
  const id = text(props.id);
  const label = props.children ?? message ?? "Action";
  const answered = id ? actions?.answer("action-button", id) !== undefined : false;
  const disabled = !message || !actions || answered || pending;
  return (
    <Box flexDirection="column">
      <Pressable
        disabled={disabled}
        onPress={() =>
          send(
            message!,
            id
              ? {
                  source: "action-button",
                  kind: "action",
                  action: text(props.action) ?? "press",
                  targetId: id,
                }
              : undefined
          )
        }
      >
        {(focused) => (
          <ButtonFace
            label={answered ? <>✓ {label}</> : pending ? <>… {label}</> : label}
            focused={focused}
            disabled={disabled && !answered}
          />
        )}
      </Pressable>
      {error ? <Problem>Couldn't send: {error}</Problem> : null}
    </Box>
  );
}

interface Option {
  key: string;
  label: string;
  value: string;
  description?: string | undefined;
}

const OTHER = "\u0000other";

/** A multiple-choice follow-up; sending locks it and shows what was chosen. */
export function Choices(props: {
  id?: unknown;
  question?: unknown;
  options?: unknown;
  multiple?: unknown;
  allowOther?: unknown;
  submitLabel?: unknown;
}): React.ReactElement {
  const { actions, pending, error, send } = useSend();
  const targetId = text(props.id);
  const multiple = props.multiple === true || props.multiple === "true";
  const allowOther = props.allowOther === true || props.allowOther === "true";
  const question = text(props.question);
  const options: Option[] = list(props.options).flatMap((raw, index) => {
    const option =
      typeof raw === "string" || typeof raw === "number" ? { label: String(raw) } : record(raw);
    if (!option) return [];
    const label = text(option["label"]) ?? text(option["value"]) ?? `Option ${index + 1}`;
    return [
      {
        key: String(index),
        label,
        value: text(option["value"]) ?? label,
        description: text(option["description"]),
      },
    ];
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  if (!targetId || options.length === 0)
    return (
      <Problem>
        Choices needs {!targetId ? "an `id`" : "a non-empty `options` list"} to work.
      </Problem>
    );
  const recorded = actions?.answer("choices", targetId);
  const sent = recorded ? (recorded.values ?? [recorded.text]) : null;
  const items: Option[] = [
    ...options,
    ...(allowOther ? [{ key: OTHER, label: "Other", value: "" }] : []),
  ];
  const answers = selected.flatMap((key) =>
    key === OTHER
      ? other.trim()
        ? [other.trim()]
        : []
      : options.filter((option) => option.key === key).map((option) => option.value)
  );
  const toggle = (key: string) =>
    setSelected(
      multiple
        ? selected.includes(key)
          ? selected.filter((k) => k !== key)
          : [...selected, key]
        : [key]
    );
  const canSend = !!actions && answers.length > 0 && !pending;
  const submit = () => {
    if (!canSend) return;
    const selection = answers.join(", ");
    send(question ? `${question} → ${selection}` : selection, {
      source: "choices",
      kind: "choice",
      action: "submit",
      targetId,
      values: answers,
    });
  };
  return (
    <Box flexDirection="column">
      {question ? <InkText bold>{question}</InkText> : null}
      {items.map((option) => {
        const chosen = sent
          ? option.key === OTHER
            ? sent.some((value) => !options.some((o) => o.value === value))
            : sent.includes(option.value)
          : selected.includes(option.key);
        const mark = multiple ? (chosen ? "☑" : "☐") : chosen ? "◉" : "○";
        return (
          <Box key={option.key} flexDirection="column">
            <Pressable onPress={() => toggle(option.key)} disabled={sent !== null}>
              {(focused) => (
                <InkText
                  inverse={focused}
                  color={chosen ? "cyan" : undefined}
                  dimColor={sent !== null && !chosen}
                >
                  {mark} {option.label}
                </InkText>
              )}
            </Pressable>
            {option.description ? <InkText dimColor>{`  ${option.description}`}</InkText> : null}
            {option.key === OTHER && selected.includes(OTHER) && !sent ? (
              <Box paddingLeft={2}>
                <TextField.Root
                  value={other}
                  onChange={(event: { target: { value: string } }) => setOther(event.target.value)}
                  placeholder="Your answer"
                />
              </Box>
            ) : null}
          </Box>
        );
      })}
      {sent ? (
        <InkText color="green">✓ Sent</InkText>
      ) : (
        <Pressable onPress={submit} disabled={!canSend}>
          {(focused) => (
            <ButtonFace
              label={pending ? "Sending…" : (text(props.submitLabel) ?? "Send")}
              tone="cyan"
              focused={focused}
              disabled={!canSend}
            />
          )}
        </Pressable>
      )}
      {error ? <Problem>Couldn't send: {error}</Problem> : null}
    </Box>
  );
}

/** Items the person ticks off as they go. */
export function Checklist(props: { items?: unknown; title?: unknown }): React.ReactElement {
  const items = list(props.items).flatMap((raw) => {
    const item = typeof raw === "string" ? { label: raw } : record(raw);
    return item ? [item] : [];
  });
  const [done, setDone] = useState<boolean[]>(() => items.map((item) => item["checked"] === true));
  return (
    <Box flexDirection="column">
      {text(props.title) ? <InkText bold>{text(props.title)}</InkText> : null}
      {items.map((item, index) => (
        <Box key={index} flexDirection="column">
          <Pressable
            onPress={() => setDone(done.map((value, i) => (i === index ? !value : value)))}
          >
            {(focused) => (
              <InkText
                inverse={focused}
                {...(done[index] ? { strikethrough: true, dimColor: true } : {})}
              >
                {done[index] ? "☑" : "☐"} {text(item["label"]) ?? `Item ${index + 1}`}
              </InkText>
            )}
          </Pressable>
          {text(item["detail"]) ? <InkText dimColor>{`  ${text(item["detail"])}`}</InkText> : null}
        </Box>
      ))}
    </Box>
  );
}

const TONE: Record<string, "green" | "red" | "yellow" | "cyan"> = {
  positive: "green",
  good: "green",
  negative: "red",
  bad: "red",
  warning: "yellow",
  neutral: "cyan",
};

/** Figures side by side: label, value, and how it moved. */
export function Stats(props: { items?: unknown; title?: unknown }): React.ReactElement {
  const items = list(props.items).flatMap((raw) => (record(raw) ? [record(raw)!] : []));
  return (
    <Box flexDirection="column">
      {text(props.title) ? <InkText bold>{text(props.title)}</InkText> : null}
      <Box flexDirection="row" flexWrap="wrap" columnGap={4}>
        {items.map((item, index) => (
          <Box key={index} flexDirection="column" marginBottom={0}>
            <InkText dimColor>{text(item["label"]) ?? ""}</InkText>
            <InkText bold color={TONE[String(item["tone"])] ?? undefined}>
              {text(item["value"]) ?? "—"}
              {text(item["delta"]) ? <InkText dimColor>{` ${text(item["delta"])}`}</InkText> : null}
            </InkText>
            {text(item["detail"]) ? <InkText dimColor>{text(item["detail"])}</InkText> : null}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Options compared: name, price, attributes, pros and cons. */
export function Compare(props: { options?: unknown; title?: unknown }): React.ReactElement {
  const options = list(props.options).flatMap((raw) => (record(raw) ? [record(raw)!] : []));
  return (
    <Box flexDirection="column">
      {text(props.title) ? <InkText bold>{text(props.title)}</InkText> : null}
      <Box flexDirection="row" columnGap={2}>
        {options.map((option, index) => (
          <Box
            key={index}
            flexDirection="column"
            flexGrow={1}
            flexBasis={0}
            borderStyle="round"
            borderColor={option["highlight"] === true ? "cyan" : "gray"}
            paddingX={1}
          >
            <InkText bold>
              {text(option["name"]) ?? `Option ${index + 1}`}
              {text(option["badge"]) ? (
                <InkText color="cyan">{` ‹${text(option["badge"])}›`}</InkText>
              ) : null}
            </InkText>
            {text(option["subtitle"]) ? (
              <InkText dimColor>{text(option["subtitle"])}</InkText>
            ) : null}
            {text(option["price"]) ? <InkText>{text(option["price"])}</InkText> : null}
            {Object.entries(record(option["attributes"]) ?? {}).map(([name, value]) => (
              <InkText key={name}>
                <InkText dimColor>{name}: </InkText>
                {value === true ? "✓" : value === false ? "✗" : String(value)}
              </InkText>
            ))}
            {list(option["pros"]).map((pro, i) => (
              <InkText key={`p${i}`} color="green">{`+ ${String(pro)}`}</InkText>
            ))}
            {list(option["cons"]).map((con, i) => (
              <InkText key={`c${i}`} color="red">{`− ${String(con)}`}</InkText>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const STATUS: Record<string, { mark: string; color: "green" | "cyan" | "gray" | "red" }> = {
  done: { mark: "●", color: "green" },
  complete: { mark: "●", color: "green" },
  current: { mark: "◉", color: "cyan" },
  active: { mark: "◉", color: "cyan" },
  upcoming: { mark: "○", color: "gray" },
  pending: { mark: "○", color: "gray" },
  failed: { mark: "✗", color: "red" },
};

/** Events in order, each with its time and status. */
export function Timeline(props: { items?: unknown; title?: unknown }): React.ReactElement {
  const items = list(props.items).flatMap((raw) => (record(raw) ? [record(raw)!] : []));
  return (
    <Box flexDirection="column">
      {text(props.title) ? <InkText bold>{text(props.title)}</InkText> : null}
      {items.map((item, index) => {
        const status = STATUS[String(item["status"])] ?? { mark: "●", color: "gray" as const };
        return (
          <Box key={index} flexDirection="column">
            <InkText>
              <InkText color={status.color}>{status.mark} </InkText>
              {text(item["time"]) ? <InkText dimColor>{`${text(item["time"])}  `}</InkText> : null}
              <InkText bold>{text(item["title"]) ?? ""}</InkText>
            </InkText>
            {text(item["detail"]) ? (
              <InkText dimColor>{`  ${text(item["detail"])}`}</InkText>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
