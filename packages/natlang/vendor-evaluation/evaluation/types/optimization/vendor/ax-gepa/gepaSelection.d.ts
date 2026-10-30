/** Adapted from Ax b780a14a3cb94d5ac572db04038399aef655c76c. Copyright Ax contributors. Apache-2.0. Modified for native keys and deterministic randomness; see vendor/ax-gepa/CHANGES.md. */
export type ComponentTarget = {
    key: string;
    dependsOn?: readonly string[];
};
export type BanditState = {
    proposals: number;
    accepts: number;
    lastAcceptIter: number;
    stagnation: number;
};
export declare class ComponentSelector {
    private readonly targets;
    private readonly states;
    constructor(targets: readonly ComponentTarget[], initialState?: Readonly<Record<string, BanditState>>);
    getState(id: string): BanditState | undefined;
    snapshot(): Record<string, BanditState>;
    pick(iteration: number, rand: () => number): ComponentTarget;
    recordProposal(id: string): void;
    recordResult(id: string, accepted: boolean, iteration: number): void;
}
