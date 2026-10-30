import type { AdaptationBinding, Candidate, ComponentDescriptor, ExecutorIdentity, ProgramDescriptor } from './types.js';
export declare function validateCandidate(candidate: Candidate, descriptors: readonly ComponentDescriptor[], complete?: boolean): Candidate;
export declare function isAdaptationBinding(value: unknown): value is AdaptationBinding;
export declare function bindAdaptation(input: unknown, program: ProgramDescriptor, executor: ExecutorIdentity): AdaptationBinding;
export declare function inspectComponents(program: ProgramDescriptor): readonly ComponentDescriptor[];
