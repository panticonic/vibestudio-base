import { createPrivateGuestGlobal } from "@vibestudio/shared/evalConfinement";
import type { Realm } from "../vendor/core/natlang-core.js";

/** The host's string-to-function constructor: workerd's `UNSAFE_EVAL.newFunction`. */
export type NewFunction = (
  body: string,
  name: string,
  ...argNames: string[]
) => (...args: unknown[]) => unknown;

/**
 * The realm natlang's child evals and compiled program modules run in: the same
 * confinement the eval engine gives a cell (`execute` with
 * `confinement: "private-global"`). Free names resolve against a private,
 * allowlisted guest global that has no `fetch`, no host objects and no route
 * back to the real global, in a realm that cannot compile code
 * (`createPrivateGuestGlobal` refuses a realm that can). Bindings reach the code
 * only as the parameters natlang passes; the facade holds nothing else.
 *
 * A facade is built per call: nothing a child eval writes to `globalThis`
 * survives into another call or another task. State natlang keeps across evals
 * travels through the parameters it passes, never through the global.
 */
export function confinedRealm(newFunction: NewFunction): Realm {
  const compile = (argNames: string[], body: string) => newFunction(body, "natlang", ...argNames);
  const guestGlobal = (compile([], "return globalThis") as () => Record<string, unknown>)();
  return {
    call(body, parameters, args) {
      // `scope` claims every identifier, including names used by this wrapper;
      // the invocation values ride in the sloppy outer function's receiver, and
      // the strict guest function (`this === undefined`) cannot observe them.
      const run = compile(
        ["scope"],
        `with (scope) {\n` +
          `  return (function(${parameters.join(", ")}) {\n` +
          `    "use strict";\n${body}\n` +
          `  }).apply(undefined, this.receiver);\n` +
          `}`
      );
      return run.call({ receiver: args }, createPrivateGuestGlobal(guestGlobal));
    },
  };
}
