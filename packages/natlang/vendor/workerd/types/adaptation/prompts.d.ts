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
};
export type NativeProgramGuidance = {
    readonly kind: 'native-program-guidance';
    readonly text: string;
    readonly program_id?: string;
    readonly binding?: Readonly<MemeticGuidanceBinding>;
};
export type AuthoredTextGuidance = {
    readonly kind: 'authored-text-guidance';
    readonly program_id: string;
    readonly text: string;
};
/** Bind stored guidance to the current native reader when a runtime call begins. */
export declare function nativeProgramGuidance(input: string | MemeticGuidanceBinding, programId?: string): NativeProgramGuidance;
/** Text-only authored policy; separate from native state and bound to one program. */
export declare function authoredTextGuidance(text: string, programId: string): AuthoredTextGuidance;
export declare function renderAuthoredTextGuidance(guidance?: AuthoredTextGuidance): string;
