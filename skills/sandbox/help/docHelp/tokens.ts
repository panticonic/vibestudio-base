/** Literal question tokens, preserving spelling. Semantic term selection belongs to keywords.nl. */
export default function tokens(question: string): string[] {
  return [
    ...new Set(
      question.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/gu) ?? [],
    ),
  ];
}
