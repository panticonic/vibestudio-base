import summarizeChanges from "./summarizeChanges.nl";

/** The proposal for `vcs({ operation: "commit", message, intent })` that a compare result supports. */
export const semanticCommitMessage = summarizeChanges.commitMessage;

export { summarizeChanges };
