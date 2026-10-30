import type { ComponentSpec, RenderedComponent } from "./types.js";

/** Props the component does not accept, or accepts in another form. The message names the fix. */
export class ComponentPropsError extends Error {
  override readonly name = "ComponentPropsError";
}

type Rule = (value: unknown, path: string) => void;
type Shape = Record<string, { required?: boolean; rule: Rule }>;

const fail = (path: string, expected: string, value: unknown): never => {
  throw new ComponentPropsError(`${path} must be ${expected}, not ${JSON.stringify(value) ?? "undefined"}.`);
};
const str: Rule = (value, path) => {
  if (typeof value !== "string" || value.length === 0) fail(path, "a nonempty string", value);
};
const num: Rule = (value, path) => {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "a number", value);
};
const bool: Rule = (value, path) => {
  if (typeof value !== "boolean") fail(path, "true or false", value);
};
const oneOf =
  (...allowed: string[]): Rule =>
  (value, path) => {
    if (typeof value !== "string" || !allowed.includes(value)) fail(path, `one of ${allowed.map((a) => `"${a}"`).join(", ")}`, value);
  };
const strOrNum: Rule = (value, path) => {
  if (typeof value === "number" ? !Number.isFinite(value) : typeof value !== "string" || value.length === 0) {
    fail(path, "a nonempty string or a number", value);
  }
};
const list =
  (item: Rule, min = 1): Rule =>
  (value, path) => {
    if (!Array.isArray(value) || value.length < min) fail(path, `a list of at least ${min}`, value);
    (value as unknown[]).forEach((entry, index) => item(entry, `${path}[${index}]`));
  };
const record =
  (shape: Shape): Rule =>
  (value, path) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "an object", value);
    checkShape(value as Record<string, unknown>, shape, path);
  };
const either =
  (...rules: Rule[]): Rule =>
  (value, path) => {
    const failures: string[] = [];
    for (const rule of rules) {
      try {
        rule(value, path);
        return;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new ComponentPropsError(failures.join(" Or: "));
  };
const latitude: Rule = (value, path) => {
  num(value, path);
  if ((value as number) < -90 || (value as number) > 90) fail(path, "a latitude from -90 to 90", value);
};
const longitude: Rule = (value, path) => {
  num(value, path);
  if ((value as number) < -180 || (value as number) > 180) fail(path, "a longitude from -180 to 180", value);
};
const scalar: Rule = (value, path) => {
  if (!["string", "number", "boolean"].includes(typeof value)) fail(path, "a string, number or boolean", value);
};
/** An object with any keys whose values are strings, numbers or booleans. */
const freeRecord: Rule = (value, path) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "an object", value);
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => scalar(entry, `${path}.${key}`));
};
const slug: Rule = (value, path) => {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    fail(path, "lowercase words joined by hyphens, such as lisbon-day-refine", value);
  }
};

function checkShape(value: Record<string, unknown>, shape: Shape, path: string): void {
  for (const key of Object.keys(value)) {
    if (!(key in shape)) {
      throw new ComponentPropsError(`${path}.${key} is not a prop here. Use only: ${Object.keys(shape).join(", ")}.`);
    }
  }
  for (const [key, { required, rule }] of Object.entries(shape)) {
    if (value[key] === undefined) {
      if (required) throw new ComponentPropsError(`${path}.${key} is required.`);
    } else rule(value[key], `${path}.${key}`);
  }
}

const SHAPES: Record<ComponentSpec["component"], Shape> = {
  Chart: {
    type: { rule: oneOf("bar", "line", "area", "pie", "donut") },
    data: { required: true, rule: list(freeRecord) },
    x: { rule: str },
    y: { rule: either(str, list(str)) },
    title: { rule: str },
    valueFormat: { rule: oneOf("number", "percent", "currency") },
    currency: { rule: str },
    unit: { rule: str },
    stacked: { rule: bool },
    height: { rule: num },
  },
  Stats: {
    items: {
      required: true,
      rule: list(
        record({
          label: { required: true, rule: str },
          value: { required: true, rule: strOrNum },
          detail: { rule: str },
          delta: { rule: strOrNum },
          tone: { rule: oneOf("positive", "negative", "neutral") },
        })
      ),
    },
    title: { rule: str },
  },
  Compare: {
    options: {
      required: true,
      rule: list(
        record({
          name: { required: true, rule: str },
          subtitle: { rule: str },
          badge: { rule: str },
          highlight: { rule: bool },
          price: { rule: str },
          attributes: { rule: freeRecord },
          pros: { rule: list(str) },
          cons: { rule: list(str) },
        }),
        2
      ),
    },
    title: { rule: str },
  },
  Timeline: {
    items: {
      required: true,
      rule: list(
        record({
          time: { rule: str },
          title: { required: true, rule: str },
          detail: { rule: str },
          icon: { rule: str },
          status: { rule: oneOf("done", "current", "upcoming") },
          href: { rule: str },
        })
      ),
    },
    title: { rule: str },
  },
  Checklist: {
    items: {
      required: true,
      rule: list(
        either(
          str,
          record({
            id: { rule: str },
            label: { required: true, rule: str },
            detail: { rule: str },
            href: { rule: str },
            checked: { rule: bool },
          })
        )
      ),
    },
    title: { rule: str },
  },
  PlaceMap: {
    places: {
      required: true,
      rule: list(
        record({
          name: { required: true, rule: str },
          lat: { required: true, rule: latitude },
          lng: { required: true, rule: longitude },
          emoji: { rule: str },
          detail: { rule: str },
        })
      ),
    },
    route: { rule: bool },
    title: { rule: str },
    height: { rule: num },
  },
  Choices: {
    id: { required: true, rule: slug },
    question: { rule: str },
    options: {
      required: true,
      rule: list(
        either(
          str,
          record({ label: { required: true, rule: str }, value: { rule: str }, description: { rule: str } })
        ),
        2
      ),
    },
    multiple: { rule: bool },
    allowOther: { rule: bool },
    submitLabel: { rule: str },
  },
};

function checkChart(props: Record<string, unknown>): void {
  const rows = props["data"] as Record<string, unknown>[];
  const keys = Object.keys(rows[0] ?? {});
  rows.forEach((row, index) => {
    if (Object.keys(row).sort().join() !== [...keys].sort().join()) {
      throw new ComponentPropsError(`props.data[${index}] must have the same keys as the first row: ${keys.join(", ")}.`);
    }
  });
  const series = props["y"] === undefined ? [] : Array.isArray(props["y"]) ? (props["y"] as string[]) : [props["y"] as string];
  for (const key of [props["x"] as string | undefined, ...series]) {
    if (key !== undefined && !keys.includes(key)) {
      throw new ComponentPropsError(`"${key}" is not a key of the data rows (${keys.join(", ")}).`);
    }
  }
  for (const key of series) {
    rows.forEach((row, index) => {
      if (typeof row[key] !== "number") throw new ComponentPropsError(`props.data[${index}].${key} must be a number to plot it.`);
    });
  }
}

/** One MDX prop: a plain quoted attribute when the string allows it, a JS expression otherwise. */
function attribute(name: string, value: unknown): string {
  if (value === true) return name;
  if (typeof value === "string" && !/["{}<>\n\\]/u.test(value)) return `${name}="${value}"`;
  return `${name}={${JSON.stringify(value)}}`;
}

/**
 * Validate `spec` strictly (no unknown props, exact types, required fields) and
 * return it with the MDX tag that renders it. The model reads the props; this
 * is the only place MDX is written, so a message cannot ship a tag the
 * component would reject.
 */
export function renderComponent(spec: ComponentSpec): RenderedComponent {
  const shape = SHAPES[spec.component];
  if (!shape) {
    throw new ComponentPropsError(
      `${String((spec as { component: unknown }).component)} is not built from data. Use one of: ${Object.keys(SHAPES).join(", ")}.`
    );
  }
  const props = spec.props as unknown as Record<string, unknown>;
  if (typeof props !== "object" || props === null || Array.isArray(props)) fail("props", "an object", props);
  checkShape(props, shape, "props");
  if (spec.component === "Chart") checkChart(props);
  const attributes = Object.entries(props)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => attribute(name, value));
  return { ...spec, mdx: `<${spec.component} ${attributes.join(" ")} />` } as RenderedComponent;
}
