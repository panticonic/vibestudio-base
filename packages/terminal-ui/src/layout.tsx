/** Layout under the browser's names: Box, Flex, Grid, Card, Section, Separator… */
import React from "react";
import { Box as InkBox, Text } from "ink";
import { space, tone } from "./theme.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };

const ALIGN: Record<string, "flex-start" | "center" | "flex-end" | "stretch"> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "flex-start",
};
const JUSTIFY: Record<
  string,
  "flex-start" | "center" | "flex-end" | "space-between" | "space-around"
> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
};

function padding(props: Loose) {
  const all = space(props["p"], "row");
  return {
    paddingX: props["px"] !== undefined ? space(props["px"], "row") : all,
    paddingY:
      props["py"] !== undefined ? space(props["py"], "column") : space(props["p"], "column"),
    marginTop: space(props["mt"] ?? props["my"], "column"),
    marginBottom: space(props["mb"] ?? props["my"], "column"),
  };
}

export function Box(props: Loose): React.ReactElement {
  return (
    <InkBox flexDirection="column" {...padding(props)}>
      {props.children}
    </InkBox>
  );
}

export function Flex(props: Loose): React.ReactElement {
  const direction = String(props["direction"] ?? "row");
  const column = direction.startsWith("column");
  const gap = space(props["gap"], column ? "column" : "row");
  return (
    <InkBox
      flexDirection={direction as "row" | "column" | "row-reverse" | "column-reverse"}
      {...(props["align"] ? { alignItems: ALIGN[String(props["align"])] ?? "flex-start" } : {})}
      {...(props["justify"]
        ? { justifyContent: JUSTIFY[String(props["justify"])] ?? "flex-start" }
        : {})}
      {...(props["wrap"] === "wrap" ? { flexWrap: "wrap" as const } : {})}
      {...(column ? { rowGap: gap } : { columnGap: gap })}
      {...padding(props)}
    >
      {props.children}
    </InkBox>
  );
}

/** Columns of equal width; children fill them row by row. */
export function Grid(props: Loose): React.ReactElement {
  const raw = props["columns"];
  const count = Math.max(
    1,
    Number(raw && typeof raw === "object" ? (raw as Record<string, unknown>)["initial"] : raw) || 1
  );
  const children = React.Children.toArray(props.children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < children.length; i += count) rows.push(children.slice(i, i + count));
  const gap = space(props["gap"], "row");
  return (
    <InkBox flexDirection="column" rowGap={space(props["gap"], "column")} {...padding(props)}>
      {rows.map((row, index) => (
        <InkBox key={index} flexDirection="row" columnGap={gap}>
          {row.map((cell, column) => (
            <InkBox key={column} flexDirection="column" flexGrow={1} flexBasis={0}>
              {cell}
            </InkBox>
          ))}
        </InkBox>
      ))}
    </InkBox>
  );
}

/** A framed group. */
export function Card(props: Loose): React.ReactElement {
  return (
    <InkBox flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {props.children}
    </InkBox>
  );
}

export function Section(props: Loose): React.ReactElement {
  return (
    <InkBox flexDirection="column" marginBottom={1}>
      {props.children}
    </InkBox>
  );
}

export const Container = Box;
export const Inset = Box;

/** A rule across the available width. */
export function Separator(props: Loose): React.ReactElement {
  if (props["orientation"] === "vertical") return <Text dimColor> │ </Text>;
  return (
    <InkBox
      flexGrow={1}
      borderStyle="single"
      borderColor={tone(props["color"]) ?? "gray"}
      borderDimColor
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    />
  );
}

/** Content that only makes sense with a pointer: shown as its children. */
export function Passthrough(props: Loose): React.ReactElement {
  return <>{props.children}</>;
}
