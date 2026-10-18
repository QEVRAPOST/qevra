import "server-only";

import { createHash } from "node:crypto";
import type { StoredSource } from "./model";
import type { ApprovedSourceDefinition } from "./topics";

const MAX_SOURCE_BYTES = 300_000;
const MAX_SOURCE_TEXT = 18_000;
const SOURCE_TIMEOUT_MS = 8_000;

class SourceFetchError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(code);
    this.name = "SourceFetchError";
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new SourceFetchError("source_too_large", response.status);
  }
  if (!response.body) throw new SourceFetchError("source_empty", response.status);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new SourceFetchError("source_too_large", response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function extractText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|iframe|template)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, value: string) => String.fromCodePoint(Number(value)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SOURCE_TEXT);
}

function unavailableSource(source: ApprovedSourceDefinition, error: unknown): StoredSource {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    retrievedAt: new Date().toISOString(),
    status: "unavailable",
    errorCode: error instanceof SourceFetchError ? error.code : "source_fetch_failed",
    ...(error instanceof SourceFetchError && error.status ? { httpStatus: error.status } : {}),
  };
}

export async function fetchApprovedSource(source: ApprovedSourceDefinition): Promise<StoredSource> {
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.hostname !== source.allowedHost || url.username || url.password) {
      throw new SourceFetchError("source_not_allowlisted");
    }

    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: { accept: "text/html,application/xhtml+xml,text/plain" },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) throw new SourceFetchError("source_http_error", response.status);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!/(text\/html|application\/xhtml\+xml|text\/plain)/.test(contentType)) {
      throw new SourceFetchError("source_unsupported_content_type", response.status);
    }

    const bytes = await readBoundedBody(response);
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const text = contentType.includes("html") || contentType.includes("xhtml") ? extractText(raw) : raw.replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_TEXT);
    if (text.length < 100) throw new SourceFetchError("source_content_unavailable", response.status);

    return {
      id: source.id,
      title: source.title,
      url: source.url,
      retrievedAt: new Date().toISOString(),
      status: "available",
      httpStatus: response.status,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      text,
      excerpt: text.slice(0, 1_200),
    };
  } catch (error) {
    return unavailableSource(source, error);
  }
}

export async function fetchApprovedSources(sources: ApprovedSourceDefinition[]): Promise<StoredSource[]> {
  return Promise.all(sources.map(fetchApprovedSource));
}
