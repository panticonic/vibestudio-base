import {sha256HexSyncText} from "@vibestudio/content-addressing";
/** Independent requirements of an authored task, separate from its execution trace. */
export type SemanticOutcomeContract = {
  effects: { checks: readonly string[]; rationale: string };
  returnedValue: { checks: readonly string[]; required: boolean; rationale: string; trainingEvidence?: "format-only" };
  incidentalValues?: { checks: readonly string[]; rationale: string };
};

type Verification = {
  passed: boolean;
  checks: Record<string, boolean>;
  [name: string]: unknown;
};

/** Adding independent checks may extend an assessment, never rewrite its observations. */
export function semanticOutcomeObservations(verification: Verification): Record<string, boolean> {
  const prior = (verification.observedChecks ?? {}) as Record<string, boolean>;
  if (!prior || typeof prior !== "object" || Array.isArray(prior) ||
      Object.values(prior).some(value => typeof value !== "boolean") ||
      !verification.checks || typeof verification.checks !== "object" || Array.isArray(verification.checks) ||
      Object.entries(verification.checks).some(([name, value]) => typeof value !== "boolean" ||
        (Object.hasOwn(prior, name) && prior[name] !== value)))
    throw new Error("The outcome projection must preserve its original observations");
  return { ...prior, ...verification.checks };
}

/** Compose independent application requirements without making optional receipts mandatory. */
export function composeSemanticOutcomes(...outcomes: readonly Verification[]) {
  const observedChecks: Record<string, boolean> = {};
  const dimensions = new Map<string, "effects" | "returnedValue" | "incidentalValues">();
  const reasons = {effects: new Set<string>(), returnedValue: new Set<string>(), incidentalValues: new Set<string>()};
  const incorrectReturnValues: unknown[] = [];
  for (const outcome of outcomes) {
    const assessed = assessSemanticOutcome(outcome);
    if(!assessed.outcomeContract.returnedValue.required && assessed.outcomeContract.returnedValue.trainingEvidence==="format-only" && outcome.unreviewedOptionalReturnPresent!==false)
      throw new Error("A composed format-only return needs an explicit outer-root training evidence binding; it cannot be silently promoted or discarded");
    for (const [name, value] of Object.entries(assessed.observedChecks)) {
      if (Object.hasOwn(observedChecks, name) && observedChecks[name] !== value)
        throw new Error(`Conflicting independent application observations: ${name}`);
      observedChecks[name] = value;
    }
    for (const dimension of ["effects", "returnedValue", "incidentalValues"] as const) {
      const clause = assessed.outcomeContract[dimension];
      if (!clause) continue;
      const target = dimension === "returnedValue" && !assessed.outcomeContract.returnedValue.required ? "incidentalValues" : dimension;
      reasons[target].add(clause.rationale);
      for (const name of clause.checks) {
        if (dimensions.has(name) && dimensions.get(name) !== target)
          throw new Error(`Conflicting independent application requirements: ${name}`);
        dimensions.set(name, target);
      }
    }
    if (Array.isArray(outcome.incorrectReturnValues)) incorrectReturnValues.push(...outcome.incorrectReturnValues);
  }
  const clause = (dimension: "effects" | "returnedValue" | "incidentalValues") => ({
    checks: [...dimensions].filter(([, owner]) => owner === dimension).map(([name]) => name),
    rationale: [...reasons[dimension]].join(" ") || "No independent requirements in this dimension.",
  });
  return assessSemanticOutcome({passed:false, checks:observedChecks, incorrectReturnValues}, {
    effects:clause("effects"), returnedValue:{...clause("returnedValue"),required:true}, incidentalValues:clause("incidentalValues"),
  });
}

export function assessSemanticOutcome<T extends Verification>(
  verification: T,
  contract?: SemanticOutcomeContract,
): T & { observedChecks: Record<string, boolean>; outcomeContract: SemanticOutcomeContract; outcomeDimensions: {
  effects: { passed: boolean; checks: Record<string, boolean> };
  returnedValue: { required: boolean; passed: boolean; checks: Record<string, boolean>; trainingEvidence?: "format-only"; unreviewedReturns?: {definition:{name:string;source:string};required:false;valueJson:string;sha256:string;trainingEvidence:"format-only";contribution?:unknown}[]; incorrectReturns?: {definition:{name:string;source:string};required:boolean;valueJson:string;sha256:string;contribution?:unknown}[] };
  incidentalValues?: { passed: boolean; checks: Record<string, boolean>; incorrectReturns: {definition:{name:string;source:string};required:boolean;valueJson:string;sha256:string;contribution?:unknown}[] };
} } {
  // Existing application oracles remain strict until their authored contract
  // identifies independent state checks and any incidental response convention.
  const declared: SemanticOutcomeContract = contract ?? (verification.outcomeContract as SemanticOutcomeContract | undefined) ?? {
    effects: { checks: Object.keys(verification.checks), rationale: "The domain verifier binds the actual application evidence and required returned values." },
    returnedValue: { checks: [], required: true, rationale: "The domain result is part of this task's existing application contract." },
  };
  // Domain verifiers and their callers may both assess the same outcome.
  // Preserve the original observations when required checks are projected out.
  const observedChecks = semanticOutcomeObservations(verification);
  const names = [...declared.effects.checks, ...declared.returnedValue.checks, ...(declared.incidentalValues?.checks ?? [])];
  if (new Set(names).size !== names.length || names.length !== Object.keys(observedChecks).length ||
      names.some(name => !Object.hasOwn(observedChecks, name)) ||
      !declared.effects.rationale.trim() || !declared.returnedValue.rationale.trim())
    throw new Error("The outcome contract must account for every independent application check once");
  const select = (names: readonly string[]) => Object.fromEntries(names.map(name => [name, observedChecks[name]!]));
  const effects = select(declared.effects.checks);
  const returnedValue = select(declared.returnedValue.checks);
  const incidental = select(declared.incidentalValues?.checks ?? []);
  const effectsPassed = Object.values(effects).every(value => value === true);
  const returnPassed = Object.values(returnedValue).every(value => value === true);
  const required = { ...effects, ...(declared.returnedValue.required ? returnedValue : {}) };
  const incorrectReturns=((verification.incorrectReturnValues as {definition:{name:string;source:string};required?:boolean;value:unknown;valueJson?:string;contribution?:unknown}[]|undefined) ?? []).map(item=>{
    const valueJson=item.valueJson??JSON.stringify(item.value);
    return {definition:item.definition,required:item.required!==false,valueJson,sha256:sha256HexSyncText(valueJson),...(item.contribution?{contribution:item.contribution}:{})};
  });
  const unreviewedReturns=((verification.unreviewedReturnValues as {definition:{name:string;source:string};valueJson:string;contribution?:unknown}[]|undefined)??[]).map(item=>({...item,required:false as const,trainingEvidence:"format-only" as const,sha256:sha256HexSyncText(item.valueJson)}));
  if(unreviewedReturns.length && (declared.returnedValue.required || declared.returnedValue.trainingEvidence!=="format-only"))throw new Error("An unreviewed return hold requires an explicitly optional format-only contract");
  return {
    ...verification,
    observedChecks,
    checks: required,
    passed: effectsPassed && (!declared.returnedValue.required || returnPassed),
    outcomeContract: declared,
    outcomeDimensions: {
      effects: { passed: effectsPassed, checks: effects },
      returnedValue: { required: declared.returnedValue.required, passed: returnPassed, checks: returnedValue,
        ...(declared.returnedValue.trainingEvidence?{trainingEvidence:declared.returnedValue.trainingEvidence}:{}),
        ...(unreviewedReturns.length?{unreviewedReturns}:{}),
        ...(!declared.incidentalValues&&incorrectReturns.length?{incorrectReturns}:{}) },
      ...(declared.incidentalValues ? {incidentalValues:{passed:Object.values(incidental).every(value=>value===true),checks:incidental,incorrectReturns}} : {}),
    },
  };
}

/** Publish every actual qualification observation with freshly assessed dimensions. */
export function assessNativeQualification<T extends Verification>(verification: T) {
  const assessed = assessSemanticOutcome(verification);
  return { ...assessed, checks: assessed.observedChecks };
}

/** Extend an existing native assessment without replacing observations or losing role ownership. */
export function extendSemanticOutcomeEffects<T extends Verification>(
  verification: T,
  additional: Record<string, boolean>,
) {
  const original = assessSemanticOutcome(verification);
  for (const [name, value] of Object.entries(additional)) {
    if (typeof value !== "boolean" || Object.hasOwn(original.observedChecks, name))
      throw new Error("Additional native checks must be new boolean observations");
  }
  const outcomeContract = {
    ...original.outcomeContract,
    effects: {
      ...original.outcomeContract.effects,
      checks: [...original.outcomeContract.effects.checks, ...Object.keys(additional)],
    },
  };
  return assessNativeQualification({
    ...verification,
    checks: { ...original.observedChecks, ...additional },
    outcomeContract,
  });
}
