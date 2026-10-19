const DEFAULT_PROJECT_NAME = "QEVRA";

export function getProjectName(env: NodeJS.ProcessEnv = process.env): string {
  const configuredName = env.NEXT_PUBLIC_PROJECT_NAME
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 80);
  return configuredName || DEFAULT_PROJECT_NAME;
}
