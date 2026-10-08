import { useId, useState } from "react";
import { Button, CheckboxGroup, Flex, RadioGroup, Text, TextField } from "@radix-ui/themes";
import { CheckCircledIcon } from "@radix-ui/react-icons";
import { NO_ACTIONS_REASON, UnavailableReason, useResponseActions } from "./actions";
import { ProblemNotice, ResponseFrame, isRecord, toBoolean, toList, toText } from "./shared";

export interface ChoiceOption {
  /** Text shown for the option. */
  label: string;
  /** Text sent when chosen. Defaults to `label`. */
  value?: string;
  /** Smaller explanatory line under the label. */
  description?: string;
}

export interface ChoicesProps {
  /** Stable id for this question; sent as `interaction.targetId`. Required. */
  id: string;
  /** The question being asked. */
  question?: string;
  /** Options; plain strings are accepted as labels. */
  options: (ChoiceOption | string)[];
  /** Allow selecting several options. */
  multiple?: boolean;
  /** Add an "Other" option with a free-text field. */
  allowOther?: boolean;
  /** Submit button text. Default "Send". */
  submitLabel?: string;
}

const OTHER = "\u0000other";

/**
 * A multiple-choice follow-up. Submitting sends the selection as a user
 * message with `interaction: { source: "choices", kind: "choice", action: "submit", targetId: id }`,
 * then locks and shows what was chosen.
 */
export function Choices({ id, question, options, multiple, allowOther, submitLabel }: ChoicesProps) {
  const actions = useResponseActions();
  const baseId = useId();
  const isMultiple = toBoolean(multiple);
  const withOther = toBoolean(allowOther);
  const list = toList(options);
  const normalized = (list ?? [])
    .map((option) => (typeof option === "string" || typeof option === "number" ? { label: String(option) } : option))
    .filter(isRecord<keyof ChoiceOption>)
    .map((option, index) => {
      const label = toText(option.label) ?? toText(option.value) ?? `Option ${index + 1}`;
      return { key: String(index), label, value: toText(option.value) ?? label, description: toText(option.description) };
    });
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  const targetId = toText(id);
  const problems: string[] = [];
  if (!targetId) problems.push("`id` is required so the answer can be matched to this question.");
  if (!list || normalized.length === 0) problems.push("`options` must be a non-empty array.");

  const answers = selected.flatMap((key) => {
    if (key === OTHER) return other.trim() ? [other.trim()] : [];
    const option = normalized.find((o) => o.key === key);
    return option ? [option.value] : [];
  });
  const otherIncomplete = selected.includes(OTHER) && !other.trim();
  const canSubmit = Boolean(actions && targetId && answers.length > 0 && !otherIncomplete && !pending);
  const questionText = toText(question);
  const label = questionText ?? "Choose an option";

  const submit = () => {
    if (!actions || !targetId || !canSubmit) return;
    const selection = answers.join(", ");
    const text = questionText ? `${questionText} → ${selection}` : selection;
    setPending(true);
    setError(null);
    actions
      .send(text, {
        interaction: { source: "choices", kind: "choice", action: "submit", targetId, values: answers },
      })
      .then(() => setSubmitted(answers))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setPending(false));
  };

  if (problems.length > 0 && normalized.length === 0) {
    return (
      <ResponseFrame label={label}>
        <ProblemNotice component="Choices" title="Choices" problems={problems} />
      </ResponseFrame>
    );
  }

  // The durable transcript decides; local state only covers the send in flight.
  const recorded = targetId ? actions?.answer("choices", targetId) : undefined;
  const sentValues = recorded ? (recorded.values ?? [recorded.text]) : submitted;
  const locked = sentValues !== null;
  const items = [
    ...normalized,
    ...(withOther ? [{ key: OTHER, label: "Other", value: "", description: undefined }] : []),
  ];
  // Which options a locked control shows as chosen; values matching no option
  // are the free-text "Other" answer.
  const lockedKeys: string[] = [];
  let lockedOther = "";
  for (const value of sentValues ?? []) {
    const match = normalized.find((o) => o.value === value && !lockedKeys.includes(o.key));
    if (match) lockedKeys.push(match.key);
    else if (withOther) {
      if (!lockedKeys.includes(OTHER)) lockedKeys.push(OTHER);
      lockedOther = lockedOther ? `${lockedOther}, ${value}` : value;
    }
  }
  const shownKeys = locked ? lockedKeys : selected;
  const optionContent = (option: (typeof items)[number]) => (
    <Flex direction="column">
      <Text size="2">{option.label}</Text>
      {option.description ? (
        <Text size="1" color="gray">
          {option.description}
        </Text>
      ) : null}
    </Flex>
  );

  const submitButton = (
    <Button type="submit" size="2" disabled={!canSubmit} loading={pending}>
      {toText(submitLabel) ?? "Send"}
    </Button>
  );

  return (
    <ResponseFrame label={label} className="vs-r-choices">
      <form
        aria-labelledby={questionText ? `${baseId}-q` : undefined}
        aria-label={questionText ? undefined : label}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {questionText ? (
          <Text as="p" id={`${baseId}-q`} size="2" weight="bold" mb="2">
            {questionText}
          </Text>
        ) : null}
        {isMultiple ? (
          <CheckboxGroup.Root value={shownKeys} onValueChange={setSelected} disabled={locked} aria-label={label}>
            {items.map((option) => (
              <CheckboxGroup.Item key={option.key} value={option.key} className="vs-r-choice">
                {optionContent(option)}
              </CheckboxGroup.Item>
            ))}
          </CheckboxGroup.Root>
        ) : (
          <RadioGroup.Root
            value={shownKeys[0] ?? ""}
            onValueChange={(value) => setSelected([value])}
            disabled={locked}
            aria-label={label}
          >
            {items.map((option) => (
              <RadioGroup.Item key={option.key} value={option.key} className="vs-r-choice">
                {optionContent(option)}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        )}
        {withOther && locked && lockedOther ? (
          <TextField.Root mt="2" size="2" aria-label="Other answer" value={lockedOther} readOnly disabled />
        ) : null}
        {withOther && selected.includes(OTHER) && !locked ? (
          <TextField.Root
            mt="2"
            size="2"
            placeholder="Your answer"
            aria-label="Other answer"
            value={other}
            onChange={(event) => setOther(event.target.value)}
            autoFocus
          />
        ) : null}
        <Flex mt="3" gap="2" align="center" wrap="wrap">
          {locked ? (
            <Text size="2" color="grass" role="status">
              <CheckCircledIcon aria-hidden /> Sent: {sentValues.join(", ")}
            </Text>
          ) : actions ? (
            submitButton
          ) : (
            <UnavailableReason reason={NO_ACTIONS_REASON}>{submitButton}</UnavailableReason>
          )}
          {error ? (
            <Text size="1" color="red" role="alert">
              Couldn't send: {error}
            </Text>
          ) : null}
        </Flex>
      </form>
      <ProblemNotice component="Choices" title="Choices" problems={problems} />
    </ResponseFrame>
  );
}
