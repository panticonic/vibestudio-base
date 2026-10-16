/** Text under the browser's names. Everything here may sit inside a line of text. */
import React, { useContext } from "react";
import { Box, Text as InkText } from "ink";
import { InlineContext } from "./interaction.js";
import { tone } from "./theme.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };

/** Text; nested inside other text it stays inline, otherwise it is a line of its own. */
export function Text(props: Loose): React.ReactElement {
  const weight = props["weight"];
  return (
    <InlineContext.Provider value>
      <InkText
        {...(tone(props["color"]) ? { color: tone(props["color"])! } : {})}
        bold={weight === "bold" || weight === "medium" || props["highContrast"] === true}
        dimColor={props["color"] === "gray"}
        {...(props["truncate"] ? { wrap: "truncate-end" as const } : {})}
      >
        {props.children}
      </InkText>
    </InlineContext.Provider>
  );
}

export function Heading(props: Loose): React.ReactElement {
  const inline = useContext(InlineContext);
  const heading = (
    <InkText bold {...(tone(props["color"]) ? { color: tone(props["color"])! } : {})}>
      {props.children}
    </InkText>
  );
  return inline ? heading : <Box marginBottom={0}>{heading}</Box>;
}

export function Strong(props: Loose): React.ReactElement {
  return <InkText bold>{props.children}</InkText>;
}

export function Em(props: Loose): React.ReactElement {
  return <InkText italic>{props.children}</InkText>;
}

export function Code(props: Loose): React.ReactElement {
  return <InkText color={tone(props["color"]) ?? "cyan"}>{props.children}</InkText>;
}

export function Kbd(props: Loose): React.ReactElement {
  return <InkText inverse> {props.children} </InkText>;
}

export function Quote(props: Loose): React.ReactElement {
  return <InkText italic>“{props.children}”</InkText>;
}

/** A link names where it goes: the terminal opens addresses itself (OSC 8 where supported). */
export function Link(props: Loose): React.ReactElement {
  const href = typeof props["href"] === "string" ? props["href"] : undefined;
  const label = (
    <InkText underline color="cyan">
      {props.children ?? href}
    </InkText>
  );
  if (!href) return label;
  return (
    <InkText>
      {`\u001b]8;;${href}\u0007`}
      {label}
      {"\u001b]8;;\u0007"}
    </InkText>
  );
}

/** A small label, in its tone: text, so it never reads as something to press. */
export function Badge(props: Loose): React.ReactElement {
  return (
    <InkText color={tone(props["color"]) ?? "cyan"} bold>
      ‹{props.children}›
    </InkText>
  );
}

export function Blockquote(props: Loose): React.ReactElement {
  return (
    <Box
      borderStyle="bold"
      borderColor="gray"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      flexDirection="column"
    >
      {props.children}
    </Box>
  );
}

/** A note with a bar in its tone down the left. */
function CalloutRoot(props: Loose): React.ReactElement {
  const color = tone(props["color"]) ?? "cyan";
  return (
    <Box
      borderStyle="bold"
      borderColor={color}
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      flexDirection="row"
      columnGap={1}
    >
      {props.children}
    </Box>
  );
}

function CalloutIcon(): React.ReactElement {
  return <InkText>ⓘ</InkText>;
}

function CalloutText(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="column" flexShrink={1}>
      <Text {...props} />
    </Box>
  );
}

export const Callout = { Root: CalloutRoot, Icon: CalloutIcon, Text: CalloutText };

/** Preformatted text with a bar down the left, and a caption naming what it is. */
export function CodeBlock({
  caption,
  children,
}: {
  caption?: string | undefined;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {caption ? <InkText dimColor>{caption}</InkText> : null}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        borderDimColor
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        paddingLeft={1}
      >
        <InkText>{children}</InkText>
      </Box>
    </Box>
  );
}
