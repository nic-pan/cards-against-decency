import { describe, expect, it } from "vitest";
import { DeckImportError, convertManyDeck, fetchManyDeck, normalizeCode } from "./manyDecks";

describe("Many Decks import", () => {
  it("accepts only 5-character codes", () => {
    expect(normalizeCode(" 1zw29 ")).toBe("1ZW29");
    expect(normalizeCode("../x")).toBeNull();
    expect(normalizeCode("ABCDEF")).toBeNull();
  });

  it("converts blanks, counts picks and keeps plain text only", () => {
    const deck = convertManyDeck("ABCDE", {
      name: "Test",
      author: { name: "Someone" },
      language: "en",
      calls: [
        [["What is ", {}, "?"]],
        [["", {}, " and ", { transform: "UpperCase" }, "."]],
        [["No blank here."]],
        [[{}, {}, {}, {}]],
        [["<script>", {}]],
      ],
      responses: ["An answer.", "an answer.", "<b>bold</b>", "x".repeat(300), 42],
    });
    expect(deck.id).toBe("md-abcde");
    expect(deck.black.map((b) => [b.text, b.pick])).toEqual([
      ["What is _?", 1],
      ["_ and _.", 2],
    ]);
    expect(deck.white.map((w) => w.text)).toEqual(["An answer."]);
    expect(deck.attribution).toContain("Someone");
  });

  it("rejects an empty deck", () => {
    expect(() => convertManyDeck("ABCDE", { calls: [], responses: [] })).toThrow(DeckImportError);
  });

  it("calls only the Many Decks API and maps a 404", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    await expect(fetchManyDeck("ZZZZZ", fake)).rejects.toMatchObject({ code: "DECK_NOT_FOUND" });
    expect(urls).toEqual(["https://decks.rereadgames.com/api/decks/ZZZZZ"]);
  });
});
