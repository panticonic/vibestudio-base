import { declaredServiceNames, declaredServiceScopes } from "./services.js";
import { NatlangProgramError } from "./programError.js";
import type { WorkspaceFs } from "./programs.js";

type Files = Record<string, string>;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const skillPath = /^skills(?:\/[A-Za-z0-9_-]+)+$/u;

/** Selected installed skill packages mounted under a named callable namespace. */
export async function linkWorkspaceModules(
  fs: WorkspaceFs,
  directory: string,
  local: Files,
  readProjectFiles: (fs: WorkspaceFs, directory: string) => Promise<Files>,
): Promise<Files> {
  const declaration = JSON.parse(
    local["natlang.json"] ?? "{}",
  )?.workspaceModules;
  if (declaration === undefined) return local;
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
      !mount.includes("/") ||
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

  const readDirectory = new Map<string, ReturnType<WorkspaceFs["readdir"]>>();
  async function installed(source: string) {
    let parent = "skills";
    for (const part of source.split("/").slice(1)) {
      let contents = readDirectory.get(parent);
      if (!contents) {
        contents = fs.readdir(parent, { withFileTypes: true });
        readDirectory.set(parent, contents);
      }
      if (
        !(await contents).some(
          (item) => item.name === part && item.isDirectory(),
        )
      )
        return false;
      parent += `/${part}`;
    }
    return true;
  }
  const modules = await Promise.all(
    entries.map(async ([mount, source]) => {
      if (typeof source !== "string" || !(await installed(source))) return null;
      const sourceFiles = await readProjectFiles(fs, source);
      const config = JSON.parse(sourceFiles["natlang.json"] ?? "{}");
      if (config?.workspaceModules !== undefined)
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
    }),
  );
  const linked = { ...local };
  const localNames = declaredServiceNames(local);
  const serviceScopes = declaredServiceScopes(local, localNames, directory);
  for (const entry of modules) {
    if (!entry) continue;
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
    ...JSON.parse(local["natlang.json"] ?? "{}"),
    serviceScopes,
  });
  return linked;
}
