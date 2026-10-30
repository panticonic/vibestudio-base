/** Remove what a report must never carry from text, and say what was removed. */

const SECRET_PATTERNS: [string, RegExp][] = [
  ["bearer token", /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/g],
  ["API key", /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ["Slack token", /\bxox[abpr]-[A-Za-z0-9-]{10,}/g],
  ["AWS key id", /\bAKIA[0-9A-Z]{16}\b/g],
  ["JSON web token", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  [
    "credential assignment",
    /\b(?:token|secret|password|passwd|api[_-]?key)\b\s*[=:]\s*["']?[^\s"',;]{6,}/gi,
  ],
];

export type Redacted = { text: string; removed: string[] };

export default function redact(text: string): Redacted {
  const removed: string[] = [];
  let out = text;
  for (const [name, pattern] of SECRET_PATTERNS) {
    out = out.replace(pattern, () => {
      if (!removed.includes(name)) removed.push(name);
      return "[redacted]";
    });
  }
  out = out.replace(/\bhttps?:\/\/[^\s)"'<>]+/g, (url) => {
    const clean = url.replace(/^(https?:\/\/)[^/@\s]*@/, "$1").replace(/[?#].*$/, "");
    if (clean !== url && !removed.includes("URL query or userinfo"))
      removed.push("URL query or userinfo");
    return clean;
  });
  out = out.replace(/(?:\/home\/[^/\s]+|\/Users\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/g, () => {
    if (!removed.includes("home path")) removed.push("home path");
    return "~";
  });
  return { text: out, removed };
}
