export declare function errorDataProperty(value: unknown, key: string): unknown;
export type OperationalErrorMetadata = {
    readonly name?: string;
    readonly code?: string;
    readonly syscall?: string;
    readonly phase?: "dns" | "connect" | "fetch-head" | "response-body" | "websocket-upgrade" | "socket";
    readonly address?: string;
    readonly port?: number;
    readonly errno?: number;
    readonly cause?: OperationalErrorMetadata;
    readonly errors?: readonly OperationalErrorMetadata[];
    readonly circular?: true;
    readonly truncated?: true;
};
/** Only protocol error identifiers; error messages/stacks may contain request data. */
export declare function operationalErrorMetadata(error: unknown): OperationalErrorMetadata;
/** Array entries are observed without invoking indexed accessors or array methods. */
export declare function errorArrayItems(value: unknown, limit?: number): unknown[];
/** Existing private collector error fields plus strictly content-free operational evidence. */
export declare function providerFailureEvidence(error: unknown): {
    name: string;
    message: string;
    diagnostics?: OperationalErrorMetadata;
    [key: string]: unknown;
};
