/**
 * The pluggable search policies of the component-search engine: which parent, which kind of experiment (edit or
 * compose) and which components. Each has a crisp default equal to the engine's former behavior and a natural-language
 * side in the authored program (applications/program-improver: improveStep/chooseParent.nl and
 * componentSearchStep/chooseMove.nl, chooseComponents.nl). A setting selects `crisp` (default), `nl` or `shadow`. A
 * natural-language choice is bounded by the crisp verifier in this file; a choice outside the bound throws an error that
 * says what the bound is. The selection math itself is src/gepa.
 */
import { type PluggableSetting } from '../runtime/pluggable.js';
import type { ComponentTarget } from './vendor/ax-gepa/gepaSelection.js';
import type { Candidate } from '../adaptation/types.js';
import type { SearchCandidate } from './types.js';
export type ComponentPolicyName = 'chooseParent' | 'chooseMove' | 'chooseComponents';
export type ComponentPolicySettings = Partial<Record<ComponentPolicyName, PluggableSetting>>;
export type Move = 'edit' | 'compose';
export type ParentChoice = {
    id: string;
    quality: number;
    wonCases: string[];
    timesParent: number;
};
export type MoveFacts = {
    iteration: number;
    members: {
        id: string;
        changedKeys: string[];
    }[];
};
export type ComponentFacts = {
    eligible: {
        key: string;
        coveredCases: number;
        failingCases: number;
        proposals: number;
        accepts: number;
    }[];
};
/** The natural-language side of a policy, loaded from the authored program. */
export declare function policyFunction(name: ComponentPolicyName): (...args: unknown[]) => Promise<any>;
/** The settings validated: each names a mode or is absent. */
export declare function checkPolicySettings(settings: ComponentPolicySettings | undefined): ComponentPolicySettings;
/** The facts a parent choice reads: the cases each candidate wins and how often it has been a parent. */
export declare function parentChoices(population: readonly SearchCandidate[]): ParentChoice[];
/** A parent is a population member. */
export declare function verifyParent(id: string, population: readonly {
    id: string;
}[]): string;
/** The crisp move: a scheduled composition every fourth experiment of a population-based search. */
export declare function crispMove(strategy: 'gepa' | 'reflection', iteration: number, members: number): Move;
/** The component keys each member changed relative to the baseline. */
export declare function moveFacts(iteration: number, population: readonly SearchCandidate[], baseline: Candidate): MoveFacts;
/** A move is `edit` or `compose`, and composing needs two members to merge. */
export declare function verifyMove(move: string, members: number): Move;
/** The keys closed under their dependencies. */
export declare function closeUnderDependencies(keys: readonly string[], targets: readonly ComponentTarget[]): string[];
/** Chosen keys are eligible, which the host then closes under their dependencies. */
export declare function verifyComponents(keys: readonly string[], eligible: readonly string[]): string[];
/** The facts a component choice reads: per eligible key, the parent's training cases that cover it and the edits tried. */
export declare function componentFactsOf(keys: readonly string[], parent: SearchCandidate, selector: Readonly<Record<string, {
    proposals: number;
    accepts: number;
}>>): ComponentFacts;
/** One pluggable decision: `crisp` and `nl` are the two implementations of the same part, served per the setting. */
export declare function decide<A extends unknown[], R>(name: ComponentPolicyName, setting: PluggableSetting, crisp: (...args: A) => R | Promise<R>, nl: (...args: A) => R | Promise<R>): (...args: A) => Promise<R>;
