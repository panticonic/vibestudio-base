import type {
  PublishBlocker,
  PublishEnvironment,
  PublishPreflightReport,
  PublishPreflightRequest,
  PublishVisual,
  PublicationObservation,
} from "../publish-preflight/types.js";

type Status = PublishPreflightReport["status"];
export type PublishWorld = {
  id: string;
  group: string;
  goal: string;
  audience: string;
  action: PublishPreflightRequest["action"];
  phase?: PublicationObservation["phase"];
  gap?:
    | "source"
    | "manifest"
    | "extra"
    | "html"
    | "panel"
    | "presentation"
    | "destination"
    | "receipt"
    | "target"
    | "operation"
    | "artifact"
    | "unverified"
    | "provider"
    | "public-url";
  provider?: string;
  environment?: PublishEnvironment;
  site: string;
  requiredLabel: string;
  expected: {
    status: Status;
    blockers: PublishBlocker[];
    visual: PublishVisual;
  };
};

export const publicationWorlds: PublishWorld[] = [
  {
    id: "publish-preflight-transit-map",
    group: "presentation",
    site: "rail-information",
    audience: "Riders transferring at the central station",
    requiredLabel: "Accessible transfer route",
    goal: "Make a review checklist for the static transfer map and its preview destination.",
    action: "prepare",
    expected: { status: "ready-for-review", blockers: [], visual: "Checklist" },
  },
  {
    id: "publish-preflight-expense-compare",
    group: "presentation",
    site: "quarterly-expenses",
    audience: "Finance committee",
    requiredLabel: "Revenue and expenses in USD",
    goal: "Compare preview against production for the public quarterly chart review.",
    action: "prepare",
    expected: { status: "ready-for-review", blockers: [], visual: "Compare" },
  },
  {
    id: "publish-preflight-only-reviewed-revision",
    group: "artifact-identity",
    site: "timetable",
    audience: "Weekend visitors",
    requiredLabel: "Last return shuttle",
    goal: "Is the updated service timetable ready for reviewer handoff?",
    action: "prepare",
    gap: "source",
    expected: {
      status: "blocked",
      blockers: ["source-reference"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-foreign-public-file",
    group: "artifact-identity",
    site: "event-landing",
    audience: "Attendees",
    requiredLabel: "Free registration",
    goal: "Give me a checklist before we hand over the event site, including the public file list.",
    action: "prepare",
    gap: "extra",
    expected: {
      status: "blocked",
      blockers: ["public-paths"],
      visual: "Checklist",
    },
  },
  {
    id: "publish-preflight-incomplete-manifest",
    group: "artifact-identity",
    site: "cohort-gallery",
    audience: "Portfolio reviewers",
    requiredLabel: "Sample project gallery",
    goal: "Tell me if we can hand over the versioned gallery package.",
    action: "prepare",
    gap: "manifest",
    expected: {
      status: "blocked",
      blockers: ["public-manifest"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-missing-shell",
    group: "artifact-identity",
    site: "garden-feedback",
    audience: "Garden members",
    requiredLabel: "Choose a workshop",
    goal: "Is the feedback widget package ready to be reviewed as a static site?",
    action: "prepare",
    gap: "html",
    expected: {
      status: "blocked",
      blockers: ["public-manifest", "html-entry"],
      visual: "Checklist",
    },
  },
  {
    id: "publish-preflight-capture-before-rebuild",
    group: "presentation",
    site: "kit-builder",
    audience: "Lab demonstrators",
    requiredLabel: "Balancing the components",
    goal: "Can reviewers rely on the rendered walkthrough after the rebuild?",
    action: "prepare",
    gap: "panel",
    expected: { status: "blocked", blockers: ["stale-panel"], visual: "Prose" },
  },
  {
    id: "publish-preflight-missing-chart-label",
    group: "presentation",
    site: "energy-dashboard",
    audience: "Residents comparing bills",
    requiredLabel: "Monthly consumption in kWh",
    goal: "Tell me whether the observed comparison chart explains its units to a newcomer.",
    action: "prepare",
    gap: "presentation",
    expected: {
      status: "blocked",
      blockers: ["missing-presentation"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-unreviewed-destination",
    group: "scope",
    site: "education",
    audience: "Learners",
    requiredLabel: "Module progress",
    goal: "Check whether the intended LMS website can be handed over for the requested destination.",
    action: "prepare",
    gap: "destination",
    expected: {
      status: "blocked",
      blockers: ["different-request"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-operation-absent",
    group: "journal",
    site: "annual-review",
    audience: "Committee observers",
    requiredLabel: "Review minutes",
    goal: "Show the publication progress by phase for the annual review site.",
    action: "check-existing",
    gap: "receipt",
    expected: {
      status: "blocked",
      blockers: ["missing-publication"],
      visual: "Timeline",
    },
  },
  {
    id: "publish-preflight-staged-to-different-team",
    group: "scope",
    site: "open-research",
    audience: "Research community",
    requiredLabel: "Dataset definitions",
    goal: "Check the existing provider operation for our public research dashboard.",
    action: "check-existing",
    phase: "uploaded",
    gap: "target",
    expected: {
      status: "blocked",
      blockers: ["different-publication"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-resume-uploaded",
    group: "journal",
    site: "bike-route",
    audience: "Volunteer route leads",
    requiredLabel: "Road works detour",
    goal: "Give me a publication progress timeline based on the existing upload.",
    action: "check-existing",
    phase: "uploaded",
    expected: {
      status: "waiting",
      blockers: ["awaiting-provider"],
      visual: "Timeline",
    },
  },
  {
    id: "publish-preflight-submitted-url-warming",
    group: "journal",
    site: "community-room",
    audience: "Visit coordinators",
    requiredLabel: "Reserve the community room",
    goal: "Tell me whether the manager can share the submitted booking guide yet.",
    action: "check-existing",
    phase: "submitted",
    gap: "provider",
    expected: {
      status: "waiting",
      blockers: ["awaiting-provider"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-ready-pending-digest",
    group: "journal",
    site: "registration-help",
    audience: "Seasonal registrants",
    requiredLabel: "Find your registration period",
    goal: "Can I share the registration guide after seeing the ready page?",
    action: "check-existing",
    phase: "submitted",
    gap: "unverified",
    expected: {
      status: "waiting",
      blockers: ["verify-public"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-reconciled-production",
    group: "journal",
    site: "visitor-access",
    audience: "Museum visitors",
    requiredLabel: "Wheelchair-accessible entrance",
    goal: "Report the publication progress by phase and whether the verified production artifact matches.",
    action: "check-existing",
    phase: "submitted",
    provider: "cloudflare-pages",
    environment: "production",
    expected: { status: "verified", blockers: [], visual: "Timeline" },
  },
  {
    id: "publish-preflight-mismatched-operation",
    group: "scope",
    site: "resource-training",
    audience: "New staff",
    requiredLabel: "Find orientation materials",
    goal: "Check whether an earlier handoff used the operation we reviewed.",
    action: "check-existing",
    phase: "submitted",
    gap: "operation",
    expected: {
      status: "blocked",
      blockers: ["different-publication"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-other-artifact-live",
    group: "journal",
    site: "reporting-faq",
    audience: "Clinic coordinators",
    requiredLabel: "Reporting procedure and follow-up",
    goal: "Is the website operation serving the reviewed reporting FAQ?",
    action: "check-existing",
    phase: "submitted",
    gap: "artifact",
    expected: {
      status: "blocked",
      blockers: ["different-publication"],
      visual: "Prose",
    },
  },
  {
    id: "publish-preflight-unrelated-url-readback",
    group: "journal",
    site: "decision-brief",
    audience: "Assembly delegates",
    requiredLabel: "Cost and project duration",
    goal: "Does the ready web address establish publication for the running brief?",
    action: "check-existing",
    phase: "submitted",
    gap: "public-url",
    expected: {
      status: "waiting",
      blockers: ["awaiting-provider"],
      visual: "Prose",
    },
  },
];

export function publicationRequest(
  world: PublishWorld,
): PublishPreflightRequest {
  return {
    goal: world.goal,
    audience: world.audience,
    action: world.action,
    intendedDestination: {
      provider: world.provider ?? "vercel",
      destination: world.gap === "destination" ? "different-team" : world.site,
      environment: world.environment ?? "preview",
    },
  };
}

export function verifyPublicationOutcome(
  world: PublishWorld,
  observed: PublishPreflightReport,
): boolean {
  const expected = world.expected;
  return (
    observed.status === expected.status &&
    observed.visual === expected.visual &&
    observed.blockers.length === expected.blockers.length &&
    expected.blockers.every((blocker) => observed.blockers.includes(blocker)) &&
    observed.evidence.some((item) => item.trim().length > 0)
  );
}
