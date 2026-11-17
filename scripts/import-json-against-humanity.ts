// Converts one pack from a JSON Against Humanity "cah-all-full.json" file
// to the internal deck format in data/decks/.
//
// Usage:
//   npm run import:jah -- <path/to/cah-all-full.json> "CAH Base Set" cah-base
//
// The source file is untrusted input. This script reads it as data only,
// keeps plain text, and rejects anything that does not look like a card.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Deck } from "../src/engine/deck";

const [input, packName, deckId] = process.argv.slice(2);
if (!input || !packName || !deckId || !/^[a-z0-9-]+$/.test(deckId)) {
  console.error('Usage: import:jah <cah-all-full.json> "<pack name>" <deck-id>');
  process.exit(1);
}

interface JahCard {
  text: string;
  pick?: number;
}
interface JahPack {
  name: string;
  official?: boolean;
  white: JahCard[];
  black: JahCard[];
}

const packs = JSON.parse(readFileSync(input, "utf8")) as JahPack[];
const pack = packs.find((p) => p.name === packName);
if (!pack) {
  console.error(`Pack not found: ${packName}`);
  process.exit(1);
}

const MAX_LEN = 200;
function clean(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length === 0 || t.length > MAX_LEN || /[<>]/.test(t)) return null;
  return t;
}

let skipped = 0;
const seenWhite = new Set<string>();
const white: Deck["white"] = [];
for (const card of pack.white) {
  const text = clean(card.text);
  if (!text || seenWhite.has(text.toLowerCase())) {
    skipped++;
    continue;
  }
  seenWhite.add(text.toLowerCase());
  white.push({ id: `${deckId}:w:${white.length}`, text });
}

const seenBlack = new Set<string>();
const black: Deck["black"] = [];
for (const card of pack.black) {
  const text = clean(card.text);
  const pick = card.pick ?? 1;
  if (!text || !Number.isInteger(pick) || pick < 1 || pick > 3 || seenBlack.has(text.toLowerCase())) {
    skipped++;
    continue;
  }
  seenBlack.add(text.toLowerCase());
  black.push({ id: `${deckId}:b:${black.length}`, text, pick });
}

const deck: Deck = {
  id: deckId,
  name: pack.name.replace(/^CAH /, "Classic "),
  description: pack.official
    ? "Cards from the official Cards Against Humanity base game. Adult humour."
    : "Community cards.",
  language: "en",
  category: pack.official ? "official" : "community",
  source: {
    name: "JSON Against Humanity",
    url: "https://github.com/crhallberg/json-against-humanity",
  },
  license: {
    name: "CC BY-NC-SA 2.0",
    url: "https://creativecommons.org/licenses/by-nc-sa/2.0/",
  },
  attribution:
    "Card text from Cards Against Humanity (CC BY-NC-SA 2.0), compiled by JSON Against Humanity (CC BY-NC-SA 4.0). Not affiliated with or endorsed by Cards Against Humanity LLC.",
  black,
  white,
};

const out = resolve("data/decks", `${deckId}.json`);
writeFileSync(out, JSON.stringify(deck, null, 1) + "\n");
console.log(`Wrote ${out}: ${black.length} black, ${white.length} white, ${skipped} skipped.`);
