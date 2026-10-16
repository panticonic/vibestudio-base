/**
 * Terminal-friendly UI for agent-authored cards: MDX messages and inline UI
 * in the terminal chat. Names follow the browser vocabulary, so the same tags
 * work in both; what a terminal cannot draw names itself instead.
 */
export {
  Box,
  Flex,
  Grid,
  Card,
  Section,
  Container,
  Inset,
  Separator,
  Passthrough,
} from "./layout.js";
export {
  Text,
  Heading,
  Strong,
  Em,
  Code,
  Kbd,
  Quote,
  Link,
  Badge,
  Blockquote,
  Callout,
} from "./text.js";
export { Table, DataList, Progress, Spinner, Avatar, Unavailable } from "./data.js";
export {
  Button,
  IconButton,
  Checkbox,
  Switch,
  RadioGroup,
  RadioCards,
  CheckboxGroup,
  CheckboxCards,
  SegmentedControl,
  Select,
  TextField,
  TextArea,
  Slider,
  Tabs,
  TabNav,
} from "./controls.js";
export {
  ActionButton,
  Choices,
  Checklist,
  Stats,
  Compare,
  Timeline,
  ResponseActionsProvider,
  useResponseActions,
  type ResponseActions,
  type ResponseAnswer,
  type ResponseInteraction,
} from "./response.js";
export {
  ClickTargets,
  ClickTargetsContext,
  InlineContext,
  Pressable,
  Clickable,
  ButtonFace,
  useClickTarget,
  type Tone,
} from "./interaction.js";
export { Blocks, markdownElements, markInline } from "./markdown.js";
export { iconFor, iconsModule } from "./icons.js";
export { kit, mdxComponents } from "./kit.js";
