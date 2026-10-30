/**
 * The evaluation and adaptation APIs a host script uses to run natlang suites in Node: `@natlang/node/evaluation`,
 * `/adaptation` and `/optimize` as one entry point (staged for Vibestudio by scripts/stage-vibestudio.mjs).
 */
export * from '../evaluation/index.js';
export * from '../adaptation/index.js';
export { loadAdaptation } from '../adaptation/node.js';
export { optimize, resumeOptimization, exportAdaptationPatch, revalidateAdaptation } from '../optimization/index.js';
export { executorIdentityForChoice } from '../model/config.js';
export { loadModelConfiguration, createResolvedModelSession, localModelPrerequisites, wrapDriver, sessionDriver } from '../model/index.js';
export { createNatlangRuntime, nodePlatform } from '../runtime/node.js';
