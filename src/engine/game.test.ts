import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Deck, DeckRegistry } from "./deck";
import { BOT_PROFILES } from "./bots";
import { Game, GameError, HAND_SIZE, ROUND_OVER_MS } from "./game";

function makeDeck(id = "test", blackPick = 1): Deck {
  return {
    id,
    name: "Test deck",
    description: "",
    language: "en",
    category: "community",
    source: { name: "test", url: "" },
    license: { name: "test", url: "" },
    attribution: "",
    black: Array.from({ length: 20 }, (_, i) => ({ id: `${id}:b:${i}`, text: `Prompt ${i} _.`, pick: blackPick })),
    white: Array.from({ length: 300 }, (_, i) => ({ id: `${id}:w:${i}`, text: `Answer ${i}` })),
  };
}

function setup(opts: { humans?: number; bots?: number; pick?: number; targetScore?: number } = {}) {
  const decks = new DeckRegistry([makeDeck("test", opts.pick ?? 1)]);
  let seq = 0;
  const onEmpty = vi.fn();
  const onRemoved = vi.fn();
  const game = new Game({ decks, onEmpty, onRemoved, idFactory: () => `id${++seq}`, rng: mulberry(42) });
  const ids: string[] = [];
  for (let i = 0; i < (opts.humans ?? 3); i++) ids.push(game.addPlayer(`P${i}`));
  game.updateSettings(ids[0], { botCount: opts.bots ?? 0, targetScore: opts.targetScore ?? 3 });
  return { game, ids, host: ids[0], onEmpty, onRemoved };
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every participant who must submit plays the first cards in their hand. */
function submitAll(game: Game, ids: string[]) {
  for (const id of ids) {
    const v = game.viewFor(id);
    if (v.mustSubmit) game.submit(id, v.hand.slice(0, v.round!.black.pick).map((c) => c.id));
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("lobby", () => {
  it("makes the first human the host", () => {
    const { game, ids } = setup();
    expect(game.viewFor(ids[1]).hostId).toBe(ids[0]);
  });

  it("rejects duplicate and empty names", () => {
    const { game } = setup();
    expect(() => game.addPlayer("p0")).toThrow(GameError);
    expect(() => game.addPlayer("   ")).toThrow(GameError);
  });

  it("strips control characters from names", () => {
    const { game } = setup();
    const id = game.addPlayer("Ni\u0000ck\u202e  ie");
    expect(game.playerName(id)).toBe("Nick ie");
  });

  it("lets only the host change settings and start", () => {
    const { game, ids } = setup();
    expect(() => game.updateSettings(ids[1], { targetScore: 5 })).toThrow("NOT_HOST");
    expect(() => game.start(ids[1])).toThrow("NOT_HOST");
  });

  it("validates settings on the server", () => {
    const { game, host } = setup();
    const code = (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        return (e as GameError).code;
      }
    };
    expect(code(() => game.updateSettings(host, { targetScore: 0 }))).toBe("BAD_SETTINGS");
    expect(code(() => game.updateSettings(host, { botCount: 99 }))).toBe("BAD_SETTINGS");
    expect(() => game.updateSettings(host, { deckIds: ["nope"] })).toThrow("UNKNOWN_DECK");
  });

  it("needs at least three participants", () => {
    const { game, host } = setup({ humans: 2 });
    expect(() => game.start(host)).toThrow("NOT_ENOUGH_PLAYERS");
    game.updateSettings(host, { botCount: 1 });
    expect(() => game.start(host)).not.toThrow();
  });

  it("enforces the human player limit", () => {
    const { game, host } = setup();
    game.updateSettings(host, { maxPlayers: 3 });
    expect(() => game.addPlayer("P9")).toThrow("ROOM_FULL");
  });
});

describe("rounds", () => {
  it("deals full hands and picks a human Card Czar", () => {
    const { game, ids, host } = setup({ bots: 2 });
    game.start(host);
    const v = game.viewFor(ids[1]);
    expect(v.phase).toBe("submitting");
    expect(v.hand).toHaveLength(HAND_SIZE);
    const czar = v.players.find((p) => p.id === v.round!.czarId)!;
    expect(czar.isBot).toBe(false);
  });

  it("hides who submitted what while the Card Czar judges", () => {
    const { game, ids, host } = setup();
    game.start(host);
    submitAll(game, ids);
    const v = game.viewFor(ids[0]);
    expect(v.phase).toBe("judging");
    expect(v.round!.submissions).toHaveLength(2);
    expect(v.round!.submissions!.every((s) => s.playerId === null)).toBe(true);
  });

  it("rejects cards that are not in the hand and wrong card counts", () => {
    const { game, ids, host } = setup({ pick: 2 });
    game.start(host);
    const player = ids.find((id) => game.viewFor(id).mustSubmit)!;
    const hand = game.viewFor(player).hand;
    expect(() => game.submit(player, [hand[0].id])).toThrow("BAD_CARDS");
    expect(() => game.submit(player, [hand[0].id, hand[0].id])).toThrow("BAD_CARDS");
    expect(() => game.submit(player, [hand[0].id, "fake"])).toThrow("BAD_CARDS");
    game.submit(player, [hand[0].id, hand[1].id]);
    expect(() => game.submit(player, [hand[2].id, hand[3].id])).toThrow("ALREADY_SUBMITTED");
  });

  it("does not let the Card Czar submit, or others judge", () => {
    const { game, ids, host } = setup();
    game.start(host);
    const czar = game.viewFor(host).round!.czarId;
    const hand = game.viewFor(czar).hand;
    expect(() => game.submit(czar, [hand[0].id])).toThrow("NOT_A_PARTICIPANT");
    submitAll(game, ids);
    const other = ids.find((id) => id !== czar)!;
    const sub = game.viewFor(other).round!.submissions![0];
    expect(() => game.pick(other, sub.id)).toThrow("NOT_CZAR");
  });

  it("scores the winner, reveals authors and rotates the Card Czar", () => {
    const { game, ids, host } = setup();
    game.start(host);
    const firstCzar = game.viewFor(host).round!.czarId;
    submitAll(game, ids);
    const sub = game.viewFor(firstCzar).round!.submissions![0];
    game.pick(firstCzar, sub.id);

    const v = game.viewFor(host);
    expect(v.phase).toBe("roundOver");
    const revealed = v.round!.submissions!.find((s) => s.isWinner)!;
    expect(revealed.playerId).not.toBeNull();
    expect(v.players.find((p) => p.id === revealed.playerId)!.score).toBe(1);

    vi.advanceTimersByTime(ROUND_OVER_MS);
    const next = game.viewFor(host);
    expect(next.phase).toBe("submitting");
    expect(next.round!.czarId).not.toBe(firstCzar);
    // Hands are full again after a round.
    for (const id of ids) expect(game.viewFor(id).hand).toHaveLength(HAND_SIZE);
  });

  it("ends the game at the target score", () => {
    const { game, ids, host } = setup({ targetScore: 1 });
    game.start(host);
    submitAll(game, ids);
    const czar = game.viewFor(host).round!.czarId;
    game.pick(czar, game.viewFor(czar).round!.submissions![0].id);
    const v = game.viewFor(host);
    expect(v.phase).toBe("gameOver");
    expect(v.winnerId).not.toBeNull();
  });
});

describe("timeouts and inactive players", () => {
  it("warns after one missed round and removes the player after two", () => {
    const { game, ids, host, onRemoved } = setup({ humans: 4 });
    game.updateSettings(host, { submitSeconds: 20, judgeSeconds: 20 });
    game.start(host);

    // The last player in join order is not the Card Czar in the first two rounds.
    const idle = ids.filter((id) => game.viewFor(id).mustSubmit).at(-1)!;
    const playRound = () => {
      for (const id of ids) {
        const v = game.viewFor(id);
        if (id !== idle && game.hasPlayer(id) && v.mustSubmit) game.submit(id, [v.hand[0].id]);
      }
      if (game.viewFor(host).phase === "submitting") vi.advanceTimersByTime(20_000);
    };

    playRound();
    expect(game.viewFor(idle).yourIdleRounds).toBe(1);
    expect(game.viewFor(host).players.find((p) => p.id === idle)!.status).toBe("missed");
    expect(game.hasPlayer(idle)).toBe(true);
    const czar = game.viewFor(host).round!.czarId;
    game.pick(czar, game.viewFor(czar).round!.submissions![0].id);
    vi.advanceTimersByTime(ROUND_OVER_MS);

    playRound();
    expect(game.hasPlayer(idle)).toBe(false);
    expect(onRemoved).toHaveBeenCalledWith(idle, "idle", expect.any(String));
    const removal = game.viewFor(host).log.find((n) => n.text.includes("missing 2 rounds in a row"))!;
    expect(removal.tone).toBe("danger");
    // The round goes on for the others.
    expect(game.viewFor(host).phase).toBe("judging");
  });

  it("resets the missed rounds when the player plays again", () => {
    const { game, ids, host, onRemoved } = setup({ humans: 4 });
    game.updateSettings(host, { submitSeconds: 20, judgeSeconds: 20 });
    game.start(host);
    const idle = ids.filter((id) => game.viewFor(id).mustSubmit).at(-1)!;

    for (const id of ids) {
      const v = game.viewFor(id);
      if (id !== idle && v.mustSubmit) game.submit(id, [v.hand[0].id]);
    }
    vi.advanceTimersByTime(20_000);
    expect(game.viewFor(idle).yourIdleRounds).toBe(1);
    const czar = game.viewFor(host).round!.czarId;
    game.pick(czar, game.viewFor(czar).round!.submissions![0].id);
    vi.advanceTimersByTime(ROUND_OVER_MS);

    submitAll(game, ids);
    expect(game.viewFor(idle).yourIdleRounds).toBe(0);
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("counts a Card Czar who does not choose as a missed round", () => {
    const { game, ids, host, onRemoved } = setup({ humans: 4 });
    game.updateSettings(host, { submitSeconds: 20, judgeSeconds: 20 });
    game.start(host);
    // The second player misses round 1, then is the Card Czar in round 2.
    const nextCzar = ids[1];
    expect(game.viewFor(host).round!.czarId).toBe(ids[0]);
    for (const id of ids) {
      const v = game.viewFor(id);
      if (id !== nextCzar && v.mustSubmit) game.submit(id, [v.hand[0].id]);
    }
    vi.advanceTimersByTime(20_000);
    game.pick(ids[0], game.viewFor(ids[0]).round!.submissions![0].id);
    vi.advanceTimersByTime(ROUND_OVER_MS);

    expect(game.viewFor(host).round!.czarId).toBe(nextCzar);
    submitAll(game, ids);
    vi.advanceTimersByTime(20_000);
    expect(onRemoved).toHaveBeenCalledWith(nextCzar, "idle", expect.any(String));
    expect(game.hasPlayer(nextCzar)).toBe(false);
    // Both events stay visible to the other players.
    const texts = game.viewFor(host).log.map((n) => n.text).join(" | ");
    expect(texts).toContain("did not choose in time");
    expect(texts).toContain("went back to the players' hands");
    expect(texts).toContain("missing 2 rounds in a row");
  });

  it("skips the round and returns cards when the Card Czar does not choose", () => {
    const { game, ids, host } = setup();
    game.updateSettings(host, { judgeSeconds: 20 });
    game.start(host);
    submitAll(game, ids);
    vi.advanceTimersByTime(20_000);
    const v = game.viewFor(host);
    expect(v.phase).toBe("roundOver");
    expect(v.round!.end).toBe("czarTimeout");
    for (const id of ids) expect(game.viewFor(id).hand).toHaveLength(HAND_SIZE);
  });
});

describe("leaving", () => {
  it("cancels the round when the Card Czar leaves", () => {
    const { game, ids, host } = setup({ humans: 4 });
    game.start(host);
    const czar = game.viewFor(host).round!.czarId;
    game.removePlayer(czar, "left");
    const other = ids.find((id) => id !== czar)!;
    expect(game.viewFor(other).round!.end).toBe("czarLeft");
  });

  it("moves to judging when the last missing player leaves", () => {
    const { game, ids, host } = setup({ humans: 4 });
    game.start(host);
    const waiting = ids.filter((id) => game.viewFor(id).mustSubmit);
    for (const id of waiting.slice(0, -1)) game.submit(id, [game.viewFor(id).hand[0].id]);
    game.removePlayer(waiting.at(-1)!, "left");
    expect(game.viewFor(host).phase).toBe("judging");
  });

  it("passes the host role to the next human", () => {
    const { game, ids } = setup();
    game.removePlayer(ids[0], "left");
    expect(game.viewFor(ids[1]).hostId).toBe(ids[1]);
  });

  it("stops at once when fewer than 3 players remain, without waiting for the round", () => {
    const { game, ids, host } = setup();
    game.start(host);
    while (game.viewFor(host).players.length > 3) {
      const other = game.viewFor(host).players.find((p) => p.id !== host && p.id !== game.viewFor(host).round!.czarId)!;
      game.removePlayer(other.id, "kicked");
    }
    expect(game.viewFor(host).phase).toBe("submitting");
    const nonCzar = ids.find((id) => id !== game.viewFor(host).round!.czarId && id !== host)!;
    game.removePlayer(nonCzar, "kicked");
    const view = game.viewFor(host);
    expect(view.phase).toBe("lobby");
    expect(view.log.at(-1)!.text).toBe("There are not enough players. The game stopped and returned to the lobby.");
  });

  it("closes the room when the last human leaves, even with bots", () => {
    const { game, ids, onEmpty } = setup({ humans: 1, bots: 2 });
    game.removePlayer(ids[0], "left");
    expect(onEmpty).toHaveBeenCalled();
  });
});

describe("bots and practice mode", () => {
  it("lets one human judge bot answers", () => {
    const { game, host } = setup({ humans: 1, bots: 2 });
    game.start(host);
    const v = game.viewFor(host);
    expect(v.practice).toBe(true);
    expect(v.phase).toBe("judging");
    expect(v.round!.czarId).toBe(host);
    expect(v.round!.submissions).toHaveLength(2);
  });

  it("never makes a bot the Card Czar", () => {
    const { game, ids, host } = setup({ humans: 2, bots: 3 });
    game.start(host);
    for (let i = 0; i < 6; i++) {
      const v = game.viewFor(host);
      const czar = v.players.find((p) => p.id === v.round!.czarId)!;
      expect(czar.isBot).toBe(false);
      submitAll(game, ids);
      game.pick(czar.id, game.viewFor(czar.id).round!.submissions![0].id);
      if (game.viewFor(host).phase === "gameOver") break;
      vi.advanceTimersByTime(ROUND_OVER_MS);
    }
  });
});

describe("late joining", () => {
  it("deals a late joiner in from the next round", () => {
    const { game, ids, host } = setup();
    game.start(host);
    const late = game.addPlayer("Late");
    expect(game.viewFor(late).mustSubmit).toBe(false);
    expect(game.viewFor(late).players.find((p) => p.id === late)!.status).toBe("waiting");
    submitAll(game, ids);
    const czar = game.viewFor(host).round!.czarId;
    game.pick(czar, game.viewFor(czar).round!.submissions![0].id);
    vi.advanceTimersByTime(ROUND_OVER_MS);
    const v = game.viewFor(late);
    expect(v.mustSubmit || v.round!.czarId === late).toBe(true);
  });

  it("rejects late joiners when the host disables it", () => {
    const { game, host } = setup();
    game.updateSettings(host, { allowLateJoin: false });
    game.start(host);
    expect(() => game.addPlayer("Late")).toThrow("LATE_JOIN_DISABLED");
  });
});

describe("spectators", () => {
  it("lets spectators watch without cards or a turn", () => {
    const { game, ids, host } = setup();
    const spec = game.addSpectator("Watcher");
    game.start(host);
    const v = game.viewFor(spec);
    expect(v.youAreSpectator).toBe(true);
    expect(v.hand).toHaveLength(0);
    expect(v.mustSubmit).toBe(false);
    expect(v.players.some((p) => p.id === spec)).toBe(false);
    expect(v.spectators.map((s) => s.name)).toEqual(["Watcher"]);
    // Spectators see answers anonymously, like players.
    submitAll(game, ids);
    expect(game.viewFor(spec).round!.submissions!.every((s) => s.playerId === null)).toBe(true);
  });

  it("uses one name list for players and spectators", () => {
    const { game } = setup();
    expect(() => game.addSpectator("P1")).toThrow("NAME_TAKEN");
    game.addSpectator("Watcher");
    expect(() => game.addPlayer("watcher")).toThrow("NAME_TAKEN");
  });

  it("enforces the spectator limit", () => {
    const { game, host } = setup();
    game.updateSettings(host, { maxSpectators: 1 });
    game.addSpectator("S1");
    expect(() => game.addSpectator("S2")).toThrow("SPECTATORS_FULL");
  });

  it("lets a spectator start to play from the next round", () => {
    const { game, ids, host } = setup();
    const spec = game.addSpectator("Watcher");
    game.start(host);
    game.promoteSpectator(spec);
    const v = game.viewFor(spec);
    expect(v.youAreSpectator).toBe(false);
    expect(v.hand).toHaveLength(HAND_SIZE);
    expect(v.players.find((p) => p.id === spec)!.status).toBe("waiting");
    expect(game.memberIds()).toContain(spec);
    expect(ids).not.toContain(spec);
  });

  it("closes the room when the last player leaves, even with spectators", () => {
    const { game, ids, onEmpty } = setup({ humans: 1 });
    game.addSpectator("Watcher");
    game.removePlayer(ids[0], "left");
    expect(onEmpty).toHaveBeenCalled();
  });
});

describe("imported decks", () => {
  const external = (): Deck => ({ ...makeDeck("md-abcde"), category: "community" });

  it("adds an imported deck to one room only, and selects it", () => {
    const { game, host } = setup();
    game.addDeck(host, external());
    const v = game.viewFor(host);
    expect(v.settings.deckIds).toContain("md-abcde");
    expect(v.decks.find((d) => d.id === "md-abcde")!.external).toBe(true);
    expect(game.summary().customDecks).toBe(true);

    const other = setup();
    expect(other.game.viewFor(other.host).decks.some((d) => d.id === "md-abcde")).toBe(false);
  });

  it("lets only the host add or remove decks, and only between games", () => {
    const { game, ids, host } = setup();
    expect(() => game.addDeck(ids[1], external())).toThrow("NOT_HOST");
    game.addDeck(host, external());
    game.start(host);
    expect(() => game.removeDeck(host, "md-abcde")).toThrow("WRONG_PHASE");
  });

  it("removes an imported deck and clears the label", () => {
    const { game, host } = setup();
    game.addDeck(host, external());
    game.removeDeck(host, "md-abcde");
    expect(game.viewFor(host).settings.deckIds).not.toContain("md-abcde");
    expect(game.summary().customDecks).toBe(false);
    expect(() => game.removeDeck(host, "test")).toThrow("UNKNOWN_DECK");
  });
});

describe("removing and adding bots", () => {
  it("names bots from the bot list, with no name twice", () => {
    const { game, host } = setup({ bots: 6 });
    const bots = game.viewFor(host).players.filter((p) => p.isBot).map((p) => p.name);
    expect(bots).toHaveLength(6);
    expect(new Set(bots).size).toBe(6);
    for (const name of bots) expect(BOT_PROFILES.map((b) => b.name)).toContain(name);
  });

  it("lowers the bot count when the host removes a bot in the lobby", () => {
    const { game, host } = setup({ bots: 3 });
    const bot = game.viewFor(host).players.find((p) => p.isBot)!;
    game.removeBot(host, bot.id);
    const v = game.viewFor(host);
    expect(v.settings.botCount).toBe(2);
    expect(v.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(v.players.some((p) => p.id === bot.id)).toBe(false);
  });

  it("removes a bot during a game, with its played card", () => {
    const { game, ids, host, onRemoved } = setup({ humans: 3, bots: 2 });
    game.start(host);
    const bot = game.viewFor(host).players.find((p) => p.isBot)!;
    expect(game.viewFor(host).round!.submittedCount).toBe(2);
    game.removeBot(host, bot.id);
    const v = game.viewFor(host);
    expect(v.round!.submittedCount).toBe(1);
    expect(v.settings.botCount).toBe(2);
    expect(onRemoved).toHaveBeenCalledWith(bot.id, "kicked", bot.name);
    expect(() => game.removeBot(ids[1], v.players.find((p) => p.isBot)!.id)).toThrow("NOT_HOST");
  });

  it("adds bots back during a game only up to the count set before the start", () => {
    const { game, host } = setup({ humans: 3, bots: 1 });
    game.start(host);
    expect(() => game.addBot(host)).toThrow("TOO_MANY_BOTS");
    const bot = game.viewFor(host).players.find((p) => p.isBot)!;
    game.removeBot(host, bot.id);
    game.addBot(host);
    const v = game.viewFor(host);
    const added = v.players.find((p) => p.isBot)!;
    expect(added.id).not.toBe(bot.id);
    expect(added.status).toBe("waiting");
    expect(() => game.addBot(host)).toThrow("TOO_MANY_BOTS");
  });
});

describe("activity log", () => {
  it("records joins, rounds and winners with times", () => {
    const { game, ids, host } = setup();
    game.start(host);
    submitAll(game, ids);
    const czar = game.viewFor(host).round!.czarId;
    game.pick(czar, game.viewFor(czar).round!.submissions![0].id);
    const texts = game.viewFor(host).log.map((n) => n.text);
    expect(texts[0]).toBe("P0 created the room.");
    expect(texts).toContain("P1 joined.");
    expect(texts).toContain("The game started.");
    expect(texts.some((t) => /^Round 1\. Card Czar: P\d\.$/.test(t))).toBe(true);
    expect(texts.some((t) => /^P\d won round 1\.$/.test(t))).toBe(true);
    expect(game.viewFor(host).log.every((n) => typeof n.at === "number")).toBe(true);
  });

  it("keeps the last 50 entries", () => {
    const { game } = setup();
    for (let i = 0; i < 60; i++) game.removePlayer(game.addSpectator(`S${i}`), "left");
    const log = game.viewFor(game.humanIds()[0]).log;
    expect(log).toHaveLength(50);
    expect(log.at(-1)!.text).toBe("S59 stopped watching.");
  });
});
