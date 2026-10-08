import { normalizeTemplateGitUrl } from "@vibestudio/workspace/templateCoordinates";
import {
  parseTemplateManifestContent,
  type ParsedTemplateManifest,
} from "@vibestudio/workspace/templateManifest";

/** Dependency closure in the installed baseline, including authoring upstreams.
 * Incoming declarations are resolved separately by the ordinary composer. */
export function installedSourceDependencies(
  manifest: ParsedTemplateManifest,
  roots: readonly string[],
): Set<string> {
  const dependencies = new Map(
    (manifest.installation?.sources ?? []).map((source) => [
      normalizeTemplateGitUrl(source.pin.url),
      parseTemplateManifestContent(source.manifest, manifest.top.systemEpoch)
        .dependencies,
    ]),
  );
  const inherited = new Set<string>();
  const visit = (url: string) => {
    for (const dependency of dependencies.get(normalizeTemplateGitUrl(url)) ??
      []) {
      const key = normalizeTemplateGitUrl(dependency.url);
      if (inherited.has(key)) continue;
      inherited.add(key);
      visit(key);
    }
  };
  for (const root of roots) visit(root);
  return inherited;
}
