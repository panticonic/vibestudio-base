import { declaredServiceNames, declaredServiceScopes } from "./services.js";
import { NatlangProgramError } from "./programError.js";

type Files = Record<string, string>;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const skillPath = /^skills(?:\/[A-Za-z0-9_-]+)+$/u;

/** Selected installed skill packages mounted under a named callable namespace. */
export async function linkWorkspaceModules(
  directory: string,
  local: Files,
  readInstalledRoots: (roots: readonly string[]) => Promise<Map<string, Files>>,
): Promise<Files> {
  const configuration = JSON.parse(local["natlang.json"] ?? "{}");
  const declaration = configuration?.workspaceModules;
  const branchConfiguration: unknown = configuration?.workspaceBranches;
  if (declaration === undefined && branchConfiguration === undefined) return local;
  const reject = (message: string): never => {
    throw new NatlangProgramError(
      `Invalid workspaceModules for ${directory}: ${message}`,
      directory,
      "does-not-compile",
    );
  };
  if (
    !declaration ||
    typeof declaration !== "object" ||
    Array.isArray(declaration)
  )
    reject("map callable namespace paths to installed skill directories.");
  const entries = Object.entries(declaration);
  for (const [mount, source] of entries) {
    if (
      !mount.split("/").every((part) => identifier.test(part)) ||
      typeof source !== "string" ||
      !skillPath.test(source) ||
      source === directory ||
      source.startsWith(`${directory}/`) ||
      directory.startsWith(`${source}/`)
    )
      reject(
        `Invalid callable mount ${mount} or skill directory ${String(source)}.`,
      );
    if (
      Object.keys(local).some(
        (path) =>
          path.startsWith(`${mount}/`) ||
          path === `${mount}.nl` ||
          path === `${mount}.ts`,
      ) ||
      entries.some(
        ([other]) => other !== mount && mount.startsWith(`${other}/`),
      )
    )
      reject(`The callable mount ${mount} overlaps another item.`);
  }

  type Branch = { mounts: string[]; types?: string[] };
  const branches = new Map<string, Branch>();
  if (branchConfiguration !== undefined) {
    if (!branchConfiguration || typeof branchConfiguration !== "object" || Array.isArray(branchConfiguration))
      reject("workspaceBranches must map local callable paths to mounts and optional portable type names.");
    for (const [path, entry] of Object.entries(branchConfiguration!)) {
      if (!path.split("/").every(part => identifier.test(part)) ||
          !Object.hasOwn(local, `${path}.nl`) || !entry || typeof entry !== "object" || Array.isArray(entry))
        reject(`Invalid local callable branch ${path}.`);
      const { mounts, types } = entry as Branch;
      if (!Array.isArray(mounts) || !mounts.length ||
          mounts.some(mount => typeof mount !== "string" || !mount.startsWith(`${path}/`) || !Object.hasOwn(declaration, mount)))
        reject(`List declared mounts under the workspace branch ${path}.`);
      if (types !== undefined && (!Array.isArray(types) || !types.length ||
          types.some(name => typeof name !== "string" || !identifier.test(name)) || !Object.hasOwn(local, `${path}/types.ts`)))
        reject(`List exported type names in ${path}/types.ts.`);
      branches.set(path, { mounts, types });
    }
    for (const path of branches.keys()) if ([...branches.keys()].some(other => other !== path && path.startsWith(`${other}/`)))
      reject(`Workspace branch ${path} overlaps another branch.`);
  }

  const mounts = entries.map(([mount, source]) => ({ mount, source: source as string }));
  const projects = await readInstalledRoots([...new Set(mounts.map(({ source }) => source))]);
  const installedModules = mounts.filter(({ source }) => projects.has(source));
  const modules = installedModules.map(({ mount, source }) => {
    const sourceFiles = projects.get(source)!;
    const config = JSON.parse(sourceFiles["natlang.json"] ?? "{}");
    if (config?.workspaceModules !== undefined || config?.workspaceBranches !== undefined)
      reject(`Mount ${source} as a self-contained package.`);
    const include: unknown = config?.include;
    if (
      include !== undefined &&
      (!Array.isArray(include) ||
        include.some(
          (path) =>
            typeof path !== "string" ||
            !path
              .split("/")
              .every((part: string) =>
                /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u.test(part),
              ),
        ))
    )
      reject(
        `Use explicit package-relative file and directory names in ${source}/natlang.json include.`,
      );
    const files = Array.isArray(include)
      ? Object.fromEntries(
          Object.entries(sourceFiles).filter(
            ([path]) =>
              path === "natlang.json" ||
              include.some(
                (prefix) => path === prefix || path.startsWith(`${prefix}/`),
              ),
          ),
        )
      : sourceFiles;
    const names = declaredServiceNames(files);
    const scopes = declaredServiceScopes(files, names, source);
    for (const name of names)
      if (!Object.hasOwn(scopes, name))
        reject(
          `Scope service ${name} in ${source}/natlang.json before mounting it.`,
        );
    return { mount, files, scopes };
  });
  const present = new Set(modules.map(({ mount }) => mount));
  const unavailable = [...branches].filter(([, branch]) => branch.mounts.some(mount => !present.has(mount)))
    .map(([path]) => path);
  const visible = (path: string) => !unavailable.some(branch => path === `${branch}.nl` || path.startsWith(`${branch}/`));
  const linked = Object.fromEntries(Object.entries(local).filter(([path]) => visible(path)));
  for (const [path, branch] of branches) {
    if (!branch.types?.length || !visible(`${path}.nl`)) continue;
    const slash = path.lastIndexOf("/");
    const typesPath = slash < 0 ? "types.ts" : `${path.slice(0, slash)}/types.ts`;
    linked[typesPath] = `${linked[typesPath] ?? ""}
export type { ${branch.types.join(", ")} } from "./${path.slice(slash + 1)}/types.js";
`;
  }
  const localNames = declaredServiceNames(local);
  const serviceScopes = declaredServiceScopes(local, localNames, directory);
  for (const name of Object.keys(serviceScopes)) serviceScopes[name] = serviceScopes[name]!.filter(visible);
  for (const entry of modules) {
    if (!visible(`${entry.mount}/`)) continue;
    for (const [path, text] of Object.entries(entry.files))
      linked[`${entry.mount}/${path}`] = text;
    for (const [name, selectors] of Object.entries(entry.scopes)) {
      if (localNames.includes(name) && !Object.hasOwn(serviceScopes, name))
        reject(
          `Scope shared service ${name} in the main program before mounting it.`,
        );
      serviceScopes[name] = [
        ...(serviceScopes[name] ?? []),
        ...selectors.map((selector) => `${entry.mount}/${selector}`),
      ];
    }
  }
  linked["natlang.json"] = JSON.stringify({
    ...configuration,
    serviceScopes,
  });
  return linked;
}
