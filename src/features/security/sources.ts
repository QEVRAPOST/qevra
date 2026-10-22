import "server-only";

import { createHash } from "node:crypto";
import type { StoredSource } from "./model";
import type { ApprovedSourceDefinition } from "./topics";

const MAX_SOURCE_BYTES = 300_000;
const MAX_SOURCE_TEXT = 18_000;
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_SOURCE_REDIRECTS = 3;
const MAX_SOURCE_FETCH_ATTEMPTS = 2;

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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, digits: string) => {
      const codePoint = Number(digits);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : " ";
    })
    .replace(/&#x([\da-f]+);/gi, (_match, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : " ";
    });
}

function normalizeTextLines(value: string): string {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_SOURCE_TEXT);
}

function extractText(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(withoutComments)?.[1];
  const articles = [...withoutComments.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)].map((match) => match[1] ?? "");
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(withoutComments)?.[1] ?? withoutComments;
  const content = main ?? (articles.length ? articles.join("\n") : body);

  const textWithBoundaries = content
    .replace(/<(script|style|noscript|svg|iframe|template|nav|header|footer|aside|form|dialog)[^>]*>[\s\S]*?<\/\1\s*>/gi, "\n")
    .replace(/<([a-z][\w:-]*)\b(?=[^>]*\brole\s*=\s*["'](?:navigation|complementary|banner|contentinfo)["'])[^>]*>[\s\S]*?<\/\1\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|pre|ul|ol|table)\s*>/gi, "\n")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return normalizeTextLines(decodeHtmlEntities(textWithBoundaries));
}

const EXCERPT_STOP_WORDS = new Set([
  "about", "after", "against", "also", "and", "any", "application", "are", "before", "between", "can", "could",
  "does", "from", "how", "into", "must", "only", "should", "that", "the", "their", "them", "then", "there",
  "these", "this", "through", "what", "when", "where", "which", "while", "with", "without", "would",
]);

function excerptTerms(context: string): Set<string> {
  const terms = new Set<string>();
  for (const term of context.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []) {
    if (term.length >= 3 && !EXCERPT_STOP_WORDS.has(term)) terms.add(term);
    for (const part of term.split("-")) {
      if (part.length >= 3 && !EXCERPT_STOP_WORDS.has(part)) terms.add(part);
    }
  }
  return terms;
}

function excerptPhrases(context: string): Set<string> {
  const words = context.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const identifiers = new Set((context.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []).map((word) => word.toLowerCase()));
  const phrases = new Set<string>();
  for (let index = 0; index < words.length - 1; index += 1) {
    const left = words[index]!;
    const right = words[index + 1]!;
    const leftIsUseful = (left.length >= 3 || left === "id") && !EXCERPT_STOP_WORDS.has(left);
    const rightIsUseful = (right.length >= 3 || right === "id") && !EXCERPT_STOP_WORDS.has(right);
    const containsIdentifier = identifiers.has(left) || identifiers.has(right);
    if (leftIsUseful && rightIsUseful && containsIdentifier) phrases.add(`${left} ${right}`);
  }
  return phrases;
}

function splitLongPassage(passage: string, maxChars: number): string[] {
  if (passage.length <= maxChars) return [passage];
  const sentences = passage.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) return sentences.flatMap((sentence) => splitLongPassage(sentence, maxChars));
  const chunks: string[] = [];
  let remaining = passage;
  while (remaining.length > maxChars) {
    let boundary = remaining.lastIndexOf(" ", maxChars);
    if (boundary < Math.floor(maxChars / 2)) boundary = maxChars;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Pick source-verbatim passages relevant to the topic while keeping the configured per-source
 * character budget. Quotes from this excerpt are still checked against the full stored source.
 */
export function selectSourceExcerpt(text: string, context: string, maxChars: number): string {
  if (!Number.isInteger(maxChars) || maxChars < 1) return "";
  if (text.length <= maxChars) return text;
  const terms = excerptTerms(context);
  const phrases = excerptPhrases(context);
  const passages = text.split(/\n+/).flatMap((passage) => splitLongPassage(passage.trim(), maxChars)).filter(Boolean);
  if (passages.length === 0) return "";

  const scored = passages.map((passage, index) => {
    const normalizedWords = passage.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const words = new Set(normalizedWords);
    const normalizedPassage = ` ${normalizedWords.join(" ")} `;
    let score = 0;
    for (const term of terms) if (words.has(term)) score += 1;
    for (const phrase of phrases) if (normalizedPassage.includes(` ${phrase} `)) score += 8;
    return { passage, index, score };
  });
  const relevant = scored.some((entry) => entry.score > 0);
  const ranked = relevant
    ? [...scored].filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score || left.index - right.index)
    : scored;
  const selected = new Map<number, string>();
  let length = 0;
  for (const entry of ranked) {
    const separatorLength = selected.size > 0 ? 1 : 0;
    const remaining = maxChars - length - separatorLength;
    if (remaining <= 0) break;
    let passage = entry.passage;
    if (passage.length > remaining) {
      const boundary = passage.lastIndexOf(" ", remaining);
      passage = passage.slice(0, boundary > 0 ? boundary : remaining).trimEnd();
    }
    if (!passage) continue;
    selected.set(entry.index, passage);
    length += passage.length + separatorLength;
    if (passage.length < entry.passage.length) break;
  }
  return scored.filter((entry) => selected.has(entry.index)).map((entry) => selected.get(entry.index)!).join("\n");
}

function isAllowedSourceUrl(url: URL, allowedHost: string): boolean {
  return url.protocol === "https:"
    && url.hostname.toLowerCase() === allowedHost.toLowerCase()
    && !url.username
    && !url.password
    && !url.port;
}

async function fetchSourceResponse(initialUrl: URL, allowedHost: string): Promise<Response> {
  let url = initialUrl;
  const signal = AbortSignal.timeout(SOURCE_TIMEOUT_MS);
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { accept: "text/html,application/xhtml+xml,text/plain" },
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location) throw new SourceFetchError("source_redirect_invalid", response.status);
    if (redirects >= MAX_SOURCE_REDIRECTS) throw new SourceFetchError("source_redirect_limit", response.status);
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, url);
    } catch {
      throw new SourceFetchError("source_redirect_invalid", response.status);
    }
    if (!isAllowedSourceUrl(nextUrl, allowedHost)) throw new SourceFetchError("source_redirect_not_allowlisted", response.status);
    url = nextUrl;
  }
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
    if (!isAllowedSourceUrl(url, source.allowedHost)) {
      throw new SourceFetchError("source_not_allowlisted");
    }

    for (let attempt = 1; attempt <= MAX_SOURCE_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchSourceResponse(url, source.allowedHost);
        if (!response.ok) {
          const retryableStatus = response.status === 429 || response.status >= 500;
          await response.body?.cancel().catch(() => undefined);
          if (retryableStatus && attempt < MAX_SOURCE_FETCH_ATTEMPTS) continue;
          throw new SourceFetchError("source_http_error", response.status);
        }
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (!/(text\/html|application\/xhtml\+xml|text\/plain)/.test(contentType)) {
          throw new SourceFetchError("source_unsupported_content_type", response.status);
        }

        const bytes = await readBoundedBody(response);
        const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        const text = contentType.includes("html") || contentType.includes("xhtml")
          ? extractText(raw)
          : normalizeTextLines(raw);
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
        const retryable = !(error instanceof SourceFetchError)
          || error.code === "source_http_error" && (error.status === 429 || (error.status !== undefined && error.status >= 500));
        if (retryable && attempt < MAX_SOURCE_FETCH_ATTEMPTS) continue;
        throw error;
      }
    }
    throw new SourceFetchError("source_fetch_failed");
  } catch (error) {
    return unavailableSource(source, error);
  }
}

export async function fetchApprovedSources(sources: ApprovedSourceDefinition[]): Promise<StoredSource[]> {
  return Promise.all(sources.map(fetchApprovedSource));
}
