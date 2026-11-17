// Standard internal deck format. Every import source converts to this shape,
// so the game engine never depends on where a deck came from.

export interface BlackCard {
  id: string;
  /** Prompt text. Each "_" is one blank. A prompt with no "_" takes its answer at the end. */
  text: string;
  /** Number of white cards a player must submit (1–3). */
  pick: number;
}

export interface WhiteCard {
  id: string;
  text: string;
}

export interface DeckLicense {
  name: string;
  url: string;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  language: string;
  category: "official" | "community";
  /** Where the card text came from. */
  source: { name: string; url: string };
  license: DeckLicense;
  /** Credit line to show next to the deck. */
  attribution: string;
  black: BlackCard[];
  white: WhiteCard[];
}

export interface DeckSummary {
  id: string;
  name: string;
  description: string;
  language: string;
  category: Deck["category"];
  attribution: string;
  license: DeckLicense;
  blackCount: number;
  whiteCount: number;
}

export function summarize(deck: Deck): DeckSummary {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    language: deck.language,
    category: deck.category,
    attribution: deck.attribution,
    license: deck.license,
    blackCount: deck.black.length,
    whiteCount: deck.white.length,
  };
}

export class DeckRegistry {
  private readonly decks = new Map<string, Deck>();

  constructor(decks: Deck[]) {
    for (const deck of decks) {
      if (this.decks.has(deck.id)) throw new Error(`Duplicate deck id: ${deck.id}`);
      this.decks.set(deck.id, deck);
    }
  }

  get(id: string): Deck | undefined {
    return this.decks.get(id);
  }

  list(): DeckSummary[] {
    return [...this.decks.values()].map(summarize);
  }

  defaultIds(): string[] {
    const first = this.decks.keys().next();
    return first.done ? [] : [first.value];
  }
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A draw pile with a discard pile. An empty draw pile reshuffles the discards. */
export class Pile<T> {
  private draw: T[];
  private discarded: T[] = [];

  constructor(cards: T[], private readonly rng: Rng) {
    this.draw = shuffle(cards, rng);
  }

  take(): T | undefined {
    if (this.draw.length === 0 && this.discarded.length > 0) {
      this.draw = shuffle(this.discarded, this.rng);
      this.discarded = [];
    }
    return this.draw.pop();
  }

  discard(cards: T[]): void {
    this.discarded.push(...cards);
  }

  get size(): number {
    return this.draw.length + this.discarded.length;
  }
}
