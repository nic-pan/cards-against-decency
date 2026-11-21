import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Deck, DeckRegistry } from "../engine/deck";

const text = z.string().min(1).max(200).refine((t) => !/[<>]/.test(t), "plain text only");

const deckSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  description: z.string().max(500),
  language: z.string().min(2).max(10),
  category: z.enum(["official", "community"]),
  source: z.object({ name: z.string(), url: z.string() }),
  license: z.object({ name: z.string(), url: z.string() }),
  attribution: z.string().max(500),
  black: z.array(z.object({ id: z.string(), text, pick: z.number().int().min(1).max(3) })),
  white: z.array(z.object({ id: z.string(), text })),
});

/**
 * Loads and validates every deck file in a folder.
 * onlyPick keeps only the black cards with that pick number. It is for development: to test the Pick 2 and Pick 3 layout.
 */
export function loadDecks(dir: string, onlyPick?: number): DeckRegistry {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let decks: Deck[] = files.map((f) => deckSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
  if (onlyPick) {
    decks = decks.map((d) => ({ ...d, black: d.black.filter((b) => b.pick === onlyPick) })).filter((d) => d.black.length > 0);
  }
  return new DeckRegistry(decks);
}
