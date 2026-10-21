import { apiError } from "@/features/security/api";
import { readJsonBody, requireJsonContentType, sameOrigin } from "@/features/security/auth";
import { parseSwapQuoteRequest, getSwapQuoteUnavailable } from "@/features/swap/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return apiError(403, "origin_not_allowed", "Cross-origin quote requests are not allowed.");
  if (!requireJsonContentType(request)) return apiError(415, "json_required", "Send a JSON request body.");

  let raw: unknown;
  try {
    raw = await readJsonBody(request, 2_048);
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("request_body_") ? error.message : "invalid_json";
    return apiError(400, code, "The quote request body is invalid.");
  }

  const parsed = parseSwapQuoteRequest(raw);
  if (!parsed.success) return apiError(400, "invalid_quote_request", "The token pair or quote parameters are invalid.");

  return Response.json(getSwapQuoteUnavailable(parsed.data.networkId), {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}
