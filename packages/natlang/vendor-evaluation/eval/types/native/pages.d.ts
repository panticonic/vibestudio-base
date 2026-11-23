/**
 * Output that a tool result cut off, kept whole so the model can read the rest with read_page.
 * IDs are assigned in a fixed order per call and never reused, so a page always shows the same text.
 */
export declare class PageStore {
    private readonly pages;
    /** Characters a tool result shows and a page holds; the agent sets it from the call's context budget (shownCharsFor). */
    budget: number;
    /**
     * The text as it fits in a tool result (see cutoff.ts): whole if short, else its first page and a note naming
     * `holder`, which holds all of it, and the read_page call that shows the next page.
     */
    show(text: string, holder?: string, budget?: number): string;
    /** Keep a text in pages and return its ID. The first page is the head a cut-off shows (cutPoints). */
    add(text: string, budget?: number): {
        id: string;
        count: number;
    };
    has(id: string): boolean;
    read(id: string, page: number): string;
}
