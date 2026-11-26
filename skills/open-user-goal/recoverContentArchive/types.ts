export * from "./contract.js";
export type ContentArchiveWorkingDiff = { paths: string[]; collision: boolean; coedit: boolean };

import type {ContentArchiveAssignment,ContentArchiveObservation,ContentArchiveChoice,ContentArchivePlan} from "./contract.js";
export type ArchiveRecoveryInquiry={assignment:ContentArchiveAssignment;observation:ContentArchiveObservation|null;archive:ContentArchiveChoice|null;plan:ContentArchivePlan|null};
