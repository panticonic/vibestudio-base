import type {
  ComponentSpec,
  PresentationRequest,
  PresentationSection,
} from "../visualize/types.js";

type SectionOutcome =
  | { status: "ready"; spec: ComponentSpec }
  | { status: "plain" }
  | { status: "deferred"; component: "Calculator" | "Diagram" | "OneOff" }
  | {
      status: "needs-review";
      component: ComponentSpec["component"];
      reason: string;
    };

type CaseSection = {
  section: PresentationSection;
  outcome: SectionOutcome | null;
};

type PresentationWorld = {
  id: string;
  sourceGroup: string;
  request: PresentationRequest;
  expected: { id: string; outcome: SectionOutcome }[];
  omitted: string[];
};

function ready(
  id: string,
  ask: string,
  data: string,
  spec: ComponentSpec,
): CaseSection {
  return {
    section: { id, ask, data, required: true },
    outcome: { status: "ready", spec },
  };
}

function world(
  id: string,
  goal: string,
  sections: CaseSection[],
  order: string[],
): PresentationWorld {
  const byId = new Map(
    sections.map(({ section, outcome }) => [section.id, outcome]),
  );
  const expected = order.map((sectionId) => {
    const outcome = byId.get(sectionId);
    if (!outcome)
      throw new Error(`Missing expected presentation section ${sectionId}`);
    return { id: sectionId, outcome };
  });
  return {
    id: `visualize-${id}`,
    sourceGroup: "vibestudio:visualize:component-selection-and-grounding",
    request: { goal, sections: sections.map(({ section }) => section) },
    expected,
    omitted: sections
      .filter(({ outcome }) => outcome === null)
      .map(({ section }) => section.id),
  };
}

export const presentationWorlds = [
  world(
    "library-capacity",
    "Lead with the room comparison, then show how visits changed.",
    [
      ready(
        "visits",
        "Plot visits as a line by month using month and visits keys.",
        "Feb: 62 visits, Mar: 74, Apr: 69.",
        {
          component: "Chart",
          props: {
            type: "line",
            x: "month",
            y: "visits",
            data: [
              { month: "Feb", visits: 62 },
              { month: "Mar", visits: 74 },
              { month: "Apr", visits: 69 },
            ],
          },
        },
      ),
      ready(
        "rooms",
        "Compare rooms by seats.",
        "Cedar seats 28. Alder seats 16.",
        {
          component: "Compare",
          props: {
            options: [
              { name: "Cedar", attributes: { seats: 28 } },
              { name: "Alder", attributes: { seats: 16 } },
            ],
          },
        },
      ),
      {
        section: {
          id: "logo",
          ask: "Which typeface was used?",
          data: "The survey does not include a typeface.",
          required: false,
        },
        outcome: null,
      },
    ],
    ["rooms", "visits"],
  ),
  world(
    "museum-opening",
    "Show the opening schedule, followed by the setup checklist.",
    [
      ready(
        "setup",
        "Give staff a checklist using these exact labels.",
        "Unlock side door; Test headset; Set donation box.",
        {
          component: "Checklist",
          props: {
            items: ["Unlock side door", "Test headset", "Set donation box"],
          },
        },
      ),
      ready(
        "opening",
        "Show the timed opening sequence.",
        "09:10 Staff briefing; 09:40 Doors open; 10:00 First tour.",
        {
          component: "Timeline",
          props: {
            items: [
              { time: "09:10", title: "Staff briefing" },
              { time: "09:40", title: "Doors open" },
              { time: "10:00", title: "First tour" },
            ],
          },
        },
      ),
    ],
    ["opening", "setup"],
  ),
  world(
    "bike-repair-route",
    "Show the repair route first and ask where to stop after the route.",
    [
      ready(
        "decision",
        "Let me pick a stop with id route-followup and two choices.",
        "Choices: Cafe, Station.",
        {
          component: "Choices",
          props: { id: "route-followup", options: ["Cafe", "Station"] },
        },
      ),
      ready(
        "route",
        "Map these locations as an ordered route.",
        "Start at Co-op (52.49, 13.42), then go to Depot (52.51, 13.39).",
        {
          component: "PlaceMap",
          props: {
            route: true,
            places: [
              { name: "Co-op", lat: 52.49, lng: 13.42 },
              { name: "Depot", lat: 52.51, lng: 13.39 },
            ],
          },
        },
      ),
    ],
    ["route", "decision"],
  ),
  world(
    "garden-water",
    "Lead with the water-use headline figures and prepare an interactive variable-cost follow-up.",
    [
      {
        section: {
          id: "cost",
          ask: "Let me adjust price per cubic metre and see the bill change.",
          data: "Total bill equals water volume times unit price.",
          required: true,
        },
        outcome: { status: "deferred", component: "Calculator" },
      },
      ready(
        "headlines",
        "Show these headline counts at a glance.",
        "Rain barrels: 6; Planted beds: 14.",
        {
          component: "Stats",
          props: {
            items: [
              { label: "Rain barrels", value: 6 },
              { label: "Planted beds", value: 14 },
            ],
          },
        },
      ),
    ],
    ["headlines", "cost"],
  ),
  world(
    "book-return",
    "Answer when returns close, then offer the three available follow-up actions.",
    [
      {
        section: {
          id: "time",
          ask: "When do returns close?",
          data: "Returns close at 18:00.",
          required: true,
        },
        outcome: { status: "plain" },
      },
      ready(
        "next",
        "Let me choose a follow-up with id book-return-followup.",
        "Renew online; Drop off tomorrow; Contact the desk.",
        {
          component: "Choices",
          props: {
            id: "book-return-followup",
            options: ["Renew online", "Drop off tomorrow", "Contact the desk"],
          },
        },
      ),
    ],
    ["time", "next"],
  ),
  world(
    "clinic-load",
    "Show the daily load, and hold the staffing view when its capacity numbers are unconfirmed.",
    [
      ready(
        "load",
        "Chart completed checks by day as bars with day and checks keys.",
        "Mon: 41, Tue: 38, Wed: 44 completed checks.",
        {
          component: "Chart",
          props: {
            type: "bar",
            x: "day",
            y: "checks",
            data: [
              { day: "Mon", checks: 41 },
              { day: "Tue", checks: 38 },
              { day: "Wed", checks: 44 },
            ],
          },
        },
      ),
      {
        section: {
          id: "staffing",
          ask: "Compare verified staffing capacity by shift and hold it if the numbers are missing.",
          data: "Day and night staffing levels are both unconfirmed.",
          required: true,
        },
        outcome: {
          status: "needs-review",
          component: "Compare",
          reason: "No staffing capacity was confirmed.",
        },
      },
    ],
    ["load", "staffing"],
  ),
  world(
    "studio-acoustics",
    "Compare the rooms, then hand off a mechanism diagram for the signal flow.",
    [
      ready(
        "rooms",
        "Compare the studios by reverberation using the RT60 label and seconds as supplied.",
        "Studio A RT60 is 0.4 s. Studio B RT60 is 0.6 s.",
        {
          component: "Compare",
          props: {
            options: [
              { name: "Studio A", attributes: { RT60: "0.4 s" } },
              { name: "Studio B", attributes: { RT60: "0.6 s" } },
            ],
          },
        },
      ),
      {
        section: {
          id: "signal",
          ask: "Diagram how the recording mechanism works.",
          data: "Microphone to preamp to converter to recorder.",
          required: true,
        },
        outcome: { status: "deferred", component: "Diagram" },
      },
    ],
    ["rooms", "signal"],
  ),
  world(
    "meal-service",
    "Start with the timed service; add the packing checklist only if it helps prepare for service.",
    [
      ready(
        "service",
        "Show the sequence with the supplied times.",
        "11:00 Delivery arrives; 11:20 Packing begins; 12:00 Serving begins.",
        {
          component: "Timeline",
          props: {
            items: [
              { time: "11:00", title: "Delivery arrives" },
              { time: "11:20", title: "Packing begins" },
              { time: "12:00", title: "Serving begins" },
            ],
          },
        },
      ),
      {
        section: {
          id: "history",
          ask: "Show the original lease date.",
          data: "The lease was signed in 1979.",
          required: false,
        },
        outcome: null,
      },
      {
        section: {
          id: "pack",
          ask: "Provide a packing checklist.",
          data: "Label boxes; Count spoons; Fill water jugs.",
          required: false,
        },
        outcome: {
          status: "ready",
          spec: {
            component: "Checklist",
            props: {
              items: ["Label boxes", "Count spoons", "Fill water jugs"],
            },
          },
        },
      },
    ],
    ["service", "pack"],
  ),
  world(
    "aquarium-entrances",
    "Map the two entrances without plotting a route, then give the headline waiting figures.",
    [
      ready(
        "entrances",
        "Mark the two entrances on a map with no route.",
        "North Gate (38.72, -9.14); Ramp (38.71, -9.13).",
        {
          component: "PlaceMap",
          props: {
            places: [
              { name: "North Gate", lat: 38.72, lng: -9.14 },
              { name: "Ramp", lat: 38.71, lng: -9.13 },
            ],
          },
        },
      ),
      ready(
        "wait",
        "Show the current waiting figures with the original units.",
        "North Gate: 13 min. Ramp: 4 min.",
        {
          component: "Stats",
          props: {
            items: [
              { label: "North Gate", value: "13 min" },
              { label: "Ramp", value: "4 min" },
            ],
          },
        },
      ),
    ],
    ["entrances", "wait"],
  ),
];
