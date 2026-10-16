/**
 * HTML elements for code written for the browser. Ink rejects element types
 * it does not know, so inline code is compiled against `hostJsxRuntime`
 * (and calls `hostReact.createElement`), which swaps each HTML tag for the
 * kit component that draws it. Ink's own `ink-*` types pass through, and
 * styling the terminal has no use for (`className`, `id`, `aria-*`, most of
 * `style`) is simply never read.
 */
import * as ReactNs from "react";
import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from "react/jsx-runtime";
import { jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import { Box, Text as InkText } from "ink";
import {
  Button,
  Checkbox,
  Select,
  Slider,
  TextArea,
  TextField,
  call,
  changeEvent,
} from "./controls.js";
import { Unavailable } from "./data.js";
import { Blocks, markdownElements } from "./markdown.js";
import { Video } from "./media.js";
import { Kbd } from "./text.js";
import { record } from "./theme.js";

type Loose = Record<string, unknown> & { children?: ReactNs.ReactNode };

const ALIGN = ["flex-start", "center", "flex-end", "stretch"] as const;
const JUSTIFY = ["flex-start", "center", "flex-end", "space-between", "space-around"] as const;
const DIRECTIONS = ["row", "column", "row-reverse", "column-reverse"] as const;

/** A CSS length as pixels (`8`, "8px", "0.5rem"), or 0. */
function pixels(value: unknown): number {
  if (typeof value === "number") return value;
  const match = typeof value === "string" ? /^(-?[\d.]+)(px|rem|em)?$/.exec(value.trim()) : null;
  return match ? Number(match[1]) * (match[2] === "px" || !match[2] ? 1 : 16) : 0;
}

function pick<T extends string>(options: readonly T[], value: unknown): T | undefined {
  const named = typeof value === "string" ? value.replace(/^(start|end)$/, "flex-$1") : value;
  return options.find((option) => option === named);
}

/** A block: a column of its contents, or the row/column a `display: flex` style asks for. */
function HostBlock(props: Loose): ReactNs.ReactElement {
  const style = record(props["style"]) ?? {};
  const flex = String(style["display"] ?? "").endsWith("flex");
  const direction = (flex && pick(DIRECTIONS, style["flexDirection"])) || (flex ? "row" : "column");
  const gap = pixels(style["gap"]);
  const cells = direction.startsWith("column") ? Math.round(gap / 20) : Math.round(gap / 8);
  const align = flex ? pick(ALIGN, style["alignItems"]) : undefined;
  const justify = flex ? pick(JUSTIFY, style["justifyContent"]) : undefined;
  return (
    <Box
      flexDirection={direction}
      {...(direction.startsWith("column") ? { rowGap: cells } : { columnGap: cells })}
      {...(align ? { alignItems: align } : {})}
      {...(justify ? { justifyContent: justify } : {})}
      {...(flex && style["flexWrap"] === "wrap" ? { flexWrap: "wrap" as const } : {})}
    >
      <Blocks>{props.children}</Blocks>
    </Box>
  );
}

/** A label and the control it names, side by side. */
function HostLabel(props: Loose): ReactNs.ReactElement {
  return (
    <Box flexDirection="row" columnGap={1}>
      <Blocks>{props.children}</Blocks>
    </Box>
  );
}

function HostInput(props: Loose): ReactNs.ReactElement | null {
  const type = String(props["type"] ?? "text");
  const event = (extra: Record<string, unknown>, value: string) => {
    const base = changeEvent(value);
    return {
      ...base,
      target: { ...base.target, ...extra },
      currentTarget: { ...base.target, ...extra },
    };
  };
  if (type === "hidden") return null;
  if (type === "checkbox" || type === "radio")
    return (
      <Checkbox
        checked={props["checked"]}
        defaultChecked={props["defaultChecked"]}
        disabled={props["disabled"]}
        onCheckedChange={(checked: boolean) =>
          call(props["onChange"], event({ checked }, String(props["value"] ?? "on")))
        }
      />
    );
  if (type === "range") {
    const min = Number(props["min"] ?? 0);
    return (
      <Slider
        min={min}
        max={props["max"]}
        step={props["step"]}
        {...(props["value"] !== undefined ? { value: [Number(props["value"])] } : {})}
        defaultValue={[Number(props["defaultValue"] ?? min)]}
        onValueChange={(next: number[]) => call(props["onChange"], changeEvent(String(next[0])))}
      />
    );
  }
  if (type === "button" || type === "submit" || type === "reset")
    return (
      <Button disabled={props["disabled"]} onClick={props["onClick"]}>
        {String(props["value"] ?? (type === "submit" ? "Submit" : "Button"))}
      </Button>
    );
  return <TextField.Root {...props} />;
}

function HostOption(_props: Loose): null {
  return null;
}

function textOf(children: ReactNs.ReactNode): string {
  return ReactNs.Children.toArray(children)
    .filter((child) => typeof child === "string" || typeof child === "number")
    .join("");
}

/** `<option>` elements (at any depth, for `<optgroup>`) as the kit's select items. */
function items(children: ReactNs.ReactNode): ReactNs.ReactNode[] {
  return ReactNs.Children.toArray(children).flatMap<ReactNs.ReactNode>((child) => {
    if (!ReactNs.isValidElement(child)) return [];
    const props = child.props as Loose;
    if (child.type !== HostOption) return items(props.children);
    const label = textOf(props.children);
    return [
      <Select.Item key={child.key} value={String(props["value"] ?? label)}>
        {label}
      </Select.Item>,
    ];
  });
}

function HostSelect(props: Loose): ReactNs.ReactElement {
  return (
    <Select.Root
      {...(props["value"] !== undefined ? { value: props["value"] } : {})}
      {...(props["defaultValue"] !== undefined ? { defaultValue: props["defaultValue"] } : {})}
      onValueChange={(value: string) => call(props["onChange"], changeEvent(value))}
    >
      <Select.Trigger />
      <Select.Content>{items(props.children)}</Select.Content>
    </Select.Root>
  );
}

function HostVideo(props: Loose): ReactNs.ReactElement {
  return <Video url={props["src"]} title={props["title"]} />;
}

/** What only a graphical client draws, named by its tag. */
function placeholder(what: string) {
  return function Placeholder(): ReactNs.ReactElement {
    return <Unavailable what={what} />;
  };
}

function Plain(props: Loose): ReactNs.ReactElement {
  return <InkText>{props.children}</InkText>;
}

const HOST: Record<string, unknown> = {
  ...markdownElements,
  div: HostBlock,
  section: HostBlock,
  article: HostBlock,
  header: HostBlock,
  footer: HostBlock,
  main: HostBlock,
  nav: HostBlock,
  aside: HostBlock,
  figure: HostBlock,
  form: HostBlock,
  fieldset: HostBlock,
  label: HostLabel,
  button: Button,
  input: HostInput,
  textarea: TextArea,
  select: HostSelect,
  option: HostOption,
  optgroup: HostOption,
  kbd: Kbd,
  u: Plain,
  time: Plain,
  abbr: Plain,
  cite: Plain,
  q: Plain,
  var: Plain,
  samp: Plain,
  svg: placeholder("Graphic"),
  canvas: placeholder("Canvas"),
  iframe: placeholder("Embedded page"),
  audio: placeholder("Audio"),
  video: HostVideo,
};

/** The component to draw `type` with: HTML tags become kit components, everything else is as given. */
export function hostType(type: unknown): unknown {
  if (typeof type !== "string" || type.startsWith("ink-")) return type;
  return HOST[type] ?? HostBlock;
}

type Create = (
  type: unknown,
  props: unknown,
  key?: unknown,
  ...rest: unknown[]
) => ReactNs.ReactElement;

/** `react/jsx-runtime` that draws HTML tags; point a compiler's `jsxImportSource` at it. */
export const hostJsxRuntime = {
  Fragment,
  jsx: ((type, props, key) =>
    reactJsx(hostType(type) as never, props as never, key as never)) as Create,
  jsxs: ((type, props, key) =>
    reactJsxs(hostType(type) as never, props as never, key as never)) as Create,
  jsxDEV: ((type, props, key, ...rest) =>
    (reactJsxDEV ?? reactJsx)(
      hostType(type) as never,
      props as never,
      key as never,
      ...(rest as [never, never, never])
    )) as Create,
};

/** `react` whose `createElement` draws HTML tags, for classic `React.createElement("div")`. */
export const hostReact = {
  ...ReactNs,
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) =>
    (ReactNs.createElement as (...args: unknown[]) => ReactNs.ReactElement)(
      hostType(type),
      props,
      ...children
    ),
};
