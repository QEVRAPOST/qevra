export function resolveResearchRateLimit(
  role: "user" | "operator",
  bucket: string,
  requestedLimit: number,
): number {
  return role === "user" && bucket === "create-run"
    ? Math.min(requestedLimit, 1)
    : requestedLimit;
}
