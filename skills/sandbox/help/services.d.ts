declare module "natlang:services" {
  /** The capability catalog: host services and runtime APIs the caller may call. */
  export const docs: {
    search(
      query: string,
      options?: { surface?: "service" | "runtime" | "workspace"; limit?: number },
    ): Promise<{ id: string; qualifiedName: string; title: string; description?: string }[]>;
    describe(id: string): Promise<{ id: string; qualifiedName: string; title: string; description?: string } | null>;
  };
  /** Read-only workspace files: ripgrep search and bounded reads. */
  export const fs: {
    grep(
      pattern: string,
      options?: { path?: string; glob?: string; caseInsensitive?: boolean; maxMatches?: number },
    ): Promise<{ matches: { file: string; lineNumber: number; line: string }[]; truncated: boolean }>;
    readText(path: string, options?: { maxBytes?: number }): Promise<{ text: string; truncated: boolean }>;
  };
}
