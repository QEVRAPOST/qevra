import { getAuthCapabilities } from "@/features/auth/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getAuthCapabilities(), { headers: { "cache-control": "no-store" } });
}
