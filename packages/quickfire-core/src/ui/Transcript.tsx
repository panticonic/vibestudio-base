/**
 * The conversation itself: one implementation, both clients (spec §4.3, §7.2).
 *
 * Everything here reads from `QuickfireCard` (../cards) and draws through the
 * skin (./primitives), so what a card *means* is decided in one pure module,
 * what it *looks like* is decided in one component tree, and what it is *made
 * of* is the only thing each platform still owns.
 *
 * The rule the old surfaces broke, and this one keeps: detail is always
 * reachable. A message's failure text, a tool's input and output, an approval's
 * reason, a card the venue cannot run — none of it is summarized away. It is
 * collapsed, which is a different thing, and every collapse says what is inside.
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  QuickfireCard,
  QuickfireCardActionId,
  QuickfireDetail,
} from "../cards";
import { Markdown } from "./Markdown";
import { useSkin } from "./primitives";

export interface TranscriptProps {
  cards: readonly QuickfireCard[];
  /** Invoked when a card offers something this venue cannot do itself. */
  onAction?: (
    action: QuickfireCardActionId,
    card: QuickfireCard,
    value?: string,
  ) => void;
  /**
   * Rendered above the list when older entries were trimmed. The surface owns
   * the affordance because only it knows whether they can be pulled in.
   */
  header?: ReactNode;
  footer?: ReactNode;
}

/** One disclosure state owner preserves manual choices across streaming updates. */
const DetailState = createContext<{
  expanded: Record<string, boolean>;
  toggle: (id: string, open: boolean) => void;
} | null>(null);

function detailKeys(card: QuickfireCard): string[] {
  return [
    ...card.details.map((detail) => `${card.id}:${detail.id}`),
    ...card.work.map((work) => `${card.id}:work:${work.id}`),
  ];
}

function searchableText(card: QuickfireCard): string {
  return [
    card.plainText,
    card.title,
    card.meta,
    ...card.details.map((detail) => detail.text),
    ...card.work.flatMap((work) => [
      work.name,
      ...work.details.map((detail) => detail.text),
    ]),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function Transcript({
  cards,
  onAction,
  header,
  footer,
}: TranscriptProps) {
  const { Box, Text, Pressable, Input, Icon } = useSkin();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text
      ? cards.filter((card) => searchableText(card).includes(text))
      : cards;
  }, [cards, query]);
  const keys = filtered.flatMap(detailKeys);
  const defaultExpanded = Object.fromEntries(
    filtered.flatMap((card) =>
      card.details.map((detail) => [
        `${card.id}:${detail.id}`,
        (card.kind === "thinking" && card.busy) || detail.id === "error",
      ]),
    ),
  );
  const allExpanded =
    keys.length > 0 &&
    keys.every((key) => expanded[key] ?? defaultExpanded[key]);
  const context = useMemo(
    () => ({
      expanded,
      toggle: (id: string, open: boolean) =>
        setExpanded((current) => ({ ...current, [id]: open })),
    }),
    [expanded],
  );
  const expandDetails = (open: boolean) =>
    setExpanded((current) => ({
      ...current,
      ...Object.fromEntries(keys.map((key) => [key, open])),
    }));
  return (
    <DetailState.Provider value={context}>
      <Box gap="md" testId="quickfire-transcript">
        <Box gap="xs" testId="quickfire-history-toolbar">
          <Box row gap="sm" align="center">
            {header}
            <Box grow />
            {keys.length ? (
              <Pressable
                label={
                  allExpanded
                    ? "Collapse all history details"
                    : "Expand all history details"
                }
                onPress={() => expandDetails(!allExpanded)}
              >
                <Icon name={allExpanded ? "collapse" : "expand"} tone="muted" />
              </Pressable>
            ) : null}
            <Pressable
              label={
                searching
                  ? "Close history search"
                  : "Search conversation history"
              }
              onPress={() => {
                setSearching(!searching);
                setQuery("");
              }}
            >
              <Icon name={searching ? "cross" : "search"} tone="muted" />
            </Pressable>
          </Box>
          {searching ? (
            <Box gap="xs">
              <Input
                label="Search conversation history"
                placeholder="Search messages, tools, inputs, and results…"
                value={query}
                onChange={setQuery}
              />
              <Text variant="caption" tone="muted">
                {filtered.length} of {cards.length} loaded entries. Load earlier
                history to search further back.
              </Text>
            </Box>
          ) : null}
        </Box>
        <Box row gap="xs">
          {filtered.map((card) => (
            <TranscriptCard
              key={card.id}
              card={card}
              {...(onAction ? { onAction } : {})}
            />
          ))}
        </Box>
        {filtered.length === 0 ? (
          <Box surface="sunken" pad="md">
            <Text tone="muted">
              No matching entries. Try a tool name, a path, or a phrase from the
              conversation.
            </Text>
          </Box>
        ) : null}
        {footer ? <Box full>{footer}</Box> : null}
      </Box>
    </DetailState.Provider>
  );
}

export function TranscriptCard({
  card,
  onAction,
}: {
  card: QuickfireCard;
  onAction?: (
    action: QuickfireCardActionId,
    card: QuickfireCard,
    value?: string,
  ) => void;
}) {
  const { Box, Text, Icon, Spinner, Pill } = useSkin();
  const speech = card.layout === "speech";
  const agentMessage = card.kind === "message" && card.role === "agent";
  const answer = agentMessage && card.tier !== "secondary";
  const supportingSpeech = agentMessage && card.tier === "secondary";
  const presentationTone =
    answer && card.tone === "neutral" ? "accent" : card.tone;
  const standaloneWork = card.kind === "tool" ? card.work[0] : undefined;
  if (standaloneWork) {
    return (
      <WorkRecord
        record={standaloneWork}
        card={card}
        {...(onAction ? { onAction } : {})}
        testId={`quickfire-card-${card.id}`}
      />
    );
  }
  // Reasoning is a heading *and* a disclosure — it has nothing else in it. Two
  // rows for one idea read as a stutter, so the heading is the summary.
  const headerIsDisclosure =
    card.kind === "thinking" && card.details.length === 1;
  const header = (
    <Box row gap="xs" align="center">
      {card.busy ? (
        <Spinner tone={presentationTone} />
      ) : (
        <Icon name={card.glyph} tone={presentationTone} />
      )}
      {/* A speaker's name is a label; a thought is a sentence, and setting one
          in small caps makes it unreadable at exactly the size it is shown. */}
      <Text
        variant={
          card.kind === "thinking" && !headerIsDisclosure ? "caption" : "strong"
        }
        tone={answer ? presentationTone : speech ? "muted" : card.tone}
      >
        {headerIsDisclosure ? "Reasoning" : card.title}
      </Text>
      {card.badges.map((badge) => (
        <Pill key={badge.id} tone={badge.tone}>
          {badge.label}
        </Pill>
      ))}
      <Box grow />
      {card.meta ? (
        <Text variant="caption" tone="muted">
          {card.meta}
        </Text>
      ) : null}
      {card.kind === "thinking" &&
      !headerIsDisclosure &&
      card.actions.length > 0 ? (
        <CardActions card={card} {...(onAction ? { onAction } : {})} />
      ) : null}
    </Box>
  );
  return (
    <Box
      surface={
        answer ? "answer" : supportingSpeech || !speech ? "rail" : "card"
      }
      tone={answer ? presentationTone : card.tone}
      pad={answer ? "md" : "sm"}
      full={card.kind !== "thinking"}
      fit={card.kind === "thinking"}
      gap="sm"
      testId={`quickfire-card-${card.id}`}
      {...(card.busy ? { live: true } : {})}
      {...(card.focused ? { emphasis: true } : {})}
    >
      {/* Every message retains its speaker, model, time, and status, including
          consecutive messages from the same agent. */}
      {headerIsDisclosure ? null : header}

      {card.body ? (
        card.body.format === "markdown" ? (
          // The caret rides the last line of the prose, which is where a cursor
          // belongs; a block-level one reads as an empty bullet.
          <Markdown
            source={card.body.text}
            {...(card.busy && card.layout === "speech" ? { caret: true } : {})}
          />
        ) : (
          <Text selectable>{card.body.text}</Text>
        )
      ) : null}

      {card.details.map((detail) => (
        <Detail
          key={detail.id}
          stateKey={`${card.id}:${detail.id}`}
          detail={detail}
          tone={card.tone}
          {...(headerIsDisclosure
            ? {
                summary: (
                  <Box grow gap="xs">
                    {header}
                    <Text variant="caption" tone="muted">
                      {card.title}
                    </Text>
                  </Box>
                ),
                label: `Reasoning: ${card.title}`,
              }
            : {})}
          defaultOpen={
            (card.kind === "thinking" && card.busy) || detail.id === "error"
          }
          extra={
            card.kind === "thinking" && card.actions.length > 0 ? (
              <CardActions card={card} {...(onAction ? { onAction } : {})} />
            ) : null
          }
        />
      ))}

      {card.work.length > 0 ? (
        <Box row gap="xs">
          {card.work.map((record) => (
            <WorkRecord
              key={record.id}
              record={record}
              card={card}
              {...(onAction ? { onAction } : {})}
            />
          ))}
        </Box>
      ) : null}

      {card.actions.length > 0 && card.kind !== "thinking" ? (
        <CardActions card={card} {...(onAction ? { onAction } : {})} />
      ) : null}
    </Box>
  );
}

function WorkRecord({
  record,
  card,
  onAction,
  testId,
}: {
  record: QuickfireCard["work"][number];
  card: QuickfireCard;
  onAction?: (
    action: QuickfireCardActionId,
    card: QuickfireCard,
    value?: string,
  ) => void;
  testId?: string;
}) {
  const { Box, Text, Icon, Spinner } = useSkin();
  return (
    <Box
      surface="outline"
      fit
      // A green frame around every completed call shouts about the ordinary
      // case; the glyph already says it went fine.
      {...(record.state === "done" ? {} : { tone: record.tone })}
      gap="none"
      {...(testId ? { testId } : {})}
    >
      <Detail
        stateKey={`${card.id}:work:${record.id}`}
        defaultOpen={false}
        tone={record.tone}
        summary={
          <Box gap="xs">
            <Box row gap="sm" align="center">
              {record.busy ? (
                <Spinner tone={record.tone} />
              ) : (
                <Icon name={record.glyph} tone={record.tone} />
              )}
              <Text variant="strong">{record.name}</Text>
              <Text variant="caption" tone={record.tone}>
                {record.statusLabel}
              </Text>
            </Box>
            {record.state === "failed" && record.preview ? (
              <Text
                variant="caption"
                tone={record.state === "failed" ? "danger" : "muted"}
              >
                {record.preview}
              </Text>
            ) : null}
          </Box>
        }
        label={`${record.name} — ${record.statusLabel}`}
        detail={null}
        sections={record.details}
        extra={
          record.images.length > 0 ? (
            <Images
              images={record.images}
              {...(onAction ? { onAction } : {})}
              card={card}
            />
          ) : null
        }
      />
    </Box>
  );
}

function Images({
  images,
  card,
  onAction,
}: {
  images: QuickfireCard["work"][number]["images"];
  card: QuickfireCard;
  onAction?: (
    action: QuickfireCardActionId,
    card: QuickfireCard,
    value?: string,
  ) => void;
}) {
  const { Box, Text, Figure, Pressable } = useSkin();
  return (
    <Box gap="sm" pad="sm" testId="quickfire-images">
      {images.map((image) =>
        image.dataUrl ? (
          <Figure
            key={image.id}
            src={image.dataUrl}
            alt={image.alt}
            caption={image.label}
          />
        ) : (
          // Desktop keeps the bytes out of its props until they are wanted, so
          // the offer has to say what is behind it.
          <Pressable
            key={image.id}
            variant="ghost"
            tone="accent"
            label={`Show ${image.alt}, ${image.label}`}
            onPress={() => onAction?.("reveal-image", card, image.id)}
          >
            <Text variant="caption" tone="accent">
              Show image · {image.label}
            </Text>
          </Pressable>
        ),
      )}
    </Box>
  );
}

/**
 * The row of things you can do with a card.
 *
 * Copy is answered here rather than bubbled: the skin already knows how to put
 * text on the clipboard, the surface has nothing to add, and the confirmation
 * belongs next to the button that earned it.
 */
function CardActions({
  card,
  onAction,
}: {
  card: QuickfireCard;
  onAction?: (
    action: QuickfireCardActionId,
    card: QuickfireCard,
    value?: string,
  ) => void;
}) {
  const { Box, Text, Icon, Pressable, copy } = useSkin();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <Box row gap="xs" hover testId="quickfire-card-actions">
      {card.actions.map((action) => (
        <Pressable
          key={action.id}
          variant="ghost"
          tone="accent"
          label={
            action.id === "copy"
              ? copied
                ? "Copied"
                : copyError
                  ? "Copy failed, try again"
                  : action.label
              : action.label
          }
          onPress={() => {
            if (action.id === "copy" && copy) {
              setCopyError(false);
              void Promise.resolve()
                .then(() => copy(action.value ?? card.plainText))
                .then(() => setCopied(true))
                .catch(() => {
                  setCopied(false);
                  setCopyError(true);
                });
              return;
            }
            onAction?.(action.id, card, action.value);
          }}
        >
          {action.id === "copy" ? (
            <Icon
              name={copied ? "check" : copyError ? "alert" : "copy"}
              tone="muted"
            />
          ) : (
            <Text variant="caption" tone="accent">
              {action.label} →
            </Text>
          )}
        </Pressable>
      ))}
    </Box>
  );
}

/**
 * A collapsed block of detail.
 *
 * Two shapes, one component: a single named payload (a message's failure text),
 * or a set of them under one summary (a tool call's input/progress/output).
 * Either way the summary names what is inside, so "expand" is never a gamble.
 */
function Detail({
  stateKey,
  detail,
  sections,
  summary,
  label,
  tone,
  defaultOpen,
  extra,
}: {
  stateKey: string;
  detail: QuickfireDetail | null;
  sections?: readonly QuickfireDetail[];
  summary?: ReactNode;
  label?: string;
  tone?: QuickfireCard["tone"];
  defaultOpen?: boolean;
  /** Rendered above the named sections — pictures before their JSON. */
  extra?: ReactNode;
}) {
  const { Box, Text, Disclosure, Code } = useSkin();
  const state = useContext(DetailState);
  const [initialOpen] = useState(Boolean(defaultOpen));
  const payload = sections ?? (detail ? [detail] : []);
  const summaryLabel = label ?? detail?.label ?? "Details";
  return (
    <Disclosure
      label={summaryLabel}
      {...(state
        ? {
            open: state.expanded[stateKey] ?? initialOpen,
            onOpenChange: (open: boolean) => state.toggle(stateKey, open),
          }
        : {})}
      {...(tone ? { tone } : {})}
      {...(defaultOpen ? { defaultOpen } : {})}
      summary={
        summary ?? (
          <Text variant="caption" tone="muted">
            {summaryLabel}
          </Text>
        )
      }
      testId={`quickfire-detail-${detail?.id ?? summaryLabel}`}
    >
      {extra}
      {payload.length === 0 ? (
        extra ? null : (
          <Text variant="caption" tone="muted">
            No details were recorded.
          </Text>
        )
      ) : (
        <Box gap="sm" pad="sm">
          {payload.map((section) =>
            section.format === "markdown" ? (
              <Box key={section.id} gap="xs">
                {sections ? (
                  <Text variant="label" tone="muted">
                    {section.label}
                  </Text>
                ) : null}
                <Markdown source={section.text} />
              </Box>
            ) : section.format === "text" ? (
              <Box key={section.id} gap="xs">
                {sections ? (
                  <Text variant="label" tone="muted">
                    {section.label}
                  </Text>
                ) : null}
                <Text selectable>{section.text}</Text>
              </Box>
            ) : (
              <Code
                key={section.id}
                text={section.text}
                language={section.language}
                caption={section.label}
              />
            ),
          )}
        </Box>
      )}
    </Disclosure>
  );
}
