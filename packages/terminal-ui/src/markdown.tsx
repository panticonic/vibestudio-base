/**
 * The elements an MDX message compiles to (`p`, `ul`, `pre`, `table`, …),
 * drawn for a terminal. Ink only lets text sit inside `<Text>`, so every
 * block gathers its inline runs (strings, emphasis, links, inline controls)
 * into text of their own and lays out its blocks as boxes.
 */
import React, { createContext, useContext } from "react";
import { Box, Text as InkText } from "ink";
import { InlineContext } from "./interaction.js";
import { Separator } from "./layout.js";
import { Unavailable } from "./data.js";
import { Blockquote, Link, Strong, Em, Code, Heading } from "./text.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };

/** Components that draw as text, so they may share a line with words. */
const INLINE = new Set<unknown>();

export function markInline(...components: unknown[]): void {
  for (const component of components) INLINE.add(component);
}

function isInline(node: React.ReactNode): boolean {
  if (typeof node === "string" || typeof node === "number") return true;
  if (!React.isValidElement(node)) return false;
  return INLINE.has(node.type);
}

/** Children with fragments opened: an MDX document is one fragment of blocks. */
function flatten(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((child) =>
    React.isValidElement(child) && child.type === React.Fragment
      ? flatten((child.props as { children?: React.ReactNode }).children)
      : [child]
  );
}

/** Children laid out as blocks, with each run of inline content as one line of text. */
export function Blocks({ children }: { children?: React.ReactNode }): React.ReactElement {
  const out: React.ReactNode[] = [];
  let run: React.ReactNode[] = [];
  const flush = () => {
    if (run.some((node) => !(typeof node === "string" && node.trim() === "")))
      out.push(
        <InlineContext.Provider key={`t${out.length}`} value>
          <InkText>{run}</InkText>
        </InlineContext.Provider>
      );
    run = [];
  };
  for (const child of flatten(children)) {
    if (isInline(child)) run.push(child);
    else {
      flush();
      out.push(child);
    }
  }
  flush();
  return <>{out}</>;
}

function Paragraph(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Blocks>{props.children}</Blocks>
    </Box>
  );
}

function headingAt(level: number) {
  return function MarkdownHeading(props: Loose): React.ReactElement {
    return (
      <Box marginBottom={level <= 2 ? 1 : 0}>
        <Heading color={level === 1 ? "cyan" : undefined}>{props.children}</Heading>
      </Box>
    );
  };
}

const ListContext = createContext<{ ordered: boolean; start: number } | null>(null);

function List(ordered: boolean) {
  return function MarkdownList(props: Loose): React.ReactElement {
    const start = Number(props["start"] ?? 1) || 1;
    const items = React.Children.toArray(props.children).filter(React.isValidElement);
    return (
      <Box flexDirection="column" marginBottom={useContext(ListContext) ? 0 : 1}>
        {items.map((item, index) => (
          <ListContext.Provider key={index} value={{ ordered, start: start + index }}>
            {item}
          </ListContext.Provider>
        ))}
      </Box>
    );
  };
}

function ListItem(props: Loose): React.ReactElement {
  const list = useContext(ListContext);
  const marker = list?.ordered ? `${list.start}.` : "•";
  return (
    <Box flexDirection="row" columnGap={1}>
      <InkText dimColor>{marker}</InkText>
      <Box flexDirection="column" flexShrink={1}>
        <ListContext.Provider value={list}>
          <Blocks>{props.children}</Blocks>
        </ListContext.Provider>
      </Box>
    </Box>
  );
}

const PreContext = createContext(false);

function Pre(props: Loose): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      borderDimColor
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      paddingLeft={1}
      marginBottom={1}
    >
      <PreContext.Provider value>
        <InkText>{props.children}</InkText>
      </PreContext.Provider>
    </Box>
  );
}

function InlineCode(props: Loose): React.ReactElement {
  const inPre = useContext(PreContext);
  if (inPre) return <InkText>{String(props.children ?? "").replace(/\n$/, "")}</InkText>;
  return <Code>{props.children}</Code>;
}

function Strike(props: Loose): React.ReactElement {
  return <InkText strikethrough>{props.children}</InkText>;
}

function Break(): React.ReactElement {
  return <InkText>{"\n"}</InkText>;
}

function Image(props: Loose): React.ReactElement {
  const alt = typeof props["alt"] === "string" && props["alt"] ? `: ${props["alt"]}` : "";
  return <Unavailable what={`Image${alt}`} />;
}

function Input(props: Loose): React.ReactElement {
  if (props["type"] === "checkbox") return <InkText>{props["checked"] ? "☑ " : "☐ "}</InkText>;
  return <InkText dimColor>[input]</InkText>;
}

function Div(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Blocks>{props.children}</Blocks>
    </Box>
  );
}

function Span(props: Loose): React.ReactElement {
  return <InkText>{props.children}</InkText>;
}

const CellContext = createContext(false);

function MarkdownTable(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {props.children}
    </Box>
  );
}

function TableHead(props: Loose): React.ReactElement {
  return (
    <CellContext.Provider value>
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
    </CellContext.Provider>
  );
}

function TableSection(props: Loose): React.ReactElement {
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
  const header = useContext(CellContext);
  return (
    <Box flexGrow={1} flexBasis={0} flexDirection="column">
      <InkText bold={header}>{props.children}</InkText>
    </Box>
  );
}

function Quote(props: Loose): React.ReactElement {
  return (
    <Blockquote>
      <Blocks>{props.children}</Blocks>
    </Blockquote>
  );
}

function Details(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Blocks>{props.children}</Blocks>
    </Box>
  );
}

markInline(Strong, Em, Code, Link, InlineCode, Strike, Break, Span, Input, Image);

export const markdownElements: Record<string, unknown> = {
  p: Paragraph,
  h1: headingAt(1),
  h2: headingAt(2),
  h3: headingAt(3),
  h4: headingAt(4),
  h5: headingAt(5),
  h6: headingAt(6),
  a: Link,
  strong: Strong,
  b: Strong,
  em: Em,
  i: Em,
  del: Strike,
  s: Strike,
  code: InlineCode,
  pre: Pre,
  ul: List(false),
  ol: List(true),
  li: ListItem,
  blockquote: Quote,
  hr: Separator,
  br: Break,
  img: Image,
  input: Input,
  span: Span,
  sup: Span,
  sub: Span,
  small: Span,
  mark: Span,
  div: Div,
  section: Div,
  article: Div,
  header: Div,
  footer: Div,
  main: Div,
  nav: Div,
  aside: Div,
  figure: Div,
  figcaption: Div,
  details: Details,
  summary: Div,
  table: MarkdownTable,
  thead: TableHead,
  tbody: TableSection,
  tfoot: TableSection,
  tr: TableRow,
  th: TableCell,
  td: TableCell,
};
