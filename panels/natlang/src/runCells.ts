/**
 * The eval cells the panel's runs execute. A run is ordinary natlang use in this panel's own eval session: the same
 * `@workspace/natlang` provider (gateway executor, records, services slice) that serves agents' evals runs it, so there is
 * one execution path and the calls land in the records service like any other.
 */

const literal = (value: unknown) => JSON.stringify(value ?? null);

/** `text` as the body of a template literal: nothing in it can end the literal or start an interpolation. */
export function templateText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** A saved natlang function called with named inputs, in the order its signature declares them. */
export function callCell(spec: { function: string; inputs?: Record<string, unknown> }): string {
  return `const path = ${literal(spec.function)};
const inputs = ${literal(spec.inputs ?? {})};
const name = path.slice(path.lastIndexOf("/") + 1).replace(/\\.nl$/, "");
const described = await natlang.describe(path);
const fn = described.functions.find((candidate) => candidate.name === name);
if (!fn) throw new Error("No natlang function " + name + " in " + path);
const missing = fn.fields.filter((field) => field.required && !(field.name in inputs)).map((field) => field.name);
if (missing.length) throw new Error("Missing input: " + missing.join(", "));
const callable = await natlang.load(path);
return await callable(...fn.fields.map((field) => inputs[field.name]));`;
}

/** An instruction tried on an input: an inline `nl` call with the result type the caller gives. */
export function askCell(spec: { instruction: string; input?: string; returns?: string }): string {
  return `const input = ${literal(spec.input ?? "")};
return await nl<${spec.returns?.trim() || "string"}>\`${templateText(spec.instruction)}\`(input);`;
}
