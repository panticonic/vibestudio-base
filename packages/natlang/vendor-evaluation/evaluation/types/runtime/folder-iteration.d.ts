/** Folder-owned iteration: every successful step publishes source and state together. */
import type { FolderHandle, FolderSnapshot } from '../native/scoped-fs.js';
import { type IterationEvent, type ProgressJudgeFunction } from './iterate.js';
export type FolderIterationResult<S> = Readonly<{
    folder: FolderSnapshot;
    state: S;
}>;
export declare class FolderIteration<S> {
    private readonly iteration;
    constructor(folder: FolderHandle, reducer: unknown, initial: S, fixed: unknown[]);
    until(done: (state: S, folder: FolderSnapshot) => boolean | Promise<boolean>): Promise<FolderIterationResult<S>>;
    streamUntil(done: (state: S, folder: FolderSnapshot) => boolean | Promise<boolean>): AsyncIterable<Readonly<{
        kind: "initial" | "step" | "review" | "done" | "error";
        sequence: number;
        iteration: number;
        iterationId: string;
        siteId: string;
        state?: Readonly<{
            folder: FolderSnapshot;
            state: S;
        }> | undefined;
        review?: import("./iterate.js").ProgressVerdict;
        error?: string;
    }>> & {
        readonly __natlangIterationStream: true;
    };
    onStep(observer: (event: IterationEvent<FolderIterationResult<S>>) => void | Promise<void>): this;
    checkProgress(judge: ProgressJudgeFunction | 'off'): this;
    withMeasure(remaining: (state: S, folder: FolderSnapshot) => number): this;
    withLimit(limit: {
        maxSteps?: number;
        deadlineMs?: number;
    }): this;
    withSiteId(id: string): this;
    withCompilerSite(id: string): this;
    inFrame(frame: import('./context.js').Frame | undefined): this;
}
