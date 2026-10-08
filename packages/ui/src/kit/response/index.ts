/**
 * Response catalog: high-level, prop-driven components that models fill with
 * data. The same vocabulary renders as MDX tags in assistant messages and as
 * imports (`@workspace/react`) in inline UI.
 *
 * Interactive controls (ActionButton, Choices) send through the nearest
 * `ResponseActionsProvider`; without one they render disabled.
 */
import { ActionButton } from "./actions";
import { Calculator } from "./Calculator";
import { Chart } from "./Chart";
import { Checklist } from "./Checklist";
import { Choices } from "./Choices";
import { Compare } from "./Compare";
import { PlaceMap } from "./PlaceMap";
import { Stats } from "./Stats";
import { Timeline } from "./Timeline";

export {
  ActionButton,
  ResponseActionsProvider,
  useResponseActions,
  type ActionButtonProps,
  type ResponseActions,
  type ResponseAnswer,
  type ResponseActionsProviderProps,
  type ResponseInteraction,
  type ResponseSendOptions,
} from "./actions";
export {
  Calculator,
  type CalculatorField,
  type CalculatorFieldType,
  type CalculatorProps,
  type CalculatorResult,
  type CalculatorValues,
} from "./Calculator";
export { Chart, type ChartProps, type ChartType } from "./Chart";
export { Checklist, type ChecklistItem, type ChecklistProps } from "./Checklist";
export { Choices, type ChoiceOption, type ChoicesProps } from "./Choices";
export { Compare, type CompareOption, type CompareProps } from "./Compare";
export { PlaceMap, type MapPlace, type PlaceMapProps } from "./PlaceMap";
export { Stats, type StatItem, type StatsProps, type StatTone } from "./Stats";
export { Timeline, type TimelineItem, type TimelineProps, type TimelineStatus } from "./Timeline";
export {
  ResponseProblemReporterContext,
  type ResponseProblemReport,
  type ResponseProblemReporter,
  type ValueFormat,
} from "./shared";

/**
 * Every catalog component by its public tag name. Hosts that render model
 * output by name (the MDX registry) spread this, so the catalog and the
 * registry cannot drift apart.
 */
export const responseComponents = {
  ActionButton,
  Calculator,
  Chart,
  Checklist,
  Choices,
  Compare,
  PlaceMap,
  Stats,
  Timeline,
} as const;
