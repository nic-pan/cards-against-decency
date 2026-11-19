import { randomBytes } from "node:crypto";
import { BlackCard, Deck, DeckRegistry, DeckSummary, Pile, Rng, WhiteCard, shuffle, summarize } from "./deck";
import { BOT_PROFILES, botProfile, isBotName } from "./bots";

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
export const NAME_MAX = 16; // Fits on one line in the players list. Keep in sync with ProfileForm.tsx.
export const NAME_MIN = 3; // Keep in sync with ProfileForm.tsx.
/** Maximum number of imported decks in one room. */
export const MAX_EXTERNAL_DECKS = 10;
/** A room that waits this long in the lobby or on the game-over screen closes. Players can keep it open. */
export const LOBBY_MAX_MS = 30 * 60_000;
/** The room warns everybody this long before it closes. */
export const LOBBY_WARNING_MS = 2 * 60_000;
/** Seconds that a vote to remove a player stays open. */
export const VOTE_SECONDS = 60;
/** After a failed vote, its starter waits this long before they can start another one. */
export const VOTE_COOLDOWN_MS = 2 * 60_000;
/**
 * A vote needs human players from at least this many networks (voter keys) in the room, the target included.
 * One person with two seats on one network cannot outvote a host alone.
 */
export const VOTE_MIN_NETWORKS = 3;

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
  | "NAME_TOO_SHORT"
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
  | "TOO_MANY_BOTS"
  | "VOTE_IN_PROGRESS"
  | "VOTE_TOO_FEW"
  | "VOTE_COOLDOWN"
  | "NO_VOTE"
  | "NOT_A_VOTER";

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

/**
 * A vote of the players to remove one player. One vote at a time.
 * Votes count per voter key (one network), not per seat: yes and no hold voter keys.
 */
interface Vote {
  targetId: string;
  startedBy: string;
  yes: Set<string>;
  no: Set<string>;
  deadline: number;
}

/** One entry in the room's activity log. */
export interface Notice {
  id: number;
  text: string;
  /**
   * "danger" entries show in red, for example when a player is removed for being idle.
   * "bot" entries announce a bot and look different from the lines about people.
   */
  tone: "info" | "danger" | "bot";
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

/** The open vote, as one person sees it. */
export interface VoteView {
  targetId: string;
  targetName: string;
  startedByName: string;
  yes: number;
  no: number;
  /** Yes votes that remove the player: more than half of the voters. One vote for each network. */
  needed: number;
  deadline: number;
  /** Your vote. Null when you did not vote or cannot vote. */
  yourVote: "yes" | "no" | null;
  /** False for the target, spectators and bots. */
  canVote: boolean;
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
  /** The open vote to remove a player, or null. */
  vote: VoteView | null;
  /** Server time when the room closes if nobody starts a game or keeps it open. Null during a game. */
  lobbyClosesAt: number | null;
  decks: DeckSummary[];
  serverNow: number;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

/**
 * "kickedAgain": the host removed this connection from the room for the 3rd time or more.
 * "voted": the players voted to remove this player.
 */
export type RemoveReason = "left" | "kicked" | "kickedAgain" | "banned" | "timeout" | "idle" | "voted";

export interface GameOptions {
  decks: DeckRegistry;
  rng?: Rng;
  /** Called after every state change. The server broadcasts new views. */
  onChange?: () => void;
  /** Called when the last human leaves. The server closes the room. */
  onEmpty?: () => void;
  /** Called when the game removes a player. The server uses it to tell an idle player why. */
  onRemoved?: (playerId: string, why: RemoveReason, name: string) => void;
  /**
   * The voter key of a player: the same key for all seats on one network (the server uses the hashed IP).
   * Votes count once for each key. Without it, each player is their own key.
   */
  voterKey?: (playerId: string) => string;
  /** Called when the room waited too long in the lobby or on the game-over screen. The server closes the room. */
  onLobbyExpired?: () => void;
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
  private readonly voterKey: (playerId: string) => string;
  private readonly onLobbyExpired: () => void;

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
  private vote: Vote | null = null;
  private voteTimer: ReturnType<typeof setTimeout> | null = null;
  private lobbyTimer: ReturnType<typeof setTimeout> | null = null;
  private lobbyDeadline: number | null = null;
  /** Voter key -> the time when that network can start a vote again. */
  private voteCooldowns = new Map<string, number>();

  constructor(opts: GameOptions) {
    this.decks = opts.decks;
    this.rng = opts.rng ?? Math.random;
    this.onChange = opts.onChange ?? (() => {});
    this.onEmpty = opts.onEmpty ?? (() => {});
    this.onRemoved = opts.onRemoved ?? (() => {});
    this.newId = opts.idFactory ?? randomId;
    this.voterKey = opts.voterKey ?? ((id) => id);
    this.onLobbyExpired = opts.onLobbyExpired ?? (() => {});
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
    this.restartLobbyClock();
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
    this.restartLobbyClock();
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
    this.removeMember(id, why);
    // A removal can decide or cancel the open vote. This runs after the removal is complete.
    this.settleVote();
  }

  private removeMember(id: string, why: RemoveReason): void {
    const spectator = this.spectators.find((s) => s.id === id);
    if (spectator) {
      this.spectators = this.spectators.filter((s) => s.id !== id);
      if (why === "banned") this.setNotice(`${spectator.name} was banned from this game room.`, "danger");
      else if (why === "kickedAgain") this.setNotice(`${spectator.name} was removed. The host has had enough. Understandably.`, "danger");
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
        : why === "kickedAgain"
          ? "was removed. The host has had enough. Understandably"
          : why === "banned"
          ? "was banned from this game room"
          : why === "timeout"
          ? "lost connection"
          : why === "idle"
            ? `was removed for missing ${IDLE_ROUNDS_BEFORE_KICK} rounds in a row`
            : why === "voted"
              ? "was voted out by the players"
              : "left";
    const danger = why === "idle" || why === "banned" || why === "kickedAgain" || why === "voted";
    this.setNotice(`${player.name} ${verb}.`, danger ? "danger" : "info");

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

  /** The current host's id. Empty in a room with no humans. */
  host(): string {
    return this.hostId;
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
    this.announceBot(bot.name);
    // Like a late joiner: cards now, play from the next round.
    if (this.whitePile) this.refill(bot);
    this.players.push(bot);
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

  // ----- Lobby clock ---------------------------------------------------

  /** A player or spectator keeps a waiting room open for another LOBBY_MAX_MS. */
  keepOpen(byId: string): void {
    const name = this.find(byId)?.name ?? this.spectators.find((s) => s.id === byId)?.name;
    if (!name) throw new GameError("UNKNOWN_PLAYER");
    if (this.phase !== "lobby" && this.phase !== "gameOver") throw new GameError("WRONG_PHASE");
    this.restartLobbyClock();
    this.setNotice(`${name} kept the room open.`);
    this.changed();
  }

  /** Starts the lobby clock again from now. Only while the room waits between games. */
  private restartLobbyClock(): void {
    this.stopLobbyClock();
    this.syncLobbyClock();
  }

  /** Runs the lobby clock while the room waits between games, and stops it during a game. */
  private syncLobbyClock(): void {
    if (this.disposed) return;
    const waiting = this.phase === "lobby" || this.phase === "gameOver";
    if (!waiting) {
      this.stopLobbyClock();
      return;
    }
    if (this.lobbyDeadline !== null) return;
    this.lobbyDeadline = Date.now() + LOBBY_MAX_MS;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      if (!this.disposed) this.onLobbyExpired();
    }, LOBBY_MAX_MS);
  }

  private stopLobbyClock(): void {
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    this.lobbyTimer = null;
    this.lobbyDeadline = null;
  }

  // ----- Votes ---------------------------------------------------------

  /** A player starts a vote to remove another human player. The starter votes yes. */
  startVote(byId: string, targetId: string): void {
    const starter = this.find(byId);
    if (!starter || starter.isBot) throw new GameError("NOT_A_VOTER");
    const target = this.find(targetId);
    if (!target || target.isBot || target.id === byId) throw new GameError("UNKNOWN_PLAYER");
    if (this.vote) throw new GameError("VOTE_IN_PROGRESS");
    if (new Set(this.humans().map((p) => this.voterKey(p.id))).size < VOTE_MIN_NETWORKS) {
      throw new GameError("VOTE_TOO_FEW");
    }
    const key = this.voterKey(byId);
    // A seat on the target's own network cannot vote against them.
    if (key === this.voterKey(targetId)) throw new GameError("NOT_A_VOTER");
    if ((this.voteCooldowns.get(key) ?? 0) > Date.now()) throw new GameError("VOTE_COOLDOWN");

    this.vote = { targetId, startedBy: byId, yes: new Set([key]), no: new Set(), deadline: Date.now() + VOTE_SECONDS * 1000 };
    this.setNotice(`${starter.name} started a vote to remove ${target.name}.`);
    this.voteTimer = setTimeout(() => {
      this.voteTimer = null;
      if (!this.disposed) this.failVote("The vote ended without enough yes votes.");
    }, VOTE_SECONDS * 1000);
    if (!this.settleVote()) this.changed();
  }

  /** A voter votes yes or no. A later vote from the same network replaces the earlier one. */
  castVote(byId: string, yes: boolean): void {
    const vote = this.vote;
    if (!vote) throw new GameError("NO_VOTE");
    if (!this.canVote(byId)) throw new GameError("NOT_A_VOTER");
    const key = this.voterKey(byId);
    (yes ? vote.no : vote.yes).delete(key);
    (yes ? vote.yes : vote.no).add(key);
    if (!this.settleVote()) this.changed();
  }

  /** The networks that can vote: those of the human players, except the target's network. */
  private voterKeys(): Set<string> {
    if (!this.vote) return new Set();
    const targetKey = this.voterKey(this.vote.targetId);
    const keys = new Set(this.humans().map((p) => this.voterKey(p.id)));
    keys.delete(targetKey);
    return keys;
  }

  private canVote(playerId: string): boolean {
    const player = this.find(playerId);
    return !!player && !player.isBot && player.id !== this.vote?.targetId && this.voterKeys().has(this.voterKey(playerId));
  }

  /** Counts the yes and no votes of networks that can still vote, and the yes votes needed. */
  private tally(): { yes: number; no: number; needed: number; voters: number } {
    const keys = this.voterKeys();
    const vote = this.vote!;
    return {
      yes: [...vote.yes].filter((k) => keys.has(k)).length,
      no: [...vote.no].filter((k) => keys.has(k)).length,
      needed: Math.floor(keys.size / 2) + 1,
      voters: keys.size,
    };
  }

  /** Ends the open vote when it passed, cannot pass any more, or has too few players. Returns true when it ended. */
  private settleVote(): boolean {
    const vote = this.vote;
    if (!vote || this.disposed) return false;
    const target = this.find(vote.targetId);
    if (!target) {
      // The target left. Nothing to decide.
      this.clearVote();
      this.changed();
      return true;
    }
    if (new Set(this.humans().map((p) => this.voterKey(p.id))).size < VOTE_MIN_NETWORKS) {
      this.clearVote();
      this.setNotice("The vote was cancelled. There are not enough players.");
      this.changed();
      return true;
    }
    const { yes, no, needed, voters } = this.tally();
    if (yes >= needed) {
      this.clearVote();
      this.removePlayer(target.id, "voted");
      return true;
    }
    if (voters - no < needed) {
      this.failVote(`The vote to remove ${target.name} failed.`);
      return true;
    }
    return false;
  }

  private failVote(message: string): void {
    const vote = this.vote;
    if (!vote) return;
    this.voteCooldowns.set(this.voterKey(vote.startedBy), Date.now() + VOTE_COOLDOWN_MS);
    this.clearVote();
    this.setNotice(message);
    this.changed();
  }

  private clearVote(): void {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimer = null;
    this.vote = null;
  }

  private voteViewFor(viewerId: string): VoteView | null {
    const vote = this.vote;
    if (!vote) return null;
    const { yes, no, needed } = this.tally();
    const canVote = this.canVote(viewerId);
    const key = this.voterKey(viewerId);
    return {
      targetId: vote.targetId,
      targetName: this.find(vote.targetId)?.name ?? "",
      startedByName: this.find(vote.startedBy)?.name ?? "Someone who left",
      yes,
      no,
      needed,
      deadline: vote.deadline,
      yourVote: !canVote ? null : vote.yes.has(key) ? "yes" : vote.no.has(key) ? "no" : null,
      canVote,
    };
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
      vote: this.voteViewFor(playerId),
      lobbyClosesAt: this.lobbyDeadline,
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
    this.clearVote();
    this.stopLobbyClock();
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
      const bot = this.makePlayer(this.nextBotName(), true);
      this.players.push(bot);
      this.announceBot(bot.name);
    }
  }

  /** Writes the bot's own arrival line to the activity log. */
  private announceBot(name: string): void {
    this.setNotice(botProfile(name)?.arrival ?? `${name} joined.`, "bot");
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
    if ([...name].length < NAME_MIN) throw new GameError("NAME_TOO_SHORT");
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

  /** The player with the most Offences. Null when nobody scored, or when two or more share the top score (a draw). */
  private leader(): string | null {
    const top = Math.max(0, ...this.players.map((p) => p.score));
    const leaders = this.players.filter((p) => p.score === top);
    return top > 0 && leaders.length === 1 ? leaders[0].id : null;
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
    if (this.disposed) return;
    // Every phase change passes here, so the lobby clock starts and stops with the phase.
    this.syncLobbyClock();
    this.onChange();
  }
}
