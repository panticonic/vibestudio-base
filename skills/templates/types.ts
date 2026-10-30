/** What to do about a failed template inspection, fetch, or publication. */
export type TemplateRemedy =
  | "connect-credential"
  | "stop-integrity"
  | "retry-later"
  | "reinspect-authoring"
  | "fix-authoring-dependency"
  | "check-publication-outcome"
  | "unrecognized";

/** The kind of template an inspection describes, as the template registry names kinds. */
export type TemplateRole = "base" | "personal" | "system" | "development" | "catalog";

/** A dependency a template declares on another template. */
export type TemplateDependency = { url: string; track?: string; commit?: string };

/** The result of the templates extension's `inspect`. */
export type TemplateInspection = {
  /** The exact immutable source that was inspected. */
  pin: { url: string; ref: string; commit: string };
  /** The template's own name and one-sentence description; absent when it declares none. */
  presentation?: { name?: string; description?: string };
  /** The repository paths the template contains, such as "panels/chat" or "packages/feeds". */
  repositories: string[];
  /** The templates it is built on; empty for a template that stands alone. */
  dependencies: TemplateDependency[];
};

/** A template at a glance. */
export type TemplateSummary = {
  name: string;
  description: string | null;
  role: TemplateRole;
  /** The first 12 characters of the inspected commit. */
  commit: string;
  /** The URLs of the templates it depends on. */
  dependsOn: string[];
  /** How many repositories it holds under each top-level folder: { panels: 3, workers: 2 }. */
  parts: Record<string, number>;
};
