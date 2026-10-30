/**
 * The natlang programs that ship with the runtime: `.nl` files in this folder, embedded by scripts/generate-builtin.mjs
 * (sources.generated.ts). This module is a leaf (it imports nothing from the runtime), so prompt modules can take text
 * from it; the loader that turns the files into callables is runtime/builtin.ts.
 */
import { BUILTIN_SOURCES } from './sources.generated.js';
export { BUILTIN_SOURCES };
/** The names of the built-in programs (file names without `.nl`). */
export declare const builtinNames: () => string[];
/** The exact text of a built-in `.nl` file. */
export declare function builtinSource(name: string): string;
/** A built-in program's instructions as the model reads them: the text after the frontmatter, without its leading and trailing newlines. */
export declare function builtinBody(name: string): string;
/**
 * The body of the builtin `view(value, instructions?)` (DECISIONS.md 2026-10-09, "one summarizer family"): faithful
 * compression without instructions, what their purpose needs with them. The prompt piece `view`: the system text of
 * view's write site, where its Neuralese instance is a template write of this body.
 */
export declare const VIEW_PROMPT: string;
