/** Portable, data-only instruction adaptation contracts. */
export declare const ADAPTATION_SCHEMA: "natlang.adaptation/v1";
export type ComponentKind = 'lambda.instructions' | 'program.guidance';
export type InstructionTemplate = {
    readonly segments: readonly string[];
    readonly slotIds: readonly string[];
};
export type ComponentValue = {
    readonly kind: 'lambda.instructions';
    readonly template: InstructionTemplate;
} | {
    readonly kind: 'program.guidance';
    readonly text: string;
};
export type Candidate = Readonly<Record<string, ComponentValue>>;
export type FrozenComponentContract = {
    parameters: readonly {
        name: string;
        type: unknown;
        optional?: boolean;
    }[];
    returns: unknown;
    types: Readonly<Record<string, string>>;
    subtype: string;
    openParameters: boolean;
    declaredParameters?: true;
    captures: readonly {
        name: string;
        type: unknown;
        mutable: boolean;
        shadowedByParameter?: boolean;
    }[];
    slots: readonly string[];
    helpers: readonly string[];
    servicesHash: string;
    protocol: number;
    /** Lexical value names available at the authored site, and captures provided by unchanged slots. */
    visibleBindings: readonly string[];
    slotBindings: readonly string[];
};
export type ComponentDescriptor = {
    key: string;
    kind: ComponentKind;
    origin: 'named' | 'authored-inline' | 'program';
    definitionId?: string;
    source?: {
        path: string;
        start: number;
        end: number;
        templateStart?: number;
        templateEnd?: number;
        expressions?: readonly string[];
    };
    baseline: ComponentValue;
    baselineHash: string;
    contractHash: string;
    contract: FrozenComponentContract;
    constraints: {
        maxChars: number;
        requiredBindings: readonly string[];
    };
};
export type ProgramDescriptor = {
    schema: 'natlang.program/v1';
    id: string;
    buildHash: string;
    protocol: number;
    components: readonly ComponentDescriptor[];
    sources: Readonly<Record<string, string>>;
    guidanceScope: {
        importedPrograms: readonly string[];
    };
    services?: {
        declarations: Readonly<Record<string, string>>;
        scopes: Readonly<Record<string, readonly string[]>>;
    };
};
export type ExecutorIdentity = {
    id: string;
    configuration: Readonly<Record<string, unknown>>;
};
export type InferencePolicy = {
    codeEdits: 'allow' | 'deny';
    settings: Readonly<Record<string, unknown>>;
    limits?: {
        maxEpisodes?: number;
        maxDepth?: number;
        maxActions?: number;
        maxToolCalls?: number;
        timeoutMs?: number;
    };
    systemPromptHash?: string;
};
export type AdaptationArtifact = {
    schema: typeof ADAPTATION_SCHEMA;
    digest: string;
    program: {
        id: string;
        buildHash: string;
        protocol: number;
        guidanceScope: ProgramDescriptor['guidanceScope'];
    };
    executor: ExecutorIdentity;
    policy: InferencePolicy;
    components: readonly {
        key: string;
        baselineHash: string;
        contractHash: string;
        value: ComponentValue;
    }[];
    provenance: {
        runId: string;
        strategy: string;
        engine: string;
        suiteHash: string;
        seed: number;
        promotion: 'selected' | 'revalidated' | 'incumbent';
        evidence: Readonly<Record<string, unknown>>;
    };
};
export type AdaptationBinding = {
    readonly artifact: AdaptationArtifact;
    readonly program: ProgramDescriptor;
    readonly executor: ExecutorIdentity;
    readonly candidate: Candidate;
};
