---
name: natlang-authoring
description: Write, check, run and debug natlang programs in a Vibestudio workspace — named `.nl` functions (typed frontmatter plus natural-language instructions) with their callable folders, and inline `nl` calls in eval cells. Use when a workspace has `.nl` files, when the user asks for a natlang function or program, or when a natlang call fails or decides wrongly.
---

# Write natlang programs in Vibestudio

Natlang is TypeScript with natural-language functions. A `.nl` file is a function: its frontmatter declares a typed
signature and its body is instructions a small model carries out (the `executor` model role: the local executor model
when it is ready, otherwise a billed low-tier hosted model). The result is checked against the declared type. Because
the model is small, you put the algorithm, the decomposition and the data contracts in the source, and the model only
takes the next step.

Everything here runs in an eval cell: `nl` and `natlang` are ambient there (no import). The eval reference is the
natlang section of [EVAL.md](../sandbox/EVAL.md#natlang-nl-and-natlang), and `await help("natlang")` is the
authoritative summary in a live cell. If this skill disagrees with them or with `natlang.describe`, trust those.

## The working loop

| Step | In an eval cell | What it does |
|---|---|---|
| Check | `await natlang.describe("skills/x")` | Compiles the program the way `load` does (types, `nl` signatures, callable-folder scope and loop policy, declared services) and returns its functions with typed signatures. A program that does not compile fails with `path:line:column` diagnostics. Nothing runs. |
| Call | `const judge = await natlang.load("skills/x/judge.nl"); await judge(note)` | One real call. A folder loads as a record of callables. |
| Read | `await natlang.trace(callId)` | What the model did: inputs, each turn's actions and results, child calls, the scope it ended with, why it ended. `{ raw: true }` for the full record. |
| Navigate | `await natlang.calls({ parentCallId })` | A call's children; `{ run }` a run's calls. |
| Retry | `judge.on({ model: "standard" })(note)`, `await natlang.rerun(callId, { model })` | The same function on another model (through the model gateway); a recorded program call replayed on its recorded inputs. |

Every call is listed in the eval result (`[natlang]` lines): name, outcome or failure reason, model, turns, tokens, and
its record id, which is the `callId` the methods above take. Calls take seconds on a hosted model and can take minutes
on the local CPU model: check first, then call deliberately.

Template developers also have, from a Vibestudio source checkout: the static check of every program in a template
(`workspacePrograms.test.ts`, through `pnpm test:userland -- --template T`) and evaluation suites
(`suite.ts` and `cases.jsonl` beside a program, `pnpm natlang:eval -- --template T --suite PATH`). Neither runs inside
a workspace.

## A named function

```text
skills/review/
  types.ts            type aliases, visible to the functions here and below
  review.nl           the function
  review/             its callable folder: what review.nl may call
    assess.nl         a natural-language helper
    summarize.ts      an exact TypeScript helper (default export)
```

```yaml
---
description: Assess each observation and count the verdicts.
args:
  observations: Untrusted<string>[]
  criterion: string
returns: Report
---
Assess every observation against the criterion with assess; the assessments are independent, so they can run
together. Then return summarize of the assessments, in the original order.
```

Frontmatter keys:

- `args`, `returns`, `types`, `generic`: TypeScript type text, read verbatim (no YAML quoting needed, no comments
  after a type). `Untrusted<string>` marks outside text: the model sees it as quoted data, never as instructions.
- `description`; `kind: directory-reducer` for a function over a folder.
- `readout: decision` for a finite result (a literal union, `boolean`): one scoring pass instead of a tool loop. The
  `[natlang]` line then shows the chosen value's probability and the runner-up, and flags a close call.
- `model: NAME`: a model role (`executor`) or a `"provider:id"` ref the function runs on.
- `budget: { maxTurns: 8, turnTokens: 1024 }`: the model work one call may take (also `maxTokens`,
  `contextTokens`). Without it a call has the executor's budget: 6 turns of up to 512 reply tokens in an 8192-token
  context. Declare what the function's evaluation suite measured, not a number that merely makes a run finish.
- `uses: [dir/item]`: package items it may call besides its callable folder. `withhold: [delegate]`: tools its calls
  are not offered.

**Callable folders.** A function calls exactly the items in its companion folder (`foo/` beside `foo.nl`) and their
children. Items of one folder do not see each other: when `inspect` must call `decide`, nest it
(`root/inspect/decide.nl`) or list it in `uses:`.

**Services.** A program gets exactly the services its `services.d.ts` declares
(`declare module 'natlang:services' { export const serverLog: ... }`) or its TypeScript modules import from
`natlang:services`, each a narrowed view of the calling eval's own binding: the caller's approvals and authority
checks apply unchanged. A program returns proposals for consequential effects; the caller commits them.

**Inline `nl` in a cell.** For one focused judgment inside ordinary code:

```ts
const priority: "urgent" | "normal" = await nl`Decide whether ${ticket} is urgent.`(ticket);
```

The annotation (or `nl<T>`) is the result type and the call's arguments are its parameters. An inline call has no
services and no access to your bindings: it sees its arguments, the values its instructions mention, and what you
hand over with `` nl`...`.with({ name: value }) ``.

## Design the program

1. **Draw the boundary.** Code does exact work: arithmetic, parsing, sorting, counting, I/O. Natural language does
   judgment: interpreting, classifying, choosing, explaining. Most programs are ordinary code with a few `nl` decisions
   where meaning matters.
2. **Give each function one responsibility** with a precise signature. Split a stage that asks for several judgments
   at once into typed children, and give the parent the children's results, not their raw inputs.
3. **Put constraints in types, not sentences.** A literal union or a record in `returns` beats "answer with one
   of...". A property a reader can judge from the value goes in `Is<string, "one line of at most 60 characters">`.
   Doc comments on fields in `types.ts` reach the model.
4. **Write instructions a small model can follow.** Number the steps, name the data each step uses, and say what the
   result is and when the task is done. Say when "not found" is a valid answer.
5. **Loop structurally.** Callable-folder TypeScript and eval code have no `while` or open `for(;;)`: use `for...of`,
   counted loops, array methods, recursion on a smaller argument, or `iterateOn`. Run independent calls together with
   `Promise.all(items.map(f))`.
6. **Use `readout: decision`** for a finite result that gates an action.

## When a call fails or decides wrongly

A failed call throws `NatlangCallError` with `callId`, `reason`, `detail`, `trace` and `partial`; uncaught, it fails
the cell as `natlang NAME: OUTCOME: DETAIL (record CALL_ID)` followed by the reason's next step. The reason table and
a recovery recipe are in [EVAL.md, When a natlang call fails](../sandbox/EVAL.md#when-a-natlang-call-fails). In short:

- `blocked` / `failed`: the model says the inputs do not support an answer. Check what you passed (the digest's
  `inputs`); pass the missing evidence as an argument.
- `type-mismatch`, `repeated-failed-action`, `no-action`: the model could not do it in the declared form. Read the
  digest's last turn, narrow the type or instructions, split the stage, or retry once with `.on({ model })`.
- `budget-exhausted`: too much work for one call. Move exact work into code and leave the model one decision.
- `executor-unavailable`, `model-unavailable`, `model-refused`, `cancelled`: not the program. See the `local-models`
  skill, connect a provider, or report it; do not retry a refusal in a loop.

Every run failing the same way points at the program, not the model. A correct type with a wrong answer raises no
error: for a decision, look at its probability in the `[natlang]` line, and on a close call confirm against the
evidence or ask.

## Common compile errors

| Error | Fix |
|---|---|
| `nl-unknown-return`, `nl-ambiguous-signature` | Annotate the binding or write `nl<T>`; don't widen to `any`. |
| `unknown type name X` at a frontmatter line | Declare `X` in `types.ts` or `types:`, or write the structure. |
| `no-such-function` from a child | The callee is a sibling, not in the caller's folder: nest it or list it in `uses:`. |
| `` `while` loops are not allowed here `` | Rewrite as `for...of`, a counted loop, an array method or `iterateOn`. |
| `untrusted-instruction` | Pass untrusted text as an argument, never interpolate it into instructions. |
| `cannot get its services` | The program declares a service this eval has no binding for: run it where the binding exists, or remove the declaration. |
