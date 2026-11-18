import { randomBytes } from "node:crypto";
import { BlackCard, Deck, DeckRegistry, DeckSummary, Pile, Rng, WhiteCard, shuffle, summarize } from "./deck";
import { BOT_PROFILES, isBotName } from "./bots";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface Settings {
  deckIds: string[];
  /** Maximum number of human players. Bots do not count. */
  maxPlayers: number;
  botCount: number;
  targetScore: number;
  /** Seconds for players to submit. */
  submitSeconds: number;
  /** Seconds for the Card Czar to choose. */
  judgeSeconds: number;
  allowLateJoin: boolean;
  /** Public rooms appear in the game list. Private rooms need the invite link or code. */
  isPublic: boolean;
  maxSpectators: number;
}

export const LIMITS = {
  maxPlayers: { min: 3, max: 20 },
  botCount: { min: 0, max: 6 },
  targetScore: { min: 1, max: 50 },
  submitSeconds: { min: 20, max: 300 },
  judgeSeconds: { min: 20, max: 300 },
  maxSpectators: { min: 0, max: 20 },
} as const;

export const HAND_SIZE = 10;
/** A game needs a Card Czar and at least two players who submit. */
export const MIN_PARTICIPANTS = 3;
/** Rounds in a row that a player can miss before the game removes them. */
export const IDLE_ROUNDS_BEFORE_KICK = 2;
export const ROUND_OVER_MS = 7_000;
export const NAME_MAX = 24;
/** Maximum number of imported decks in one room. */
export const MAX_EXTERNAL_DECKS = 10;

export function defaultSettings(decks: DeckRegistry): Settings {
  return {
    deckIds: decks.defaultIds(),
    maxPlayers: 10,
    botCount: 0,
    targetScore: 8,
    submitSeconds: 75,
    judgeSeconds: 75,
    allowLateJoin: true,
    isPublic: true,
    maxSpectators: 10,
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Phase = "lobby" | "submitting" | "judging" | "roundOver" | "gameOver";

export type ErrorCode =
  | "NOT_HOST"
  | "WRONG_PHASE"
  | "ROOM_FULL"
  | "LATE_JOIN_DISABLED"
  | "NAME_INVALID"
  | "NAME_TAKEN"
  | "NOT_ENOUGH_PLAYERS"
  | "NOT_ENOUGH_CARDS"
  | "NO_DECKS"
  | "UNKNOWN_DECK"
  | "NOT_A_PARTICIPANT"
  | "ALREADY_SUBMITTED"
  | "BAD_CARDS"
  | "NOT_CZAR"
  | "UNKNOWN_SUBMISSION"
  | "UNKNOWN_PLAYER"
  | "BAD_SETTINGS"
  | "SPECTATORS_FULL"
  | "TOO_MANY_DECKS"
  | "NAME_RESERVED"
  | "TOO_MANY_BOTS";

export class GameError extends Error {
  constructor(public readonly code: ErrorCode, message?: string) {
    super(message ?? code);
  }
}

interface Player {
  id: string;
  name: string;
  isBot: boolean;
  score: number;
  hand: WhiteCard[];
  connected: boolean;
  /** Rounds in a row that the player missed. At IDLE_ROUNDS_BEFORE_KICK the game removes them. */
  idleRounds: number;
}

/** A person who watches the game. Spectators have no cards and no score. */
interface Spectator {
  id: string;
  name: string;
  connected: boolean;
}

interface Submission {
  id: string;
  playerId: string;
  cards: WhiteCard[];
}

type RoundEnd = "winner" | "czarTimeout" | "czarLeft" | "noSubmissions";

interface Round {
  number: number;
  czarId: string;
  black: BlackCard;
  /** Players who must submit in this round. Set when the round starts. */
  participants: Set<string>;
  /** Players who did not submit in time. */
  missed: Set<string>;
  submissions: Submission[];
  winnerSubmissionId: string | null;
  end: RoundEnd | null;
  deadline: number | null;
}

/** One entry in the room's activity log. */
export interface Notice {
  id: number;
  text: string;
  /** "danger" entries show in red, for example when a player is removed for being idle. */
  tone: "info" | "danger";
  /** Server time in milliseconds. */
  at: number;
}

/** The number of log entries that the room keeps. The log disappears with the room. */
const LOG_KEPT = 50;

// ---------------------------------------------------------------------------
// Client view (what one player is allowed to see)
// ---------------------------------------------------------------------------

export type PlayerStatus = "czar" | "submitted" | "playing" | "missed" | "waiting" | "idle";

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  score: number;
  connected: boolean;
  status: PlayerStatus;
}

export interface SubmissionView {
  id: string;
  cards: WhiteCard[];
  /** Revealed only after the Card Czar chooses. */
  playerId: string | null;
  isWinner: boolean;
}

export interface RoundView {
  number: number;
  czarId: string;
  black: BlackCard;
  deadline: number | null;
  submittedCount: number;
  expectedCount: number;
  /** Null while players submit. Anonymous while the Card Czar judges. */
  submissions: SubmissionView[] | null;
  end: RoundEnd | null;
}

export interface SpectatorView {
  id: string;
  name: string;
  connected: boolean;
}

/** What the game list shows about a room. */
export interface GameSummary {
  isPublic: boolean;
  hostName: string;
  phase: Phase;
  players: { name: string; isBot: boolean }[];
  spectators: string[];
  maxPlayers: number;
  maxSpectators: number;
  targetScore: number;
  allowLateJoin: boolean;
  deckNames: string[];
  /** True when a selected deck is user-made and not moderated. */
  customDecks: boolean;
}

export interface GameView {
  youId: string;
  /** Rounds in a row that you missed. The game warns you at 1 and removes you at IDLE_ROUNDS_BEFORE_KICK. */
  yourIdleRounds: number;
  youAreSpectator: boolean;
  spectators: SpectatorView[];
  hostId: string;
  phase: Phase;
  settings: Settings;
  practice: boolean;
  players: PublicPlayer[];
  round: RoundView | null;
  hand: WhiteCard[];
  yourSubmission: WhiteCard[] | null;
  mustSubmit: boolean;
  winnerId: string | null;
  /** The room's activity log, oldest first. */
  log: Notice[];
  decks: DeckSummary[];
  serverNow: number;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export type RemoveReason = "left" | "kicked" | "banned" | "timeout" | "idle";

export interface GameOptions {
  decks: DeckRegistry;
  rng?: Rng;
  /** Called after every state change. The server broadcasts new views. */
  onChange?: () => void;
  /** Called when the last human leaves. The server closes the room. */
  onEmpty?: () => void;
  /** Called when the game removes a player. The server uses it to tell an idle player why. */
  onRemoved?: (playerId: string, why: RemoveReason, name: string) => void;
  idFactory?: () => string;
}

const randomId = () => randomBytes(9).toString("base64url");

const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]",
  "g",
);

/** Removes control characters and extra spaces. Returns plain text only. */
export function cleanText(input: string, max: number): string {
  return input
    .normalize("NFC")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Bot names ("FBI", "Bot 1") belong to bots, so people cannot use them. */
export function isReservedName(name: string): boolean {
  return isBotName(name);
}

/** The form of a name that is used to compare names. */
export function nameKey(rawName: string): string {
  return cleanText(rawName, NAME_MAX).toLowerCase();
}

export class Game {
  private readonly decks: DeckRegistry;
  private readonly rng: Rng;
  private readonly onChange: () => void;
  private readonly onEmpty: () => void;
  private readonly onRemoved: (playerId: string, why: RemoveReason, name: string) => void;
  /** Idle players to remove after the current phase change. */
  private pendingKicks: string[] = [];
  private readonly newId: () => string;

  private players: Player[] = [];
  private spectators: Spectator[] = [];
  /** Decks that the host imported. They exist only in this room. */
  private externalDecks = new Map<string, Deck>();
  private hostId = "";
  private settings: Settings;
  private phase: Phase = "lobby";
  private round: Round | null = null;
  private roundNumber = 0;
  private winnerId: string | null = null;
  private log: Notice[] = [];
  private noticeSeq = 0;
  private lastCzarId: string | null = null;
  private botSeq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private whitePile: Pile<WhiteCard> | null = null;
  private blackPile: Pile<BlackCard> | null = null;
  private disposed = false;

  constructor(opts: GameOptions) {
    this.decks = opts.decks;
    this.rng = opts.rng ?? Math.random;
    this.onChange = opts.onChange ?? (() => {});
    this.onEmpty = opts.onEmpty ?? (() => {});
    this.onRemoved = opts.onRemoved ?? (() => {});
    this.newId = opts.idFactory ?? randomId;
    this.settings = defaultSettings(opts.decks);
  }

  // ----- Players -------------------------------------------------------

  /** Adds a human player. The first human becomes the host. */
  addPlayer(rawName: string): string {
    const name = this.checkName(rawName);
    this.checkCanJoin();
    const player = this.makePlayer(name, false);
    // Late joiners get cards now, but they play from the next round.
    if (this.whitePile && this.phase !== "lobby") this.refill(player);
    this.players.push(player);
    this.setNotice(this.hostId ? `${name} joined.` : `${name} created the room.`);
    if (!this.hostId) this.hostId = player.id;
    this.changed();
    return player.id;
  }

  /** Adds a spectator. A room needs a host first, so the first person is never a spectator. */
  addSpectator(rawName: string): string {
    const name = this.checkName(rawName);
    if (!this.hostId) throw new GameError("UNKNOWN_PLAYER");
    if (this.spectators.length >= this.settings.maxSpectators) throw new GameError("SPECTATORS_FULL");
    const spectator: Spectator = { id: this.newId(), name, connected: true };
    this.spectators.push(spectator);
    this.setNotice(`${name} is watching.`);
    this.changed();
    return spectator.id;
  }

  /** A spectator becomes a player. The same rules apply as for a late joiner. */
  promoteSpectator(id: string): void {
    const spectator = this.spectators.find((s) => s.id === id);
    if (!spectator) throw new GameError("UNKNOWN_PLAYER");
    this.checkCanJoin();
    this.spectators = this.spectators.filter((s) => s !== spectator);
    const player = this.makePlayer(spectator.name, false);
    player.id = spectator.id;
    player.connected = spectator.connected;
    if (this.whitePile && this.phase !== "lobby") this.refill(player);
    this.players.push(player);
    this.setNotice(`${spectator.name} stopped watching and joined the game.`);
    this.changed();
  }

  removePlayer(id: string, why: RemoveReason): void {
    const spectator = this.spectators.find((s) => s.id === id);
    if (spectator) {
      this.spectators = this.spectators.filter((s) => s.id !== id);
      if (why === "banned") this.setNotice(`${spectator.name} was banned from this game room.`, "danger");
      else this.setNotice(why === "kicked" ? `${spectator.name} was removed.` : `${spectator.name} stopped watching.`);
      this.changed();
      return;
    }
    const player = this.find(id);
    if (!player) return;
    this.players = this.players.filter((p) => p.id !== id);
    this.whitePile?.discard(player.hand);
    player.hand = [];
    this.onRemoved(id, why, player.name);

    if (this.humans().length === 0) {
      this.dispose();
      this.onEmpty();
      return;
    }
    if (this.hostId === id) this.hostId = this.humans()[0].id;

    const verb =
      why === "kicked"
        ? "was removed"
        : why === "banned"
          ? "was banned from this game room"
          : why === "timeout"
          ? "lost connection"
          : why === "idle"
            ? `was removed for missing ${IDLE_ROUNDS_BEFORE_KICK} rounds in a row`
            : "left";
    this.setNotice(`${player.name} ${verb}.`, why === "idle" || why === "banned" ? "danger" : "info");

    // A game needs 3 players. With fewer, it stops at once instead of waiting for the round to end.
    const inGame = this.phase === "submitting" || this.phase === "judging" || this.phase === "roundOver";
    if (inGame && this.players.length < MIN_PARTICIPANTS) {
      this.toLobby("There are not enough players. The game stopped and returned to the lobby.");
      return;
    }

    const round = this.round;
    if (round && (this.phase === "submitting" || this.phase === "judging")) {
      if (round.czarId === id) {
        this.returnSubmissions(round);
        this.endRound("czarLeft");
        return;
      }
      round.participants.delete(id);
      const own = round.submissions.find((s) => s.playerId === id);
      if (own) {
        this.whitePile?.discard(own.cards);
        round.submissions = round.submissions.filter((s) => s !== own);
      }
      if (this.phase === "submitting") {
        if (this.allSubmitted(round)) this.toJudging();
      } else if (round.submissions.length === 0) {
        this.endRound("noSubmissions");
        return;
      }
    }
    this.changed();
  }

  setConnected(id: string, connected: boolean): void {
    const spectator = this.spectators.find((s) => s.id === id);
    if (spectator) {
      if (spectator.connected === connected) return;
      spectator.connected = connected;
      this.changed();
      return;
    }
    const player = this.find(id);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    this.changed();
  }

  /** The player is active again. This resets their missed rounds. */
  markBack(id: string): void {
    const player = this.find(id);
    if (!player) throw new GameError("UNKNOWN_PLAYER");
    player.idleRounds = 0;
    this.changed();
  }

  // ----- Imported decks ----------------------------------------------

  hasDeck(id: string): boolean {
    return !!this.deck(id);
  }

  /** Adds an imported deck to this room and selects it. Only between games. */
  addDeck(byId: string, deck: Deck): void {
    this.requireHost(byId);
    if (this.phase !== "lobby" && this.phase !== "gameOver") throw new GameError("WRONG_PHASE");
    if (this.decks.get(deck.id)) throw new GameError("UNKNOWN_DECK");
    if (!this.externalDecks.has(deck.id) && this.externalDecks.size >= MAX_EXTERNAL_DECKS) {
      throw new GameError("TOO_MANY_DECKS");
    }
    this.externalDecks.set(deck.id, deck);
    if (!this.settings.deckIds.includes(deck.id)) {
      this.settings = { ...this.settings, deckIds: [...this.settings.deckIds, deck.id] };
    }
    this.changed();
  }

  removeDeck(byId: string, deckId: string): void {
    this.requireHost(byId);
    if (this.phase !== "lobby" && this.phase !== "gameOver") throw new GameError("WRONG_PHASE");
    if (!this.externalDecks.delete(deckId)) throw new GameError("UNKNOWN_DECK");
    this.settings = { ...this.settings, deckIds: this.settings.deckIds.filter((id) => id !== deckId) };
    this.changed();
  }

  hasPlayer(id: string): boolean {
    return this.find(id) !== undefined;
  }

  /** True for players and spectators. */
  hasMember(id: string): boolean {
    return this.hasPlayer(id) || this.spectators.some((s) => s.id === id);
  }

  /** Names of human players and spectators, with their ids. */
  memberNames(): { id: string; name: string }[] {
    return [...this.humans(), ...this.spectators].map((m) => ({ id: m.id, name: m.name }));
  }

  /** Human players and spectators. Bots are not members. */
  memberIds(): string[] {
    return [...this.humans().map((p) => p.id), ...this.spectators.map((s) => s.id)];
  }

  summary(): GameSummary {
    return {
      isPublic: this.settings.isPublic,
      hostName: this.find(this.hostId)?.name ?? "",
      phase: this.phase,
      players: this.players.map((p) => ({ name: p.name, isBot: p.isBot })),
      spectators: this.spectators.map((s) => s.name),
      maxPlayers: this.settings.maxPlayers,
      maxSpectators: this.settings.maxSpectators,
      targetScore: this.settings.targetScore,
      allowLateJoin: this.settings.allowLateJoin,
      deckNames: this.settings.deckIds.map((id) => this.deck(id)?.name ?? id),
      customDecks: this.settings.deckIds.some((id) => this.externalDecks.has(id)),
    };
  }

  isHost(id: string): boolean {
    return this.hostId === id;
  }

  playerName(id: string): string | undefined {
    return this.find(id)?.name;
  }

  // ----- Host actions --------------------------------------------------

  updateSettings(byId: string, patch: Partial<Settings>): void {
    this.requireHost(byId);
    const next: Settings = { ...this.settings, ...patch };
    const inLobby = this.phase === "lobby" || this.phase === "gameOver";

    // Decks, bots and the target score change only between games.
    if (!inLobby) {
      next.deckIds = this.settings.deckIds;
      next.botCount = this.settings.botCount;
      next.targetScore = this.settings.targetScore;
    }
    for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      const value = next[key];
      const { min, max } = LIMITS[key];
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new GameError("BAD_SETTINGS", `${key} must be between ${min} and ${max}`);
      }
    }
    next.deckIds = [...new Set(next.deckIds)];
    for (const deckId of next.deckIds) {
      if (!this.deck(deckId)) throw new GameError("UNKNOWN_DECK");
    }
    if (next.maxPlayers < this.humans().length) {
      throw new GameError("BAD_SETTINGS", "maxPlayers is lower than the current number of players");
    }
    this.settings = next;
    if (inLobby) this.syncBots();
    this.changed();
  }

  start(byId: string): void {
    this.requireHost(byId);
    if (this.phase !== "lobby" && this.phase !== "gameOver") throw new GameError("WRONG_PHASE");
    if (this.settings.deckIds.length === 0) throw new GameError("NO_DECKS");
    this.syncBots();
    if (this.players.length < MIN_PARTICIPANTS) throw new GameError("NOT_ENOUGH_PLAYERS");

    const decks = this.settings.deckIds.map((id) => this.deck(id)!);
    const black = decks.flatMap((d) => d.black);
    const white = decks.flatMap((d) => d.white);
    // Hands for everyone now, plus room for two late joiners. Discards reshuffle later.
    if (black.length === 0 || white.length < (this.players.length + 2) * HAND_SIZE) {
      throw new GameError("NOT_ENOUGH_CARDS");
    }
    this.blackPile = new Pile(black, this.rng);
    this.whitePile = new Pile(white, this.rng);
    for (const p of this.players) {
      p.score = 0;
      p.hand = [];
      p.idleRounds = 0;
    }
    this.winnerId = null;
    this.roundNumber = 0;
    this.lastCzarId = null;
    this.setNotice("The game started.");
    this.startRound();
  }

  /** Stops the game and shows the final scores. */
  endGame(byId: string): void {
    this.requireHost(byId);
    if (this.phase === "lobby" || this.phase === "gameOver") throw new GameError("WRONG_PHASE");
    this.clearTimer();
    this.round = null;
    this.phase = "gameOver";
    this.winnerId = this.leader();
    this.setNotice("The host ended the game.");
    this.changed();
  }

  /** Returns everyone to the lobby. Scores stay visible until the next start. */
  backToLobby(byId: string): void {
    this.requireHost(byId);
    this.toLobby(null);
  }

  // ----- Bots ----------------------------------------------------------

  /**
   * The host removes one bot. In the lobby this lowers the bot count. During a game the
   * bot leaves at once; settings.botCount stays as the limit for adding bots back.
   */
  removeBot(byId: string, botId: string): void {
    this.requireHost(byId);
    const bot = this.find(botId);
    if (!bot || !bot.isBot) throw new GameError("UNKNOWN_PLAYER");
    if (this.phase === "lobby" || this.phase === "gameOver") {
      this.players = this.players.filter((p) => p !== bot);
      this.settings = { ...this.settings, botCount: this.players.filter((p) => p.isBot).length };
      this.changed();
      return;
    }
    this.removePlayer(botId, "kicked");
  }

  /** During a game, the host adds a bot back, up to the bot count set before the start. */
  addBot(byId: string): void {
    this.requireHost(byId);
    if (this.phase === "lobby" || this.phase === "gameOver") {
      const next = this.settings.botCount + 1;
      if (next > LIMITS.botCount.max) throw new GameError("BAD_SETTINGS");
      this.updateSettings(byId, { botCount: next });
      return;
    }
    if (this.players.filter((p) => p.isBot).length >= this.settings.botCount) throw new GameError("TOO_MANY_BOTS");
    const bot = this.makePlayer(this.nextBotName(), true);
    // Like a late joiner: cards now, play from the next round.
    if (this.whitePile) this.refill(bot);
    this.players.push(bot);
    this.setNotice(`The host added ${bot.name}. It plays from the next round.`);
    this.changed();
  }

  // ----- Player actions ------------------------------------------------

  submit(playerId: string, cardIds: string[]): void {
    const round = this.round;
    if (this.phase !== "submitting" || !round) throw new GameError("WRONG_PHASE");
    const player = this.find(playerId);
    if (!player || !round.participants.has(playerId)) throw new GameError("NOT_A_PARTICIPANT");
    if (round.submissions.some((s) => s.playerId === playerId)) throw new GameError("ALREADY_SUBMITTED");
    if (cardIds.length !== round.black.pick || new Set(cardIds).size !== cardIds.length) {
      throw new GameError("BAD_CARDS");
    }
    const cards = cardIds.map((cid) => player.hand.find((c) => c.id === cid));
    if (cards.some((c) => c === undefined)) throw new GameError("BAD_CARDS");

    player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
    round.submissions.push({ id: this.newId(), playerId, cards: cards as WhiteCard[] });
    player.idleRounds = 0;

    if (this.allSubmitted(round)) this.toJudging();
    else this.changed();
  }

  pick(czarId: string, submissionId: string): void {
    const round = this.round;
    if (this.phase !== "judging" || !round) throw new GameError("WRONG_PHASE");
    if (round.czarId !== czarId) throw new GameError("NOT_CZAR");
    const winner = round.submissions.find((s) => s.id === submissionId);
    if (!winner) throw new GameError("UNKNOWN_SUBMISSION");

    round.winnerSubmissionId = winner.id;
    const czar = this.find(czarId);
    if (czar) czar.idleRounds = 0;
    const player = this.find(winner.playerId);
    if (player) player.score += 1;
    this.setNotice(`${player?.name ?? "Someone who left"} won round ${round.number}.`);
    this.endRound("winner");
  }

  // ----- Views ---------------------------------------------------------

  viewFor(playerId: string): GameView {
    const me = this.find(playerId);
    const round = this.round;
    const revealed = this.phase === "roundOver" || (this.phase === "gameOver" && round !== null);
    const mySubmission = round?.submissions.find((s) => s.playerId === playerId) ?? null;

    let submissions: SubmissionView[] | null = null;
    if (round && (this.phase === "judging" || revealed)) {
      submissions = round.submissions.map((s) => ({
        id: s.id,
        cards: s.cards,
        playerId: revealed ? s.playerId : null,
        isWinner: revealed && s.id === round.winnerSubmissionId,
      }));
    }

    return {
      youId: playerId,
      yourIdleRounds: me?.idleRounds ?? 0,
      youAreSpectator: this.spectators.some((s) => s.id === playerId),
      spectators: this.spectators.map((s) => ({ id: s.id, name: s.name, connected: s.connected })),
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      practice: this.humans().length === 1 && this.players.some((p) => p.isBot),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        score: p.score,
        connected: p.connected,
        status: this.statusOf(p),
      })),
      round: round && {
        number: round.number,
        czarId: round.czarId,
        black: round.black,
        deadline: round.deadline,
        submittedCount: round.submissions.length,
        expectedCount: round.participants.size,
        submissions,
        end: round.end,
      },
      hand: me?.hand ?? [],
      yourSubmission: mySubmission?.cards ?? null,
      mustSubmit:
        this.phase === "submitting" && !!round && round.participants.has(playerId) && !mySubmission,
      winnerId: this.winnerId,
      log: this.log,
      decks: [...this.decks.list(), ...[...this.externalDecks.values()].map((d) => ({ ...summarize(d), external: true }))],
      serverNow: Date.now(),
    };
  }

  humanIds(): string[] {
    return this.humans().map((p) => p.id);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  // ----- Internals -----------------------------------------------------

  private startRound(): void {
    this.clearTimer();
    const active = this.players;
    const activeHumans = active.filter((p) => !p.isBot);
    if (active.length < MIN_PARTICIPANTS || activeHumans.length === 0) {
      this.toLobby("There are not enough active players. The game returned to the lobby.");
      return;
    }
    const black = this.blackPile!.take();
    if (!black) {
      this.toLobby("There are no prompt cards left.");
      return;
    }
    for (const p of this.players) this.refill(p);

    const czar = this.nextCzar(activeHumans);
    this.lastCzarId = czar.id;
    this.setNotice(`Round ${this.roundNumber + 1}. Card Czar: ${czar.name}.`);
    this.roundNumber += 1;
    const round: Round = {
      number: this.roundNumber,
      czarId: czar.id,
      black,
      participants: new Set(active.filter((p) => p.id !== czar.id).map((p) => p.id)),
      missed: new Set(),
      submissions: [],
      winnerSubmissionId: null,
      end: null,
      deadline: Date.now() + this.settings.submitSeconds * 1000,
    };
    this.round = round;
    this.phase = "submitting";
    this.schedule(this.settings.submitSeconds * 1000, () => this.toJudging());

    // Bots play random cards from their hands. They never judge or chat.
    for (const bot of this.players.filter((p) => p.isBot && round.participants.has(p.id))) {
      const cards = shuffle(bot.hand, this.rng).slice(0, black.pick);
      bot.hand = bot.hand.filter((c) => !cards.includes(c));
      round.submissions.push({ id: this.newId(), playerId: bot.id, cards });
    }

    if (this.allSubmitted(round)) this.toJudging();
    else this.changed();
  }

  private toJudging(): void {
    const round = this.round;
    if (!round || this.phase !== "submitting") return;
    this.clearTimer();

    // Players who did not submit in time miss the round. A second miss in a row removes them.
    for (const id of round.participants) {
      if (round.submissions.some((s) => s.playerId === id)) continue;
      round.missed.add(id);
      const p = this.find(id);
      if (p) this.markIdle(p);
    }
    if (round.submissions.length === 0) {
      this.endRound("noSubmissions");
      this.kickIdle();
      return;
    }
    round.submissions = shuffle(round.submissions, this.rng);
    round.deadline = Date.now() + this.settings.judgeSeconds * 1000;
    this.phase = "judging";
    this.schedule(this.settings.judgeSeconds * 1000, () => this.onJudgeTimeout());
    this.changed();
    this.kickIdle();
  }

  /** Removes the players who missed too many rounds. Runs after the phase change. */
  private kickIdle(): void {
    for (const id of this.pendingKicks.splice(0)) {
      if (this.disposed) return;
      if (this.find(id)) this.removePlayer(id, "idle");
    }
  }

  private onJudgeTimeout(): void {
    const round = this.round;
    if (!round || this.phase !== "judging") return;
    const czar = this.find(round.czarId);
    if (czar) this.markIdle(czar);
    this.returnSubmissions(round);
    this.endRound("czarTimeout");
    this.kickIdle();
  }

  private endRound(end: RoundEnd): void {
    const round = this.round!;
    this.clearTimer();
    round.end = end;
    round.deadline = Date.now() + ROUND_OVER_MS;
    this.whitePile?.discard(round.submissions.flatMap((s) => s.cards));
    this.blackPile?.discard([round.black]);

    if (end === "czarTimeout") {
      this.setNotice(
        "The Card Czar did not choose in time. Nobody gets an Offence, and the played cards went back to the players' hands.",
        "danger",
      );
    }
    if (end === "czarLeft") {
      this.setNotice("The Card Czar left. The round was cancelled, and the played cards went back to the players' hands.");
    }
    if (end === "noSubmissions") this.setNotice("Nobody submitted an answer. The round was skipped.");

    const champion = this.players.find((p) => p.score >= this.settings.targetScore);
    if (champion) {
      this.phase = "gameOver";
      this.winnerId = champion.id;
      this.setNotice(`${champion.name} wins the game with ${champion.score} Offences!`);
      round.deadline = null;
      this.changed();
      return;
    }
    this.phase = "roundOver";
    this.schedule(ROUND_OVER_MS, () => this.startRound());
    this.changed();
  }

  private toLobby(message: string | null): void {
    this.clearTimer();
    for (const p of this.players) {
      if (this.whitePile) this.whitePile.discard(p.hand);
      p.hand = [];
    }
    this.round = null;
    this.phase = "lobby";
    this.whitePile = null;
    this.blackPile = null;
    if (message) this.setNotice(message);
    this.syncBots();
    this.changed();
  }

  /** Returns submitted cards to the hands of the players who played them. */
  private returnSubmissions(round: Round): void {
    for (const s of round.submissions) {
      const p = this.find(s.playerId);
      if (p) p.hand.push(...s.cards);
    }
    round.submissions = [];
  }

  private nextCzar(candidates: Player[]): Player {
    const connected = candidates.filter((p) => p.connected);
    const pool = connected.length > 0 ? connected : candidates;
    if (!this.lastCzarId) return pool[0];
    // Use the join order and choose the next human after the last Card Czar.
    const order = this.players.map((p) => p.id);
    const lastIndex = order.indexOf(this.lastCzarId);
    const sorted = [...pool].sort((a, b) => {
      const da = (order.indexOf(a.id) - lastIndex - 1 + order.length) % order.length;
      const db = (order.indexOf(b.id) - lastIndex - 1 + order.length) % order.length;
      return da - db;
    });
    return sorted[0];
  }

  private markIdle(p: Player): void {
    if (p.isBot) return;
    p.idleRounds += 1;
    if (p.idleRounds >= IDLE_ROUNDS_BEFORE_KICK && !this.pendingKicks.includes(p.id)) {
      this.pendingKicks.push(p.id);
    }
  }

  private refill(p: Player): void {
    while (p.hand.length < HAND_SIZE) {
      const card = this.whitePile?.take();
      if (!card) break;
      p.hand.push(card);
    }
  }

  private syncBots(): void {
    const bots = this.players.filter((p) => p.isBot);
    if (bots.length > this.settings.botCount) {
      const remove = new Set(bots.slice(this.settings.botCount).map((b) => b.id));
      this.players = this.players.filter((p) => !remove.has(p.id));
    }
    for (let i = bots.length; i < this.settings.botCount; i++) {
      this.players.push(this.makePlayer(this.nextBotName(), true));
    }
  }

  /** A random free name from the bot list. "Bot N" only when all of them are taken. */
  private nextBotName(): string {
    const taken = new Set(this.players.map((p) => p.name));
    const free = BOT_PROFILES.filter((b) => !taken.has(b.name));
    if (free.length > 0) return shuffle(free, this.rng)[0].name;
    this.botSeq += 1;
    return `Bot ${this.botSeq}`;
  }

  private deck(id: string): Deck | undefined {
    return this.externalDecks.get(id) ?? this.decks.get(id);
  }

  private checkName(rawName: string): string {
    const name = cleanText(rawName, NAME_MAX);
    if (name.length === 0) throw new GameError("NAME_INVALID");
    if (isReservedName(name)) throw new GameError("NAME_RESERVED");
    const lower = name.toLowerCase();
    if ([...this.players, ...this.spectators].some((p) => p.name.toLowerCase() === lower)) {
      throw new GameError("NAME_TAKEN");
    }
    return name;
  }

  private checkCanJoin(): void {
    if (this.humans().length >= this.settings.maxPlayers) throw new GameError("ROOM_FULL");
    if (this.phase !== "lobby" && this.phase !== "gameOver" && !this.settings.allowLateJoin) {
      throw new GameError("LATE_JOIN_DISABLED");
    }
  }

  private makePlayer(name: string, isBot: boolean): Player {
    return { id: this.newId(), name, isBot, score: 0, hand: [], connected: true, idleRounds: 0 };
  }

  private statusOf(p: Player): PlayerStatus {
    const round = this.round;
    if (!round || this.phase === "lobby" || this.phase === "gameOver") return "idle";
    if (round.czarId === p.id) return "czar";
    if (round.missed.has(p.id)) return "missed";
    if (!round.participants.has(p.id)) return "waiting";
    if (round.submissions.some((s) => s.playerId === p.id)) return "submitted";
    return "playing";
  }

  private allSubmitted(round: Round): boolean {
    return round.submissions.length >= round.participants.size;
  }

  private leader(): string | null {
    let best: Player | null = null;
    for (const p of this.players) if (!best || p.score > best.score) best = p;
    return best && best.score > 0 ? best.id : null;
  }

  private humans(): Player[] {
    return this.players.filter((p) => !p.isBot);
  }

  private find(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  private requireHost(id: string): void {
    if (id !== this.hostId) throw new GameError("NOT_HOST");
  }

  /** Adds an entry to the room's activity log. */
  private setNotice(text: string, tone: Notice["tone"] = "info"): void {
    this.noticeSeq += 1;
    this.log = [...this.log, { id: this.noticeSeq, text, tone, at: Date.now() }].slice(-LOG_KEPT);
  }

  private schedule(ms: number, fn: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) fn();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private changed(): void {
    if (!this.disposed) this.onChange();
  }
}
