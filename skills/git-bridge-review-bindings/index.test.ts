import { beforeEach, expect, it, vi } from "vitest";
import { bindGitBridgeReview } from "./index.js";

const { status, resolveRepository, upstreamStatus } = vi.hoisted(() => ({
  status: vi.fn(),
  resolveRepository: vi.fn(),
  upstreamStatus: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({
  contextId: "fixture-context",
  vcs: { status, resolveRepository },
  git: { upstreamStatus },
}));

const repository = "projects/review";
const currentMain = { kind: "event", eventId: "workspace-event:main" };
const semantic = {
  contextId: "fixture-context",
  workingHead: currentMain,
  clean: true,
  mainEventId: currentMain.eventId,
  mainRelation: "at",
};

beforeEach(() => {
  vi.resetAllMocks();
  status.mockResolvedValue(semantic);
  resolveRepository.mockResolvedValue({ repositoryId: "repository:review" });
});

it("keeps a pending import but drops historical remote observations", async () => {
  const candidate = {
    contextId: "other-context",
    eventId: "workspace-event:candidate",
  };
  upstreamStatus.mockResolvedValue([
    {
      repoPath: repository,
      state: "fetch-failed",
      candidate,
      autoPush: false,
      aheadBy: 1,
      behindBy: 2,
      lastSuccessfulObservationAt: 123,
    },
  ]);
  const { request, services } = bindGitBridgeReview({
    goal: "Review export",
    repository,
    direction: "export",
  });
  await expect(
    services.gitBridgeReviewRead.observe("another-operation"),
  ).rejects.toThrow("assigned");
  expect(status).not.toHaveBeenCalled();
  await expect(
    services.gitBridgeReviewRead.observe(request.operationId),
  ).resolves.toMatchObject({
    semantic: {
      current: true,
      mainEventId: currentMain.eventId,
      mainRepositoryId: "repository:review",
    },
    upstream: { state: "fetch-failed", candidate, observation: null },
  });
  expect(upstreamStatus).toHaveBeenCalledExactlyOnceWith([repository]);
  expect(resolveRepository).toHaveBeenCalledExactlyOnceWith({
    state: currentMain,
    repoPath: repository,
  });
});

it("marks the read stale when protected main moves", async () => {
  status
    .mockResolvedValueOnce(semantic)
    .mockResolvedValueOnce({ ...semantic, mainEventId: "workspace-event:new" });
  upstreamStatus.mockResolvedValue([
    {
      repoPath: repository,
      state: "behind",
      autoPush: false,
      observedAt: 123,
      remoteBranchExists: true,
      relationship: "behind",
      aheadBy: 0,
      behindBy: 2,
    },
  ]);
  const { request, services } = bindGitBridgeReview({
    goal: "Review import",
    repository,
    direction: "import",
  });
  await expect(
    services.gitBridgeReviewRead.observe(request.operationId),
  ).resolves.toMatchObject({
    semantic: { current: false, mainEventId: currentMain.eventId },
    upstream: { observation: { at: 123, relationship: "behind", behind: 2 } },
  });
});
