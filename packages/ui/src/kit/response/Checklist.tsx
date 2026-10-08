import { useId, useState } from "react";
import { Checkbox, Flex, Link, Progress, Text } from "@radix-ui/themes";
import { ProblemNotice, ResponseFrame, isRecord, safeHref, toBoolean, toList, toText } from "./shared";

export interface ChecklistItem {
  /** Stable id (defaults to the item's position). */
  id?: string;
  /** What to do. */
  label: string;
  /** Extra detail under the label. */
  detail?: string;
  /** Link shown after the label. */
  href?: string;
  /** Initially checked. */
  checked?: boolean;
}

export interface ChecklistProps {
  /** Items the user can tick off; state is local to this view. */
  items: ChecklistItem[];
  /** Optional heading. */
  title?: string;
}

/** An interactive checklist with a progress count. */
export function Checklist({ items, title }: ChecklistProps) {
  const baseId = useId();
  const list = toList(items);
  const entries = (list ?? [])
    .map((item) => (typeof item === "string" ? { label: item } : item))
    .filter(isRecord<keyof ChecklistItem | "title">)
    .map((item, index) => ({
      key: toText(item.id) ?? String(index),
      label: toText(item.label) ?? toText(item.title) ?? `Item ${index + 1}`,
      detail: toText(item.detail),
      href: safeHref(item.href),
      checked: toBoolean(item.checked),
    }));
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.key, entry.checked])),
  );
  const isChecked = (key: string, fallback: boolean) => checked[key] ?? fallback;
  const done = entries.filter((entry) => isChecked(entry.key, entry.checked)).length;
  const problems: string[] = [];
  if (!list) problems.push("`items` must be an array of { label, ... }.");
  else if (entries.length < list.length) problems.push(`${list.length - entries.length} items were skipped.`);

  return (
    <ResponseFrame title={title} label="Checklist">
      {entries.length > 0 ? (
        <Flex align="center" gap="2" mb="2">
          <Progress
            value={(done / entries.length) * 100}
            size="1"
            aria-label={`${done} of ${entries.length} done`}
            style={{ flex: 1 }}
          />
          <Text size="1" color="gray" aria-hidden>
            {done}/{entries.length}
          </Text>
        </Flex>
      ) : null}
      <ul className="vs-r-checklist">
        {entries.map((entry) => {
          const id = `${baseId}-${entry.key}`;
          const value = isChecked(entry.key, entry.checked);
          return (
            <li key={entry.key} data-checked={value || undefined}>
              <Checkbox
                id={id}
                checked={value}
                onCheckedChange={(next) => setChecked((current) => ({ ...current, [entry.key]: next === true }))}
                aria-describedby={entry.detail ? `${id}-detail` : undefined}
              />
              <div>
                <Text as="label" htmlFor={id} size="2" className="vs-r-checklist-label">
                  {entry.label}
                </Text>
                {entry.href ? (
                  <>
                    {" "}
                    <Link size="1" href={entry.href} target="_blank" rel="noreferrer">
                      Open
                    </Link>
                  </>
                ) : null}
                {entry.detail ? (
                  <Text as="div" size="1" color="gray" id={`${id}-detail`}>
                    {entry.detail}
                  </Text>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <ProblemNotice component="Checklist" title="Checklist" problems={problems} />
    </ResponseFrame>
  );
}
