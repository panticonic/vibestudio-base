import {
  createExtensionRpcMethods,
  createReceiverRpcMethods,
} from "@vibestudio/shared/rpcMethods";

export interface TestRunRequest {
  target: string;
  suite: string;
  contextId?: string;
  fileFilter?: string;
  testName?: string;
  artifactKey: string;
  executionDigest: string;
}

export interface TestRunResult {
  status: "passed" | "failed" | "no-tests";
  runtime: "native";
  artifactKey: string;
  executionDigest: string;
  summary: string;
  passed: number;
  failed: number;
  total: number;
  contextId: string;
  target: string;
  pattern: string;
  details: Array<{
    file: string;
    status: "pass" | "fail" | "skip";
    duration?: number;
    errors?: string[];
  }>;
}

export interface NativeTestRunnerReceiver {
  runNative(request: TestRunRequest): Promise<TestRunResult>;
}

export const nativeTestRunnerReceiverMethods = createReceiverRpcMethods<NativeTestRunnerReceiver>([
  "runNative",
]);

export const testRunnerRpcMethods = createExtensionRpcMethods(
  "@workspace-extensions/test-runner",
  nativeTestRunnerReceiverMethods
);
