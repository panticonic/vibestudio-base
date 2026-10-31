/** Natlang's executor identity (adaptation/types.ts): what ran a call and how it was served. */
export type ExecutorIdentity = { id: string; configuration: Readonly<Record<string, unknown>> };
