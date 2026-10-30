import type { PreparedSuite } from '../evaluation/types.js';
import type { OptimizationOptions, OptimizationResult } from './types.js';
export declare function optimize(prepared: PreparedSuite, options: OptimizationOptions): Promise<OptimizationResult>;
export declare function resumeOptimization(prepared: PreparedSuite, directory: string, options: OptimizationOptions): Promise<OptimizationResult>;
