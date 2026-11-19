import type { DictationCapture, DictationTranscript } from "./types.js";

declare module "natlang:services" {
  export const dictationCaptureRead: {
    inspect(operationId: string): Promise<DictationCapture>;
  };
  export const dictationTranscription: {
    run(operationId: string): Promise<DictationTranscript>;
  };
}
