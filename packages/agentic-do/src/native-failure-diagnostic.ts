/** Log original failure boundaries without serializing operation arguments or results. */
export function nativeFailureDiagnostic(error: unknown): unknown {
  const seen = new Set<Error>();
  const visit = (value: unknown, depth: number): unknown => {
    if (!(value instanceof Error)) return { message: String(value) };
    const diagnostic: Record<string, unknown> = { name: value.name, message: value.message };
    if (seen.has(value)) return { ...diagnostic, circular: true };
    if (depth === 16) return { ...diagnostic, omittedCauses: true };
    seen.add(value);
    if (value.cause !== undefined) diagnostic["cause"] = visit(value.cause, depth + 1);
    if (value instanceof AggregateError) diagnostic["errors"] = value.errors.map((child) => visit(child, depth + 1));
    return diagnostic;
  };
  return visit(error, 0);
}
