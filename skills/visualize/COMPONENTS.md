# Response components

Each component works as an MDX tag in a chat message and as an import from
`@workspace/react` in `inline_ui` TSX:

```tsx
import { Chart, Choices, PlaceMap } from "@workspace/react";
```

In MDX, quote string props and put everything else in braces:
`<Chart type="line" data={[...]} x="year" y="rate" />`. Data props also accept
JSON text, and numeric strings are coerced. Invalid input renders an inline
notice instead of breaking the message, so check the rendered result when a
ui-feedback note or notice appears.

## Chart

Bar, line, area, pie, or donut chart with axes, legend, and an accessible data
table.

| Prop | Type | Notes |
| --- | --- | --- |
| `type` | `"bar" \| "line" \| "area" \| "pie" \| "donut"` | Default `"bar"`. |
| `data` | `object[]` | One object per x value (or slice). |
| `x` | `string` | Category key. Default: first non-numeric key. |
| `y` | `string \| string[]` | Series key(s). Default: every numeric key. Pie and donut plot the first. |
| `title` | `string` | |
| `valueFormat` | `"number" \| "percent" \| "currency"` | `percent` values are already percentages: `25` shows as 25%. |
| `currency` | `string` | ISO code, default `"USD"`. |
| `unit` | `string` | Suffix such as `"kWh"`. |
| `stacked` | `boolean` | Bar and area. |
| `height` | `number` | Default 220, clamped 120–600. |

```mdx
<Chart
  type="line"
  title="US CPI inflation"
  valueFormat="percent"
  data={[
    { year: "2019", rate: 1.8 }, { year: "2020", rate: 1.2 }, { year: "2021", rate: 4.7 },
    { year: "2022", rate: 8.0 }, { year: "2023", rate: 4.1 }, { year: "2024", rate: 2.9 },
  ]}
  x="year"
  y="rate"
/>
```

## Stats

A row of headline figures.

| Prop | Type | Notes |
| --- | --- | --- |
| `items` | `{ label, value, detail?, delta?, tone? }[]` | `value` and `delta` are strings or numbers; `tone` is `"positive" \| "negative" \| "neutral"` and is inferred from the sign of `delta` when omitted. |
| `title` | `string` | |

```mdx
<Stats items={[
  { label: "Monthly payment", value: "$3,398", detail: "15-year" },
  { label: "Total interest", value: "$211,700", delta: "-$307,000", tone: "positive" },
]} />
```

## Compare

Side-by-side option cards with aligned attribute rows.

| Prop | Type | Notes |
| --- | --- | --- |
| `options` | `{ name, subtitle?, badge?, highlight?, price?, attributes?, pros?, cons? }[]` | `attributes` is a record of string, number, or boolean values; shared keys align across cards. `highlight: true` marks the recommendation. |
| `title` | `string` | |

```mdx
<Compare options={[
  { name: "Northwind", price: "$25/mo", attributes: { Data: "5 GB", Streaming: false }, cons: ["Tight data cap"] },
  { name: "Skyline", price: "$40/mo", badge: "Best value", highlight: true, attributes: { Data: "20 GB", Streaming: false } },
  { name: "Orbit", price: "$55/mo", attributes: { Data: "Unlimited", Streaming: true }, pros: ["Includes streaming"] },
]} />
```

## Timeline

Itineraries, schedules, histories, and phases.

| Prop | Type | Notes |
| --- | --- | --- |
| `items` | `{ time?, title, detail?, icon?, status?, href? }[]` | `icon` is an emoji; `status` is `"done" \| "current" \| "upcoming"`. |
| `title` | `string` | |

## Checklist

Interactive checklist with a progress count. Checked state is local to the
rendered card.

| Prop | Type | Notes |
| --- | --- | --- |
| `items` | `({ id?, label, detail?, href?, checked? } \| string)[]` | |
| `title` | `string` | |

```mdx
<Checklist title="3-day hike" items={["Tent and footprint", "Sleeping bag (rated to 0 °C)", { label: "Water filter", detail: "Test it at home first" }]} />
```

## PlaceMap

Street map with pins, an optional ordered route, and a place list with
open-in-maps links. Tiles come from OpenStreetMap; pins and the list remain
usable if tiles fail to load.

| Prop | Type | Notes |
| --- | --- | --- |
| `places` | `{ name, lat, lng, emoji?, detail? }[]` | `latitude`, `longitude`, `lon`, and `long` are accepted too. Use plausible real coordinates. |
| `route` | `boolean` | Draws the route in order and numbers the pins. |
| `title` | `string` | |
| `height` | `number` | Default 260, clamped 160–480. |

## Choices

Non-blocking multiple-choice follow-up. Submitting sends a user message
(`"question → value"`) carrying
`interaction: { source: "choices", kind: "choice", action: "submit", targetId: id, values }`.
The answer is read back from the transcript, so the control stays locked with
the chosen options marked after reloads and on other devices.

| Prop | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Required, stable, and descriptive, such as `"lisbon-day-refine"`. |
| `question` | `string` | |
| `options` | `({ label, value?, description? } \| string)[]` | `value` defaults to `label`. |
| `multiple` | `boolean` | Allow several selections. |
| `allowOther` | `boolean` | Add a free-text option. |
| `submitLabel` | `string` | Default `"Send"`. |

## Calculator

Live what-if tool. `compute` receives the current field values and returns the
results; errors and empty results show inline.

| Prop | Type | Notes |
| --- | --- | --- |
| `fields` | `{ name, label?, type?, default?, min?, max?, step?, options?, unit? }[]` | `type` is `"number" \| "slider" \| "select" \| "toggle"`; `options` are strings, numbers, or `{ label, value }`. An empty number field passes `null`. |
| `compute` | `(values) => { label, value, format?, unit? }[] \| Record<string, number \| string>` | Synchronous. `format` is `"number" \| "percent" \| "currency"`. |
| `title` | `string` | |
| `currency` | `string` | ISO code for currency results. |

```mdx
<Calculator
  title="Split the bill"
  currency="USD"
  fields={[
    { name: "bill", label: "Bill ($)", type: "number", default: 180 },
    { name: "tip", label: "Tip", type: "slider", default: 18, min: 0, max: 30, step: 1, unit: "%" },
    { name: "people", label: "People", type: "number", default: 4, min: 1 },
  ]}
  compute={({ bill, tip, people }) => {
    const total = (bill ?? 0) * (1 + (tip ?? 0) / 100);
    return [
      { label: "Total with tip", value: total, format: "currency" },
      { label: "Each person pays", value: total / Math.max(1, people ?? 1), format: "currency" },
    ];
  }}
/>
```

## ActionButton

A button that sends a follow-up user message. With `id`, the message carries
`interaction: { source: "action-button", kind: "action", action, targetId: id }`
and the button shows as pressed (disabled) once that message is in the
transcript. Give an `id` to one-time choices; omit it for buttons the user may
press repeatedly.

| Prop | Type | Notes |
| --- | --- | --- |
| `message` | `string` | The message to send. |
| `children` | label | Defaults to `message`. |
| `id` | `string` | Stable target id for the structured interaction. |
| `action` | `string` | Default `"press"`. |
| `variant` | Radix button variant | Default `"soft"`. |
| `size` | `"1" \| "2" \| "3" \| "4"` | Default `"1"`. |

```mdx
<Flex gap="2" wrap="wrap">
  <ActionButton message="Make it a two-day plan">Two days instead</ActionButton>
  <ActionButton message="Swap the museum for a food tour">More food</ActionButton>
</Flex>
```

## Image and Video

See [MDX.md](../sandbox/MDX.md#images-and-videos).

## Layout

Compose with Radix Themes: `Flex`, `Grid`, `Box`, `Card`, `Inset`, `Tabs`
(`Tabs.Root`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Content`), `Table`, `DataList`,
`Callout`, `Badge`, `Progress`, `Separator`, `Avatar`, `Tooltip`, `Heading`,
`Text`, `Link`, and `Icons`. Layouts must stay usable at a 320px width; prefer
`Flex wrap="wrap"` and intrinsic grids over viewport breakpoints.
