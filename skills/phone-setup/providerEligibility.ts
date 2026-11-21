import type {
  PhonePlatform,
  PhoneProvider,
} from "@vibestudio/service-schemas/phoneProvisioning";

type ProviderSelection = {
  platform: PhonePlatform;
  providerId?: string;
  mode?: "auto" | "release" | "source";
};

/** Narrow a public phone provider inventory to the exact assigned target. */
export function eligiblePhoneDesktops(
  providers: readonly PhoneProvider[],
  target: ProviderSelection,
) {
  const { platform } = target;
  return providers
    .filter((desktop) => desktop.platforms.includes(platform))
    .filter(
      (desktop) =>
        target.mode !== "source" || desktop.sourcePlatforms.includes(platform),
    )
    .filter(
      (desktop) =>
        !target.providerId || desktop.providerId === target.providerId,
    )
    .map(({ providerId, label, sourcePlatforms }) => ({
      providerId,
      label,
      supportsSource: sourcePlatforms.includes(platform),
    }));
}
