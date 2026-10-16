/** Tables, data lists, progress and the like under the browser's names. */
import React from "react";
import { Box, Text as InkText } from "ink";
import { tone } from "./theme.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };

const HeaderContext = React.createContext(false);

function TableRoot(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {props.children}
    </Box>
  );
}

function TableHeader(props: Loose): React.ReactElement {
  return (
    <HeaderContext.Provider value>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        borderDimColor
        borderTop={false}
        borderLeft={false}
        borderRight={false}
      >
        {props.children}
      </Box>
    </HeaderContext.Provider>
  );
}

function TableBody(props: Loose): React.ReactElement {
  return <Box flexDirection="column">{props.children}</Box>;
}

function TableRow(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="row" columnGap={2}>
      {props.children}
    </Box>
  );
}

function TableCell(props: Loose): React.ReactElement {
  const header = React.useContext(HeaderContext);
  return (
    <Box flexGrow={1} flexBasis={0} flexDirection="column">
      <InkText bold={header}>{props.children}</InkText>
    </Box>
  );
}

function TableRowHeaderCell(props: Loose): React.ReactElement {
  return (
    <Box flexGrow={1} flexBasis={0} flexDirection="column">
      <InkText bold>{props.children}</InkText>
    </Box>
  );
}

export const Table = {
  Root: TableRoot,
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  Cell: TableCell,
  ColumnHeaderCell: TableCell,
  RowHeaderCell: TableRowHeaderCell,
};

function DataListRoot(props: Loose): React.ReactElement {
  return <Box flexDirection="column">{props.children}</Box>;
}

function DataListItem(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="row" columnGap={2}>
      {props.children}
    </Box>
  );
}

function DataListLabel(props: Loose): React.ReactElement {
  return (
    <Box width="35%" flexShrink={0}>
      <InkText dimColor>{props.children}</InkText>
    </Box>
  );
}

function DataListValue(props: Loose): React.ReactElement {
  return (
    <Box flexGrow={1} flexDirection="column">
      <InkText>{props.children}</InkText>
    </Box>
  );
}

export const DataList = {
  Root: DataListRoot,
  Item: DataListItem,
  Label: DataListLabel,
  Value: DataListValue,
};

/** A bar of `value` out of `max` (default 100). */
export function Progress(props: Loose): React.ReactElement {
  const max = Number(props["max"] ?? 100) || 100;
  const value = Math.min(max, Math.max(0, Number(props["value"] ?? 0) || 0));
  const cells = 20;
  const filled = Math.round((value / max) * cells);
  return (
    <InkText>
      <InkText color={tone(props["color"]) ?? "cyan"}>{"█".repeat(filled)}</InkText>
      <InkText dimColor>{"░".repeat(cells - filled)}</InkText>
      <InkText dimColor>{` ${Math.round((value / max) * 100)}%`}</InkText>
    </InkText>
  );
}

export function Spinner(props: Loose): React.ReactElement {
  return <InkText dimColor>{props.children ?? "…"}</InkText>;
}

/** An avatar is its fallback: a name's initials. */
export function Avatar(props: Loose): React.ReactElement {
  const fallback = props["fallback"];
  return (
    <InkText inverse color={tone(props["color"]) ?? "gray"}>
      {` ${typeof fallback === "string" ? fallback : "•"} `}
    </InkText>
  );
}

/** What only a graphical client can show, named so the person knows it is there. */
export function Unavailable({ what }: { what: string }): React.ReactElement {
  return <InkText dimColor>{`▣ ${what} (shown in the desktop app)`}</InkText>;
}
