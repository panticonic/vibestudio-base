import { Link, Text } from "@radix-ui/themes";
import { CheckIcon } from "@radix-ui/react-icons";
import { ProblemNotice, ResponseFrame, isRecord, safeHref, toList, toText } from "./shared";

export type TimelineStatus = "done" | "current" | "upcoming";

export interface TimelineItem {
  /** When, e.g. "09:30", "Day 2", "Mar 4". */
  time?: string;
  /** What happens. */
  title: string;
  /** Extra line(s) of detail. */
  detail?: string;
  /** Emoji shown on the rail, e.g. "✈️". */
  icon?: string;
  /** Progress state: "done", "current" (highlighted), or "upcoming". Omit for a plain schedule. */
  status?: TimelineStatus;
  /** Link for the title. */
  href?: string;
}

export interface TimelineProps {
  /** Entries in order: itinerary stops, schedule slots, or steps. */
  items: TimelineItem[];
  /** Optional heading. */
  title?: string;
}

const STATUSES: readonly TimelineStatus[] = ["done", "current", "upcoming"];

/** A vertical timeline for itineraries, schedules, and step progress. */
export function Timeline({ items, title }: TimelineProps) {
  const list = toList(items);
  const entries = (list ?? []).filter(isRecord<keyof TimelineItem | "name" | "description">);
  const problems: string[] = [];
  if (!list) problems.push("`items` must be an array of { title, ... }.");
  else if (entries.length < list.length) problems.push(`${list.length - entries.length} items weren't objects and were skipped.`);

  return (
    <ResponseFrame title={title} label="Timeline">
      <ol className="vs-r-timeline">
        {entries.map((item, index) => {
          const status = STATUSES.includes(item["status"] as TimelineStatus) ? (item["status"] as TimelineStatus) : undefined;
          const icon = toText(item["icon"]);
          const href = safeHref(item["href"]);
          const itemTitle = toText(item["title"]) ?? toText(item["name"]) ?? `Step ${index + 1}`;
          const time = toText(item["time"]);
          const detail = toText(item["detail"]) ?? toText(item["description"]);
          return (
            <li
              key={index}
              className="vs-r-timeline-item"
              data-status={status}
              aria-current={status === "current" ? "step" : undefined}
            >
              <span className="vs-r-timeline-marker" aria-hidden>
                {icon ? icon : status === "done" ? <CheckIcon /> : null}
              </span>
              <div className="vs-r-timeline-content">
                {time ? (
                  <Text as="div" size="1" color="gray" weight="medium">
                    {time}
                  </Text>
                ) : null}
                <Text as="div" size="2" weight={status === "current" ? "bold" : "medium"}>
                  {href ? (
                    <Link href={href} target="_blank" rel="noreferrer">
                      {itemTitle}
                    </Link>
                  ) : (
                    itemTitle
                  )}
                  {status ? <span className="vs-r-visually-hidden"> ({status})</span> : null}
                </Text>
                {detail ? (
                  <Text as="div" size="1" color="gray" className="vs-r-prewrap">
                    {detail}
                  </Text>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <ProblemNotice component="Timeline" title="Timeline" problems={problems} />
    </ResponseFrame>
  );
}
