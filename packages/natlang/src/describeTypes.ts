/**
 * What `natlang.describe(path)` returns: a workspace natlang program's functions with their signatures, as data an
 * editor can draw a typed form from. Type-only and dependency-free, so a panel can import it without bundling the
 * natlang compiler.
 */

/** A natlang type tree (natlang's `Type`, with named aliases expanded for an editor). Opaque here: the dashboard reads it. */
export type NatlangTypeTree = { kind: string; [field: string]: unknown };

/** One declared input (or the result) of a function, as natlang's dashboard forms read it. */
export interface ArgumentDescription {
  name: string;
  /** The type as written, after formatting. */
  type: string;
  text: string;
  required: boolean;
  description?: string;
  tree: NatlangTypeTree;
  /** Set when the type does not resolve (an unknown alias, for example). */
  problem?: string;
}

export interface FunctionDescription {
  /** The function's name (its file name without `.nl`). */
  name: string;
  /** Its source path relative to the program's root. */
  source: string;
  description?: string;
  /** `name: type` for each parameter, a `?` after the name marking an optional one. */
  params: string[];
  returns: string;
  fields: ArgumentDescription[];
  result: ArgumentDescription;
  readout?: string;
  model?: string;
}

export interface ProgramDescription {
  /** The program's root: the folder, or the folder of the file that was described. */
  root: string;
  /** The services its declarations give its functions. */
  services: string[];
  functions: FunctionDescription[];
}
