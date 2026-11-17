declare module "natlang:services" {
  /** The capability catalog: host services and runtime APIs the caller may call. */
  export const docs: {
    search(
      query: string,
      options?: {
        surface?: "service" | "runtime" | "workspace";
        limit?: number;
      },
    ): Promise<
      {
        id: string;
        qualifiedName: string;
        title: string;
        description?: string;
      }[]
    >;
    describe(
      id: string,
    ): Promise<{
      id: string;
      qualifiedName: string;
      title: string;
      description?: string;
    } | null>;
  };
  /** Read-only workspace files: ripgrep search and bounded reads. */
  export const fs: {
    grep(
      pattern: string,
      options?: {
        path?: string;
        glob?: string;
        caseInsensitive?: boolean;
        maxMatches?: number;
      },
    ): Promise<{
      matches: { file: string; lineNumber: number; line: string }[];
      truncated: boolean;
    }>;
    readText(
      path: string,
      options?: {
        /** First line to return (1-indexed). */
        offset?: number;
        /** Maximum lines to return (default 2000; maximum 10000). */
        limit?: number;
        /** Maximum UTF-8 bytes to return (default 50 KiB; maximum 1 MiB). */
        maxBytes?: number;
      },
    ): Promise<{
      /** Selected text, bounded by line and byte limits. */
      text: string;
      /** SHA-256 of the complete file bytes. */
      contentHash: string;
      /** Total logical lines in the complete file. */
      totalLines: number;
      /** Total bytes in the complete file. */
      totalBytes: number;
      /** Applied line bound. */
      maxLines: number;
      /** Applied UTF-8 byte bound. */
      maxBytes: number;
      /** Requested first line. */
      startLine: number;
      /** Last returned line; less than startLine when empty. */
      endLine: number;
      /** UTF-16 offset of returned text in the complete file. */
      start: number;
      /** Exclusive UTF-16 end offset in the complete file. */
      end: number;
      /** True when more lines remain after this result. */
      truncated: boolean;
      /** Bound that stopped the result. */
      truncatedBy?: "lines" | "bytes";
      /** Line offset for the next read. */
      nextOffset?: number;
      /** True when the first requested line alone exceeds maxBytes. */
      firstLineExceedsLimit: boolean;
    }>;

    /** List the entries of a directory; returns bare name strings, or Dirent-shaped objects with type flags when `withFileTypes` is set, optionally recursing into subdirectories. */
    readdir(
      path: string,
      options?: {
        /** Return Dirent-shaped entries with type flags instead of bare name strings. */
        withFileTypes?: boolean;
        /** Recurse into subdirectories, reporting paths relative to the listed directory. */
        recursive?: boolean;
      },
    ): Promise<
      | string[]
      | {
          /** Entry name; basename for flat listings, path relative to the listed directory for recursive ones. */
          name: string;
          /** True if the entry is a regular file. */
          _isFile: boolean;
          /** True if the entry is a directory. */
          _isDirectory: boolean;
          /** True if the entry is a symbolic link. */
          _isSymbolicLink: boolean;
        }[]
    >;
  };
}
