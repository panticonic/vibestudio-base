/** Authority instructions remain first. Program guidance precedes the call objective. */
export type MemeticGuidanceBinding = {
    schema: 'natlang.memetic-program-guidance/1';
    program_id: string;
    student: {
        architecture: string;
        checkpoint_sha256: string;
        tokenizer_fingerprint: string;
        embedding_weight_sha256: string;
    };
    text: string;
    native_state_id: string;
    native_state_artifact: {
        path: string;
        sha256: string;
        bytes: number;
    };
    program_guidance: string;
    /** Function scope: only calls of this function (the `.nl` file stem) import it; absent, every call of the program does.
     * A function binding's text is complete for its calls (program-wide part first, then the function's own part). */
    function?: string;
};
export type NativeProgramGuidance = {
    readonly kind: 'native-program-guidance';
    readonly text: string;
    readonly program_id?: string;
    readonly binding?: Readonly<MemeticGuidanceBinding>;
};
/** Scoped guidance of one program: each call imports at most one binding, its function's if present, else the program-wide one. */
export type NativeProgramGuidanceSet = {
    readonly kind: 'native-program-guidance-set';
    readonly program_id: string;
    readonly program?: NativeProgramGuidance;
    readonly functions: Readonly<Record<string, NativeProgramGuidance>>;
    readonly bindings: readonly Readonly<MemeticGuidanceBinding>[];
};
export type ProgramGuidance = NativeProgramGuidance | NativeProgramGuidanceSet;
export type ProgramGuidanceInput = MemeticGuidanceBinding | readonly MemeticGuidanceBinding[];
export type AuthoredTextGuidance = {
    readonly kind: 'authored-text-guidance';
    readonly program_id: string;
    readonly text: string;
};
/** Bind stored guidance to the current native reader when a runtime call begins. */
export declare function nativeProgramGuidance(input: string | MemeticGuidanceBinding, programId?: string): NativeProgramGuidance;
/**
 * One binding, or a list of scoped bindings of one program: at most one program-wide binding (no `function`) and at
 * most one per function. A single program-wide binding stays the plain guidance it always was.
 */
export declare function programGuidance(input: ProgramGuidanceInput): ProgramGuidance;
/** The program a guidance value belongs to. */
export declare function programGuidanceProgram(guidance: ProgramGuidance | undefined): string | undefined;
/** The exact bindings a run was given, for provenance digests (a single binding digests as itself). */
export declare function programGuidanceIdentity(guidance: ProgramGuidance): unknown;
/** The one guidance a call of `functionName` imports: its function's binding, else the program-wide one, else none. */
export declare function guidanceForCall(guidance: ProgramGuidance | undefined, functionName: string | undefined): NativeProgramGuidance | undefined;
/** Text-only authored policy; separate from native state and bound to one program. */
export declare function authoredTextGuidance(text: string, programId: string): AuthoredTextGuidance;
export declare function renderAuthoredTextGuidance(guidance?: AuthoredTextGuidance): string;
