import type {
  ConfigBrief, ConfigDisposition, ConfigEvidence, ConfigHistory, ConfigIdentity,
  ConfigDependencies, ConfigLens, ConfigOutcome, ConfigQuestion,
} from "./types.js";

declare module "natlang:services" {
  export const nativeWorkspaceConfig: {
    readBrief(): Promise<ConfigBrief>;
    inspectActive(questions: ConfigQuestion[]): Promise<ConfigIdentity | null>;
    inspectManifests(questions: ConfigQuestion[]): Promise<ConfigHistory | null>;
    inspectDependencies(mainEvent: string): Promise<ConfigDependencies | null>;
  };
  export const nativeConfigHandoff: {
    stage(brief: ConfigBrief, lens: ConfigLens, evidence: ConfigEvidence, outcome: ConfigOutcome): Promise<ConfigDisposition | null>;
  };
}
