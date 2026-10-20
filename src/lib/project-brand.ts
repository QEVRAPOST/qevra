export const DEFAULT_PROJECT_NAME = "VEYRA";
const SOURCE_PROJECT_NAME = "QEVRA";

function cleanProjectName(value: string | undefined): string {
  return value
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 80) || DEFAULT_PROJECT_NAME;
}

export function resolveProjectName(value: string | undefined): string {
  return cleanProjectName(value);
}

/** Direct property access lets Next.js inline the public value into client bundles at build/dev startup. */
export const PROJECT_NAME = resolveProjectName(process.env.NEXT_PUBLIC_PROJECT_NAME);

export function getProjectName(env: NodeJS.ProcessEnv = process.env): string {
  return resolveProjectName(env.NEXT_PUBLIC_PROJECT_NAME);
}

export function brandizeProjectName(text: string, projectName = PROJECT_NAME): string {
  return projectName === SOURCE_PROJECT_NAME ? text : text.replaceAll(SOURCE_PROJECT_NAME, projectName);
}

/** Brandize presentation fixtures only; object keys and non-plain data are left untouched. */
export function brandizeDisplayStrings<T>(value: T, projectName = PROJECT_NAME): T {
  if (typeof value === "string") return brandizeProjectName(value, projectName) as T;
  if (Array.isArray(value)) return value.map((entry) => brandizeDisplayStrings(entry, projectName)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, brandizeDisplayStrings(entry, projectName)]),
    ) as T;
  }
  return value;
}
