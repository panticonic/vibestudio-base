/** Shared semantics for direct answers, including programs with a smaller tool surface. */
export declare const SEMANTIC_RESULT_PROMPT: string;
/** Delegation asks a distinct question; the runtime refuses the same question over the same input (SAME_QUESTION_REFUSAL). */
export declare const SEMANTIC_CALL_COMPLETION_PROMPT: string;
export declare const TOOLS_PROMPT: string;
/** Added when the call has functions it can call, which is when the function tools are offered. */
export declare const FUNCTION_TOOLS_PROMPT = "\nIf a function you call is unclear or wrong, read it with read_code. Use edit_code to fix it when that tool is offered.\nSome functions are directory reducers. Call await someFolder.apply(reducer, ...args) to retain their edits and typed result. Call const proposal = await someFolder.propose(reducer, ...args) to try an edit without changing the receiving folder: proposal.folder is an immutable source snapshot, proposal.value its result. Evaluate proposal.folder, then await someFolder.accept(proposal) when justified; stale or foreign proposals fail. Use snapshot() to freeze source, snapshot.branch() for an independent population branch, and await someFolder.select(snapshot) to install the exact selected source from the same target. To improve a program repeatedly, await someFolder.iterateOn(step, initialState, ...fixedArgs).withMeasure(state => state.remaining).until(state => state.done). Here the receiver is a folder, so pass the step explicitly: someFolder.iterateOn(step, initialState, ...fixedArgs). This differs from a callable receiver: step.iterateOn(initialState, ...fixedArgs). The step receives a private folder and current JSON state, and returns the next state. The result is {folder, state}; each step commits source and state together and leaves the original folder unchanged. The nonnegative integer measure must decrease each step; semantic progress reviews remain active and cannot replenish it.\nAn explicit top-level return in eval stages the typed value and, when this reducer was applied to a folder, retains every change.";
/**
 * The file tools a directory reducer offers: all of them, the editor and bash (shape of SWE agents), or the separate
 * list/search/read/write/edit/diff tools. Which suits our models best is measured, not assumed (a probe per surface).
 */
export type FileToolSurface = 'all' | 'editor' | 'files';
export declare const FILE_TOOL_SURFACES: readonly FileToolSurface[];
/** The file tools of a surface, in the order they are offered. */
export declare function fileToolNames(surface?: FileToolSurface): string[];
/** File tools filtered by the actual write authority of this call's scoped folder. */
export declare function scopedFileToolNames(surface?: FileToolSurface, writable?: boolean): string[];
export declare const DIRECTORY_REDUCER_DECLARATION = "This call is a directory reducer: folder is a private copy of its input folder, and the changes you have made to it when you call return_result are kept.";
export declare function directoryReducerPrompt(surface?: FileToolSurface, allowAdHoc?: boolean, writable?: boolean, withheld?: readonly string[]): string;
export declare const DIRECTORY_REDUCER_PROMPT: string;
/**
 * The call note of a function whose result is a function (`returns: (t: Ticket) => boolean`): a function is not JSON, so
 * the call builds it in eval and finishes with it. Not under prompt revision 2026-11-22 (no such note then).
 */
export declare const functionResultNote: (type: string) => string;
/** The final ad hoc layer keeps computation and named helpers, but offers no new ad hoc calls. */
export declare const NL_DEPTH_LIMIT_NOTICE: string;
export declare const TOOLS_PROMPT_AT_NL_DEPTH_LIMIT: string;
/**
 * How calls usually go, schematically: the kinds of work a call does and the tool calls each takes. Placeholders in
 * angle brackets stand for whatever a call has, so the shapes carry over without a worked example to copy.
 */
export declare const APPROACH_PROMPT = "\n\nHow a call usually goes (a schematic: <angle brackets> stand for whatever this call has):\n- One step is one tool call. Read its result before you choose the next; calls sent together have not seen each other's results.\n- Getting at data: the names the first eval declared are already in scope. Use them in code and never declare them again. For example, if it lists `instance: string`, use `JSON.parse(instance)`; do not redeclare `instance` or copy it from `inputs.instance`. eval({ code: \"const firstRows = <store>.page(1); firstRows\" }) shows the rows and keeps firstRows for later evals. A name that holds a function is called inside eval code; it is not a tool. Top-level helper functions and supported local values carry forward to later evals; closures over ephemeral or non-portable state stay scoped to the eval that creates them.\n- Judging items: use inline nl lambdas for semantic judgments, extraction and transformations on items or computed values. Pass the actual item, the shared criterion and necessary context, await the typed result, and use code for exact bookkeeping. Named natural-language functions are reusable helpers too.\n- Editing a tree: make a deep mutable copy, change the requested leaf at its existing path, and preserve the surrounding nodes, wrappers and siblings unless the instructions ask to change them. Inspect that path in the result before returning the complete requested structure.\n- Acting on something that changes: call it, read what came back, and decide the next call from that. eval({ code: \"const seen = await <world>.<act>(<command>); seen\" }). When the next steps are certain, one eval may take several, stopping at the first surprise.\n- Repeating until done: write one step from state to next state, and let iterateOn repeat it. eval({ code: \"const step = (state: <State>): <State> => { <one step> }; const last = await iterateOn(step, <start>).until(state => <finished>); last\" }).\n- Inspecting a large input: use eval to select the fields or subtree relevant to the question before printing the whole object. A truncated display does not remove the original value from eval scope. Read additional pages only when you need their contents.\n- Dividing work among helpers: pass each helper the actual item or extracted page slice it should examine, together with the shared criterion and necessary context. Adding different page numbers to the same full input does not give helpers different slices. Reuse results already recorded in transcript.\n- Asking a helper: a function the instructions name for part of the work is awaited like any function. eval({ code: \"const part = await <helper>(<question>); part\" }).\n- Returning stored data: if eval already holds the exact answer in a local value, complete with eval({ code: \"<storedAnswer>\", finish: true }) or an explicit return of that value. This preserves every field, including long descriptions; do not retype an object from an abbreviated preview. console.log inspects a value but does not return it: a finishing eval must also evaluate or explicitly return the actual typed answer.\n- Finishing: answer with return_result({ status: \"success\", value: <value of the declared type> }). For computation or effects, eval({ code: \"<computation>; <value>\", finish: true }) completes the fresh typed result. When something the instructions rely on is absent: return_result({ status: \"blocked\", reason: \"<what is missing>\" }); when they ask for the impossible, status \"failed\". Code in a reply does not execute.";
/** Example text that only a copy of an example would contain: an eval using one in a call whose own instructions and
 * inputs do not is told so (native/runtime.ts). LFM3 1.7B with a thinking budget copied the system prompt's refund
 * example into 9 of 42 triage calls (2026-11-13); the system prompt's examples are schematic since 2026-11-23, and
 * read_code's nl documentation still shows this instruction. */
export declare const PROMPT_EXAMPLE_TEXTS: readonly string[];
/** Where PROMPT_EXAMPLE_TEXTS come from, as the refusal names it. */
export declare const PROMPT_EXAMPLE_SOURCE: string;
/** At the ad hoc depth limit, named helpers remain available but no new lambda is suggested. */
export declare const APPROACH_PROMPT_AT_NL_DEPTH_LIMIT: string;
/** Small always-on guidance for evidence selection and preserving structured outputs. */
export declare const GENERATION_GUIDANCE: string;
/** The system prompt of every tool-loop call: natlang run, eval probes and training collection send this same text,
 * so the model runs on the prompt it is trained and evaluated with. */
export declare const SYSTEM_PROMPT: string;
/** GENERATION_GUIDANCE at the depth limit (promptAtNlDepthLimit). */
export declare const GENERATION_GUIDANCE_AT_NL_DEPTH_LIMIT: string;
/** Preserve custom instructions while removing both standard prompts' unavailable child-call guidance at the depth limit. */
export declare function promptAtNlDepthLimit(prompt: string): string;
/** Appended to the latest tool result when the next turn must compact. */
export declare const COMPACTION_NOTICE: string;
/** Pinned when the conversation is shortened without a note from the model. */
export declare const AUTOMATIC_NOTE: string;
/** The frame of a pinned compaction (handover) note: HANDOVER_NOTE_OPEN + note + HANDOVER_NOTE_CLOSE. */
export declare const HANDOVER_NOTE_OPEN = "Your note from compacting this conversation: ";
export declare const HANDOVER_NOTE_CLOSE: string;
/** Appended to the tool results of the last turn of a call. */
export declare const LAST_TURN_NOTICE: string;
/** The compact_history tool's result. */
export declare const COMPACTED_RESULT = "Compacted: older outputs and code are in transcript, and your note is kept after the instructions.";
/** The listing's note after a view of a cut-off value: the variable holds the value itself. */
export declare const viewNote: (holder: string) => string;
/**
 * The instructions of the view a call's opening listing shows for a value it would cut off: the purpose is the
 * receiving call, which reads the variable itself for exact details (training/neuralese view.py
 * `listing_instructions`; pinned by tests/fixtures/view-site.json).
 */
export declare const listingViewInstructions: (name: string, type: string, instructions: string) => string;
