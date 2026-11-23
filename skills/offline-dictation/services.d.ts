declare module "natlang:services" {
  export const dictationCaptureRead: {
    inspect(operationId: string): Promise<import("./types.js").DictationCapture>;
  };
  export const dictationTranscription: {
    run(operationId: string): Promise<import("./types.js").DictationTranscript>;
  };
}
