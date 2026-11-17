// Imports user-made decks from Many Decks (https://decks.rereadgames.com).
//
// The server fetches only from this one fixed host, so a host cannot make the
// server call other addresses. Imported decks live only in the room's memory.
// We never store or redistribute them.

import type { BlackCard, Deck, WhiteCard } from "../engine/deck";

export const MANY_DECKS_HOST = "https://decks.rereadgames.com";
export const PACK_BROWSER_URL = "https://certifriedmultitool.com/cah/packs";

const CODE = /^[0-9A-Z]{5}$/;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CARDS = 3000;
const TEXT_MAX = 200;
const TIMEOUT_MS = 8000;

export class DeckImportError extends Error {
  constructor(public readonly code: "DECK_NOT_FOUND" | "DECK_FETCH_FAILED" | "DECK_EMPTY" | "BAD_REQUEST") {
    super(code);
  }
}

export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

function clean(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length === 0 || t.length > TEXT_MAX || /[<>]/.test(t)) return null;
  return t;
}

/**
 * Converts the Many Decks JSON format to the internal deck format.
 * A Many Decks prompt is a list of lines. Each line is a list of parts:
 * a string is text, and an object is one blank.
 */
export function convertManyDeck(code: string, data: unknown): Deck {
  const d = (data ?? {}) as Record<string, unknown>;
  const name = typeof d.name === "string" ? clean(d.name) ?? `Deck ${code}` : `Deck ${code}`;
  const authorRaw = (d.author as { name?: unknown } | undefined)?.name;
  const author = typeof authorRaw === "string" ? clean(authorRaw) ?? "unknown" : "unknown";
  const language = typeof d.language === "string" && /^[A-Za-z-]{2,10}$/.test(d.language) ? d.language : "unknown";
  const id = `md-${code.toLowerCase()}`;

  const black: BlackCard[] = [];
  const seenBlack = new Set<string>();
  for (const call of Array.isArray(d.calls) ? d.calls.slice(0, MAX_CARDS) : []) {
    if (!Array.isArray(call)) continue;
    let text = "";
    let pick = 0;
    let valid = true;
    for (const line of call) {
      if (!Array.isArray(line)) {
        valid = false;
        break;
      }
      for (const part of line) {
        if (typeof part === "string") text += part.replace(/_/g, "");
        else if (part && typeof part === "object") {
          text += "_";
          pick += 1;
        } else valid = false;
      }
      text += " ";
    }
    const t = valid ? clean(text) : null;
    if (!t || pick < 1 || pick > 3 || seenBlack.has(t.toLowerCase())) continue;
    seenBlack.add(t.toLowerCase());
    black.push({ id: `${id}:b:${black.length}`, text: t, pick });
  }

  const white: WhiteCard[] = [];
  const seenWhite = new Set<string>();
  for (const response of Array.isArray(d.responses) ? d.responses.slice(0, MAX_CARDS) : []) {
    const t = typeof response === "string" ? clean(response) : null;
    if (!t || seenWhite.has(t.toLowerCase())) continue;
    seenWhite.add(t.toLowerCase());
    white.push({ id: `${id}:w:${white.length}`, text: t });
  }

  if (black.length === 0 && white.length === 0) throw new DeckImportError("DECK_EMPTY");

  return {
    id,
    name,
    description: `User-made deck by ${author}. Code ${code}.`,
    language,
    category: "community",
    source: { name: "Many Decks", url: `${MANY_DECKS_HOST}/decks/${code}` },
    license: { name: "Not stated", url: `${MANY_DECKS_HOST}/decks/${code}` },
    attribution: `Made by ${author} on Many Decks. Not moderated by Cards Against Decency.`,
    black,
    white,
  };
}

// A short cache, so several rooms that add the same deck cause one request.
const cache = new Map<string, { deck: Deck; until: number }>();
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

export async function fetchManyDeck(code: string, fetchImpl: typeof fetch = fetch): Promise<Deck> {
  const hit = cache.get(code);
  if (hit && hit.until > Date.now()) return hit.deck;

  let res: Response;
  try {
    res = await fetchImpl(`${MANY_DECKS_HOST}/api/decks/${code}`, {
      headers: { accept: "application/json", "user-agent": "CardsAgainstDecency/0.1" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new DeckImportError("DECK_FETCH_FAILED");
  }
  if (res.status === 404) throw new DeckImportError("DECK_NOT_FOUND");
  if (!res.ok) throw new DeckImportError("DECK_FETCH_FAILED");
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new DeckImportError("DECK_FETCH_FAILED");

  const body = await res.text();
  if (body.length > MAX_BYTES) throw new DeckImportError("DECK_FETCH_FAILED");
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new DeckImportError("DECK_FETCH_FAILED");
  }
  const deck = convertManyDeck(code, data);

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(code, { deck, until: Date.now() + CACHE_MS });
  return deck;
}
