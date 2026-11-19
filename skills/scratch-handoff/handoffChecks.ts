import type { AnswerEvidence, PreparedHandoff, SourceRead } from "./types.js";

export function prepare(
  questions: string[],
  observed: SourceRead[],
  selection: AnswerEvidence[],
): PreparedHandoff {
  const sources = new Map(observed.map((source) => [source.id, source.lines]));
  const unanswered: string[] = [];
  const answers = questions.flatMap((question, index) => {
    const matches = selection.filter((entry) => entry.question === index + 1);
    const excerpts = matches[0]?.excerpts ?? [];
    if (matches.length !== 1 || excerpts.length < 1 || excerpts.length > 4) {
      unanswered.push(question);
      return [];
    }

    const evidence = excerpts.flatMap(({ sourceId, firstLine, lastLine }) => {
      const lines = sources.get(sourceId);
      if (
        !lines ||
        !Number.isInteger(firstLine) ||
        !Number.isInteger(lastLine) ||
        firstLine < 1 ||
        lastLine < firstLine ||
        lastLine > lines.length ||
        lastLine - firstLine >= 8
      )
        return [];
      const text = lines.slice(firstLine - 1, lastLine).join("\n");
      return text.trim() ? [{ sourceId, firstLine, lastLine, text }] : [];
    });
    if (evidence.length !== excerpts.length) {
      unanswered.push(question);
      return [];
    }
    return [{ question, evidence }];
  });

  return {
    body: unanswered.length
      ? null
      : JSON.stringify({ answers }, null, 2) + "\n",
    unanswered,
  };
}
