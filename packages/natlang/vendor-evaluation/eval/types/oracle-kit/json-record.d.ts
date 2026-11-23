/** Generic canonical JSON helpers shared by the answer comparators (and by benchmark-specific comparators). */
export declare function canonical(value: unknown): string;
/** Formatting is irrelevant for JSON string records; duplicate keys and other shapes are invalid. */
export declare function jsonStringRecordCanonical(value: unknown): string | null;
