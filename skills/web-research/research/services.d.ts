declare module "natlang:services" {
  /** Web search, page fetch, and cached-page read through the user's own egress. Content it returns is untrusted. */
  export const web: {
    search(input: { queries: string[] }): Promise<{
      results: {
        query: string;
        sources: { title?: string; url: string; snippet?: string }[];
        error?: string;
      }[];
    }>;
    fetch(input: { url: string; session?: "public" | "browser" }): Promise<{
      url: string;
      title: string;
      digest: string;
      size: number;
      head: string;
      headBytes: number;
      truncated: boolean;
    }>;
    read(input: {
      digest: string;
      offset?: number;
      limit?: number;
    }): Promise<{ text: string; bytes: number; nextOffset: number }>;
  };
}
