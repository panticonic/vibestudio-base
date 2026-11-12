import { SERVICE_NAMES } from "@workspace/natlang-services";

/**
 * What `help("nl")` and `help("natlang")` tell an agent. Model-facing text: keep
 * it short, concrete, and true to what the provider does.
 */
export function natlangHelp(): string {
  return [
    "nl and natlang: natural-language functions that a small model runs, inside your eval cell.",
    "",
    "Inline nl (ambient, no import):",
    "  const verdict: 'urgent' | 'normal' = await nl`Decide whether ${ticket} is urgent.`(ticket);",
    "  const reply = await nl<string>`Draft a short reply to ${message}.`(message);",
    "  The result type comes from your annotation or the type argument; the call is checked against it.",
    "  An inline call has NO services and no access to your bindings. It sees only what you pass as",
    "  arguments, mention in the instructions (captures), or hand over with nl`...`.with({ name: value }).",
    "  Passing a function or object passes the authority it carries.",
    "",
    "Workspace programs:",
    "  const brief = await natlang.load('skills/server-logs/brief.nl');   // a .nl file",
    "  const tools = await natlang.load('skills/server-logs');            // a folder: a record of callables",
    "  await brief({ since });",
    "  const shape = await natlang.describe('skills/server-logs');        // its functions with typed signatures (data, nothing runs)",
    "  A program is type-checked when loaded (and re-checked only when its files change). It gets exactly the",
    "  services its services.d.ts declares (declare module 'natlang:services' { export const serverLog: ... })",
    "  or its TypeScript modules import from 'natlang:services', each a narrowed view of your own binding: your",
    "  approvals and authority checks apply unchanged. Available services: " + SERVICE_NAMES.join(", ") + ".",
    "  A program returns proposals for consequential effects; you commit them.",
    "",
    "Models: calls run on the executor model by default. A program function's `model: NAME` frontmatter names a",
    "model role or a 'provider:id' ref.",
    "",
    "Results and traces:",
    "  Your result lists each root call (name, outcome, model, turns, tokens, record id).",
    "  A failed call throws NatlangCallError: 'name: outcome: detail'.",
    "  await natlang.trace(callId) returns the call's record and event trace; read it instead of guessing.",
    "",
    "Cancelling the run stops its natlang calls. Calls cost model tokens: keep them focused, and do exact",
    "work (arithmetic, parsing, filtering) in ordinary code.",
  ].join("\n");
}
