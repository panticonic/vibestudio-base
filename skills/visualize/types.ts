/** The response components that can be built from data alone, and the other things a visual answer can be. */
export type ComponentChoice =
  | "Chart"
  | "Stats"
  | "Compare"
  | "Timeline"
  | "Checklist"
  | "PlaceMap"
  | "Choices"
  | "Calculator"
  | "Diagram"
  | "OneOff"
  | "Prose";

/** The components whose props are read from data. */
export type DataComponent = "Chart" | "Stats" | "Compare" | "Timeline" | "Checklist" | "PlaceMap" | "Choices";

/** One object per x value (or pie slice); every row has the same keys. */
export type ChartRow = Record<string, string | number>;

export type ChartProps = {
  /** Default "bar". Use "line" or "area" for change over time, "pie" or "donut" for shares of a whole. */
  type?: "bar" | "line" | "area" | "pie" | "donut";
  data: ChartRow[];
  /** The key of each row that names its category or time. */
  x?: string;
  /** The key (or keys) holding the numbers to plot. */
  y?: string | string[];
  title?: string;
  /** "percent" values are already percentages: 25 shows as 25%. */
  valueFormat?: "number" | "percent" | "currency";
  /** ISO currency code, default "USD". */
  currency?: string;
  /** A suffix such as "kWh". */
  unit?: string;
  stacked?: boolean;
  height?: number;
};

export type StatItem = {
  label: string;
  value: string | number;
  detail?: string;
  delta?: string | number;
  tone?: "positive" | "negative" | "neutral";
};
export type StatsProps = { items: StatItem[]; title?: string };

export type CompareOption = {
  name: string;
  subtitle?: string;
  badge?: string;
  /** True on the one option that is recommended. */
  highlight?: boolean;
  price?: string;
  /** Attributes shared across options align across cards. */
  attributes?: Record<string, string | number | boolean>;
  pros?: string[];
  cons?: string[];
};
export type CompareProps = { options: CompareOption[]; title?: string };

export type TimelineItem = {
  time?: string;
  title: string;
  detail?: string;
  /** A single emoji. */
  icon?: string;
  status?: "done" | "current" | "upcoming";
  href?: string;
};
export type TimelineProps = { items: TimelineItem[]; title?: string };

export type ChecklistItem = string | { id?: string; label: string; detail?: string; href?: string; checked?: boolean };
export type ChecklistProps = { items: ChecklistItem[]; title?: string };

export type Place = { name: string; lat: number; lng: number; emoji?: string; detail?: string };
export type PlaceMapProps = {
  places: Place[];
  /** Draws the route in order and numbers the pins. */
  route?: boolean;
  title?: string;
  height?: number;
};

export type ChoiceOption = string | { label: string; value?: string; description?: string };
export type ChoicesProps = {
  /** Stable and descriptive, lowercase words joined by hyphens, such as "lisbon-day-refine". */
  id: string;
  question?: string;
  options: ChoiceOption[];
  multiple?: boolean;
  allowOther?: boolean;
  submitLabel?: string;
};

/** A component and its props; `mdx` is produced by `renderComponent`, never written by hand. */
export type ComponentSpec =
  | { component: "Chart"; props: ChartProps }
  | { component: "Stats"; props: StatsProps }
  | { component: "Compare"; props: CompareProps }
  | { component: "Timeline"; props: TimelineProps }
  | { component: "Checklist"; props: ChecklistProps }
  | { component: "PlaceMap"; props: PlaceMapProps }
  | { component: "Choices"; props: ChoicesProps };

export type RenderedComponent = ComponentSpec & { mdx: string };
