import entries from "./entriesGenerated.js";

type Entry = {
  program: string;
  callable: string;
  resultType: string;
  skill: string;
  parameterNames: string[];
  additionalArguments: Record<string, unknown>;
};

export type SemanticTaskEntry = {
  program: string;
  callable: string;
  resultType: string;
  skill: string;
  arguments: Record<string, unknown>;
  parameterNames: string[];
  inputValues: unknown[];
};

/** Exact application entry metadata. Function bodies retain all semantic decisions. */
export function semanticTaskEntry(kind: string, goal: string, assignment?: { target?: string | null }): SemanticTaskEntry {
  if (!goal.trim()) throw new Error("A semantic task requires its original user goal");
  const name = kind === "vaultKnowledge" ? "vaultWork" : kind;
  const selected = name === "outcome-workspace" && assignment?.target !== undefined && assignment.target !== null
    ? "workspace-edit" : name;
  const descriptor = (entries as Record<string, Entry>)[selected];
  if (!descriptor) throw new Error(`No application entry is declared for ${kind}`);
  const input = { ...descriptor.additionalArguments, goal };
  return {
    program: descriptor.program,
    callable: descriptor.callable,
    resultType: descriptor.resultType,
    skill: descriptor.skill,
    arguments: input,
    parameterNames: [...descriptor.parameterNames],
    inputValues: descriptor.parameterNames.map(name => input[name as keyof typeof input]),
  };
}
