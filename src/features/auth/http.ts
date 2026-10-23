import { NextResponse } from "next/server";

export function safeAuthErrorRedirect(origin: string, code: string): NextResponse {
  const target = new URL("/app/security", origin);
  target.searchParams.set("auth_error", code);
  return NextResponse.redirect(target, { headers: { "cache-control": "no-store" } });
}
