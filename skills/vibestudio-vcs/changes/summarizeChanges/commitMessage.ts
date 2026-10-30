/** A proposed commit message and intent for a compare result. The agent commits it; nothing here changes the workspace. */
import digest from "./digest.js";
import commitSubject from "./commitSubject.nl";
import givesReason from "./givesReason.nl";
import type { ChangeDigest, CommitProposal, Compare } from "../types.js";

/** Why a subject cannot be used as the message, or null. The model writes the line; the rules about its form are exact. */
function problemWith(subject: string, changes: ChangeDigest): string | null {
  const line = subject.trim();
  if (line === "") return "The line is empty.";
  if (line.includes("\n")) return "The subject must be a single line.";
  if (line.length > 72)
    return `The line is ${line.length} characters; write at most 72.`;
  const names = changes.units.flatMap((unit) => [
    unit.unit,
    ...unit.files.map((file) => file.path),
  ]);
  const words = names
    .flatMap((name) => name.split(/[/._-]+/).filter((word) => word.length >= 3))
    .map((word) => word.toLowerCase());
  const mentions = words.some((word) => line.toLowerCase().includes(word));
  if (
    !mentions &&
    changes.intents.every(
      (intent) =>
        !line
          .toLowerCase()
          .split(/\W+/)
          .some(
            (word) =>
              word.length >= 5 && intent.text.toLowerCase().includes(word),
          ),
    )
  ) {
    return "The line names nothing that digest shows; name the repository, a file or the thing changed.";
  }
  return null;
}

export default async function commitMessage(
  compare: Compare,
): Promise<CommitProposal> {
  const changes = digest(compare);
  const warnings: string[] = [];
  let message = (await commitSubject(changes)).trim();
  const problem = problemWith(message, changes);
  if (problem !== null) {
    message = (await commitSubject(changes, problem)).trim();
    const again = problemWith(message, changes);
    if (again !== null) warnings.push(`Subject rejected: ${again}`);
  }
  if (changes.truncated)
    warnings.push(
      "The comparison is truncated; the message describes only the changes listed.",
    );
  const stated = changes.intents.filter((intent) => intent.tier === "stated");
  const reasons = await Promise.all(
    stated.map((intent) => givesReason(intent.text)),
  );
  const reason = stated.find((_, index) => reasons[index]);
  return { message, intent: reason ? reason.text : null, warnings };
}
