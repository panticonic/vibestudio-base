/**
 * The vocabulary as one module: what `@workspace/terminal-ui`,
 * `@radix-ui/themes` and `@workspace/react` resolve to in the terminal, and
 * the tags an MDX message may use without importing them.
 */
import * as layout from "./layout.js";
import * as textual from "./text.js";
import * as data from "./data.js";
import * as controls from "./controls.js";
import * as response from "./response.js";
import { Pressable, Clickable, ButtonFace } from "./interaction.js";
import * as media from "./media.js";
import * as actions from "./actions.js";
import { Chart } from "./chart.js";
import { Calculator } from "./calculator.js";
import { markdownElements, markInline } from "./markdown.js";
import { iconFor } from "./icons.js";

const Tooltip = layout.Passthrough;

export const kit: Record<string, unknown> = {
  ...layout,
  ...textual,
  ...data,
  ...controls,
  ...response,
  ...actions,
  Image: media.Image,
  Video: media.Video,
  GeneratedImage: media.GeneratedImage,
  PlaceMap: media.PlaceMap,
  Diagram: media.Diagram,
  Mermaid: media.Diagram,
  Chart,
  Calculator,
  Pressable,
  Clickable,
  ButtonFace,
  Tooltip,
  HoverCard: { Root: layout.Passthrough, Trigger: layout.Passthrough, Content: () => null },
  Popover: {
    Root: layout.Passthrough,
    Trigger: layout.Passthrough,
    Content: layout.Passthrough,
    Close: layout.Passthrough,
  },
  Dialog: {
    Root: layout.Passthrough,
    Trigger: layout.Passthrough,
    Content: layout.Passthrough,
    Title: textual.Heading,
    Description: textual.Text,
    Close: layout.Passthrough,
  },
  Theme: layout.Passthrough,
  ScrollArea: layout.Box,
  AspectRatio: layout.Box,
};

markInline(
  textual.Text,
  textual.Strong,
  textual.Em,
  textual.Code,
  textual.Kbd,
  textual.Quote,
  textual.Link,
  textual.Badge,
  data.Progress,
  data.Spinner,
  data.Avatar,
  data.Unavailable,
  media.Image,
  media.Video,
  media.GeneratedImage
);

/** What an MDX message's tags draw with: Markdown elements plus the vocabulary. */
export const mdxComponents: Record<string, unknown> = {
  ...markdownElements,
  ...kit,
  Icons: new Proxy(
    {},
    { get: (_target, name) => (typeof name === "string" ? iconFor(name) : undefined) }
  ),
};
