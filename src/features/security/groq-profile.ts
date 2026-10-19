export const GROQ_GPT_OSS_MODEL = "openai/gpt-oss-20b";

export function isGroqGptOssProfile(model: string | undefined, baseUrl: string | undefined): boolean {
  if (model?.trim() !== GROQ_GPT_OSS_MODEL || !baseUrl?.trim()) return false;
  try {
    const url = new URL(baseUrl.trim());
    return url.protocol === "https:"
      && url.origin === "https://api.groq.com"
      && url.pathname.replace(/\/+$/, "") === "/openai/v1"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function resolveMaxConcurrentRuns(env: NodeJS.ProcessEnv = process.env): number {
  if (isGroqGptOssProfile(env.QEVRA_AI_MODEL, env.QEVRA_AI_BASE_URL)) return 1;
  const configured = env.QEVRA_MAX_CONCURRENT_RUNS?.trim();
  if (!configured) return 2;
  if (!/^\d+$/.test(configured)) return 2;
  const parsed = Number(configured);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 2;
}
