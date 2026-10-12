/**
 * The `file-mutation.v1` result protocol of write/edit/apply_patch, read
 * tolerantly from a tool result (`result.details ?? result`).
 */
type RecordValue = Record<string, unknown>;

export interface MutationOperation {
  operation: number;
  path: string;
  kind: string;
  status: "created" | "changed" | "deleted" | "unchanged";
  bytesWritten?: number;
  firstChangedLine?: number;
  diff?: string;
  diffTruncated?: boolean;
  diffOriginalChars?: number;
  matches?: Array<{ replacement: number; mode: "exact" | "normalized"; line: number }>;
}

export interface MutationConflict {
  operation: number;
  path: string;
  reason: string;
  message: string;
  matchMode?: string;
  matchCount?: number;
  candidateLines?: number[];
  requestedText?: string;
  suggestedScratchPath?: string;
  closestCurrentExcerpts?: Array<{ startLine: number; endLine: number; text: string }>;
  recovery?: { action?: string; instruction?: string };
}

export interface FileMutationDetails {
  protocol: "file-mutation.v1";
  status: "applied" | "unchanged" | "conflict";
  storage: "vcs" | "scratch";
  intent?: string;
  operations: MutationOperation[];
  conflicts: MutationConflict[];
  vcsResult?: {
    workUnitId?: string;
    applicationId?: string;
    changeIds?: string[];
    workingHead?: unknown;
  };
}

export function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

export function extractFileMutationDetails(result: unknown): FileMutationDetails | null {
  const outer = record(result);
  const candidate = record(outer?.["details"]) ?? outer;
  if (
    candidate?.["protocol"] !== "file-mutation.v1" ||
    !Array.isArray(candidate["operations"]) ||
    !Array.isArray(candidate["conflicts"])
  ) {
    return null;
  }
  return candidate as unknown as FileMutationDetails;
}

