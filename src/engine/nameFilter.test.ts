import { describe, expect, it } from "vitest";
import { isBlockedName } from "./nameFilter";

// This file contains slurs on purpose: the tests check that the filter blocks them.

describe("isBlockedName", () => {
  it.each([
    // Slurs, also with tricks.
    "nigger",
    "N1gg3r",
    "n.i.g.g.e.r",
    "Big Faggot",
    "kike lover",
    "Tranny Hunter",
    "Retard",
    // Hate symbols.
    "Hitler Fan",
    "H1tl3r",
    "Sieg Heil",
    "1488",
    "14/88 Boy",
    "KKK Member",
    "White Power",
    // Minors.
    "Pedo Bear",
    "Loli",
    "Jailbait",
    // Impersonation.
    "Admin",
    "Game Moderator",
    "Mod",
    "Official CAD",
    "Cards Against Decency",
    // Links and contact details.
    "www.spam.com",
    "spam.gg",
    "buy dot com",
    "@myhandle",
    "me@mail.com",
    "0888 123 456",
    "My OnlyFans",
    // Other languages.
    "Maricón",
    "Sudaca",
    "Neger",
    "Schwuchtel",
    "Frocio",
    "Pidoras",
    "пидор",
    "П.и.д.о.р",
    "пидopac", // Latin "o", "p", "a", "c" in a Cyrillic word
    "педераст",
    "Жид",
    "Хитлер",
  ])("blocks %s", (name) => {
    expect(isBlockedName(name)).toBe(true);
  });

  it.each([
    // Crude humour is part of the game.
    "Big Dick Energy",
    "Poop Lord",
    "Sir Farts-a-Lot",
    "Shit Happens",
    "Mighty Ass",
    "Cock-a-doodle",
    "Grammar Nazi",
    // Normal words that contain a blocked word.
    "Torpedo",
    "Pedometer",
    "Badminton Pro",
    "Scunthorpe",
    "Grape Juice",
    "The Therapist",
    "Montenegro",
    "Moderately Funny",
    "Unofficial",
    "Supporter",
    "Pedal Pusher",
    "Lollipop",
    // Words that only match when the spaces are removed.
    "Sir Ape",
    "One Germ",
    "Cupid Or",
    "Bad Mint",
    "Kirk Kirkland",
    // Normal names.
    "Alpha",
    "Tester Ana",
    "Agent 007",
    "Иван",
    "Петя",
    "Нигерия",
    "Чуркин",
  ])("allows %s", (name) => {
    expect(isBlockedName(name)).toBe(false);
  });
});
