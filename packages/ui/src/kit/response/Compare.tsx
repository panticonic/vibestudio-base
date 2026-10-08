import { Badge, Text } from "@radix-ui/themes";
import { CheckIcon, Cross2Icon, MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import type { CSSProperties } from "react";
import {
  ProblemNotice,
  ResponseFrame,
  formatValue,
  isRecord,
  toBoolean,
  toList,
  toRecord,
  toText,
  toTextList,
} from "./shared";

export interface CompareOption {
  /** Option name, e.g. "Pixel 9". */
  name: string;
  /** Short line under the name. */
  subtitle?: string;
  /** Small label, e.g. "Best value". */
  badge?: string;
  /** Emphasize this option (e.g. the recommendation). */
  highlight?: boolean;
  /** Price text or number, shown prominently. */
  price?: string | number;
  /** Attribute name → value. Rows align across options; booleans show ✓/✗, missing shows "—". */
  attributes?: Record<string, string | number | boolean>;
  /** Advantages. */
  pros?: string[];
  /** Disadvantages. */
  cons?: string[];
}

export interface CompareProps {
  /** Options shown side by side as cards (stacked on narrow widths). */
  options: CompareOption[];
  /** Optional heading. */
  title?: string;
}

function AttributeValue({ value }: { value: unknown }) {
  if (typeof value === "boolean" || value === "true" || value === "false") {
    const yes = toBoolean(value);
    return yes ? (
      <Text color="grass" aria-label="Yes">
        <CheckIcon aria-hidden />
      </Text>
    ) : (
      <Text color="red" aria-label="No">
        <Cross2Icon aria-hidden />
      </Text>
    );
  }
  const text = formatValue(value);
  return <Text size="2">{text}</Text>;
}

/** Side-by-side option cards with aligned attribute rows, pros, and cons. */
export function Compare({ options, title }: CompareProps) {
  const list = toList(options);
  const cards = (list ?? []).filter(isRecord<keyof CompareOption>);
  const problems: string[] = [];
  if (!list) problems.push("`options` must be an array of { name, ... }.");
  else if (cards.length < list.length) problems.push(`${list.length - cards.length} options weren't objects and were skipped.`);

  const normalized = cards.map((option, index) => ({
    name: toText(option["name"]) ?? `Option ${index + 1}`,
    subtitle: toText(option["subtitle"]),
    badge: toText(option["badge"]),
    highlight: toBoolean(option["highlight"]),
    price: option["price"] == null ? undefined : formatValue(option["price"]),
    attributes: toRecord(option["attributes"]) ?? {},
    pros: toTextList(option["pros"]),
    cons: toTextList(option["cons"]),
  }));
  const attributeKeys: string[] = [];
  for (const option of normalized)
    for (const key of Object.keys(option.attributes)) if (!attributeKeys.includes(key)) attributeKeys.push(key);
  const hasPros = normalized.some((option) => option.pros.length > 0);
  const hasCons = normalized.some((option) => option.cons.length > 0);
  const rows = 1 + attributeKeys.length + (hasPros ? 1 : 0) + (hasCons ? 1 : 0);

  return (
    <ResponseFrame title={title} label="Comparison">
      <div className="vs-r-compare" role="list">
        {normalized.map((option, index) => (
          <article
            key={index}
            role="listitem"
            aria-label={option.name}
            className="vs-r-compare-card"
            data-highlight={option.highlight || undefined}
            style={{ gridRow: `span ${rows}` } as CSSProperties}
          >
            <header className="vs-r-compare-cell">
              {option.badge ? (
                <Badge size="1" color={option.highlight ? undefined : "gray"} mb="1">
                  {option.badge}
                </Badge>
              ) : null}
              <Text as="div" size="3" weight="bold">
                {option.name}
              </Text>
              {option.subtitle ? (
                <Text as="div" size="1" color="gray">
                  {option.subtitle}
                </Text>
              ) : null}
              {option.price ? (
                <Text as="div" size="4" weight="bold" mt="1">
                  {option.price}
                </Text>
              ) : null}
            </header>
            {attributeKeys.map((key) => (
              <div key={key} className="vs-r-compare-cell vs-r-compare-attr">
                <Text size="1" color="gray">
                  {key}
                </Text>
                {Object.hasOwn(option.attributes, key) ? (
                  <AttributeValue value={option.attributes[key]} />
                ) : (
                  <Text size="2" color="gray" aria-label="Not specified">
                    —
                  </Text>
                )}
              </div>
            ))}
            {hasPros ? (
              <ul className="vs-r-compare-cell vs-r-bullets" aria-label="Pros">
                {option.pros.map((pro) => (
                  <li key={pro}>
                    <Text color="grass">
                      <PlusIcon aria-hidden />
                    </Text>
                    <Text size="2">{pro}</Text>
                  </li>
                ))}
              </ul>
            ) : null}
            {hasCons ? (
              <ul className="vs-r-compare-cell vs-r-bullets" aria-label="Cons">
                {option.cons.map((con) => (
                  <li key={con}>
                    <Text color="red">
                      <MinusIcon aria-hidden />
                    </Text>
                    <Text size="2">{con}</Text>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      <ProblemNotice component="Compare" title="Compare" problems={problems} />
    </ResponseFrame>
  );
}
