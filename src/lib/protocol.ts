// Messages between the browser and the server. Shared types and constants, safe to import in the client.
import type { GameSummary, GameView, Settings } from "../engine/game";

export type { GameView, Settings, GameSummary };
export type { SpectatorView } from "../engine/game";
export type { PublicPlayer, SubmissionView, RoundView, PlayerStatus } from "../engine/game";
export type { WhiteCard, BlackCard, DeckSummary } from "../engine/deck";

/**
 * Version of the Terms of Use and Privacy Notice that players accept.
 * Change it when the documents change. Players must then accept again.
 */
export const TERMS_VERSION = "draft-2026-11";

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string; message?: string };

export interface JoinResult {
  code: string;
  token: string;
  playerId: string;
}

/** One public room in the game list. */
export interface RoomListing extends Omit<GameSummary, "isPublic"> {
  code: string;
  hasPassword: boolean;
}

export type JoinAs = "player" | "spectator";

/** Players score "Offences". One Offence is one point. */
export function offences(n: number): string {
  return `${n} ${n === 1 ? "Offence" : "Offences"}`;
}

/** Where hosts find and build external decks. */
export const PACK_BROWSER_URL = "https://certifriedmultitool.com/cah/packs";
export const MANY_DECKS_URL = "https://decks.rereadgames.com";

/** The seat that this browser had before. The server frees it when the player moves on. */
export interface PreviousSeat {
  code: string;
  token: string;
}

export interface ClientToServer {
  /** Is this name free on the whole server? The player's own previous seat does not count. */
  "name:check": (p: { name: string; previous?: PreviousSeat }, ack: (r: Ack<{ available: boolean; reason?: string }>) => void) => void;
  /** Does this seat still exist? Used for the "You are still in a game" banner. */
  "room:seat": (p: PreviousSeat, ack: (r: Ack<{ valid: boolean; hostName?: string }>) => void) => void;
  /** Leave a seat by its token, without being connected to the room. Used by "Leave game" and "Log out". */
  "room:abandon": (p: PreviousSeat, ack: (r: Ack) => void) => void;
  "lobby:subscribe": (ack: (r: Ack<{ games: RoomListing[] }>) => void) => void;
  "lobby:unsubscribe": (ack: (r: Ack) => void) => void;
  "room:create": (p: { name: string; password?: string; isPublic?: boolean; termsVersion: string; previous?: PreviousSeat }, ack: (r: Ack<JoinResult>) => void) => void;
  "room:join": (p: { code: string; name: string; password?: string; as?: JoinAs; termsVersion: string; previous?: PreviousSeat }, ack: (r: Ack<JoinResult>) => void) => void;
  "room:resume": (p: { code: string; token: string }, ack: (r: Ack<JoinResult>) => void) => void;
  "room:leave": (ack: (r: Ack) => void) => void;
  "room:info": (p: { code: string }, ack: (r: Ack<{ exists: boolean; needsPassword: boolean }>) => void) => void;
  "settings:update": (p: Partial<Settings>, ack: (r: Ack) => void) => void;
  "game:start": (ack: (r: Ack) => void) => void;
  "game:end": (ack: (r: Ack) => void) => void;
  "game:lobby": (ack: (r: Ack) => void) => void;
  "card:submit": (p: { cardIds: string[] }, ack: (r: Ack) => void) => void;
  "czar:pick": (p: { submissionId: string }, ack: (r: Ack) => void) => void;
  "player:back": (ack: (r: Ack) => void) => void;
  /** The host imports a Many Decks deck into the room by its 5-character code. */
  "deck:add": (p: { code: string }, ack: (r: Ack<{ deckId: string; name: string }>) => void) => void;
  "deck:remove": (p: { deckId: string }, ack: (r: Ack) => void) => void;
  /** A spectator starts to play. */
  "player:play": (ack: (r: Ack) => void) => void;
  "player:kick": (p: { playerId: string; ban: boolean }, ack: (r: Ack) => void) => void;
  /** The host removes a bot. In the lobby this lowers the bot count. */
  "bot:remove": (p: { playerId: string }, ack: (r: Ack) => void) => void;
  /** The host adds a bot. During a game, only up to the bot count set before the start. */
  "bot:add": (ack: (r: Ack) => void) => void;
  /** The host lifts a ban. The person can join again, with any name. */
  "player:unban": (p: { banId: string }, ack: (r: Ack) => void) => void;
}

export interface ServerToClient {
  /** The public game list changed. Sent only to sockets that subscribed. */
  lobby: (p: { games: RoomListing[] }) => void;
  /** bans is empty for everybody but the host. */
  state: (view: GameView & { code: string; bans: { id: string; name: string }[] }) => void;
  /** Another player was removed, by the host or for being idle. Everybody else sees and hears it. */
  "player:removed": (p: { playerId: string; name: string; reason: "kicked" | "banned" | "idle" }) => void;
  /** You were removed from the room. */
  removed: (p: { reason: "kicked" | "banned" | "closed" | "left" | "idle" }) => void;
}

/** Plain-language messages for error codes. */
/** The bot-name message has a title and a body, so the name field can show it in two parts. */
export const NAME_RESERVED_TEXT = {
  title: "That name is classified.",
  body: "One of our agencies has already claimed it. Changing the capitalisation or adding punctuation won't fool anyone. Try another name.",
};

export const ERROR_TEXT: Record<string, string> = {
  NOT_HOST: "Only the host can do that.",
  WRONG_PHASE: "You can't do that right now.",
  ROOM_FULL: "This room is full.",
  LATE_JOIN_DISABLED: "The game has started and the host does not allow late joining.",
  NAME_INVALID: "Enter a name.",
  NAME_TAKEN: "Somebody is already playing with that name. Choose another name.",
  NAME_RESERVED: `${NAME_RESERVED_TEXT.title} ${NAME_RESERVED_TEXT.body}`,
  NOT_ENOUGH_PLAYERS: "You need at least 3 players. Add bots or invite more friends.",
  NOT_ENOUGH_CARDS: "The selected decks do not have enough cards.",
  NO_DECKS: "Select at least one deck.",
  UNKNOWN_DECK: "That deck does not exist.",
  NOT_A_PARTICIPANT: "You are not playing in this round.",
  ALREADY_SUBMITTED: "You already submitted.",
  BAD_CARDS: "Choose the right number of cards from your hand.",
  NOT_CZAR: "Only the Card Czar can choose.",
  UNKNOWN_SUBMISSION: "That answer no longer exists.",
  BAD_SETTINGS: "Those settings are not valid.",
  ROOM_NOT_FOUND: "This room does not exist or has closed.",
  BAD_PASSWORD: "Wrong room password.",
  BANNED: "You can't join this room.",
  RATE_LIMITED: "Slow down a little and try again.",
  BAD_REQUEST: "That request was not valid.",
  NOT_IN_ROOM: "You are not in a room.",
  SESSION_EXPIRED: "Your session has expired. Join again.",
  SPECTATORS_FULL: "This game has no free spectator seats.",
  TOO_MANY_DECKS: "A game can have at most 10 imported decks.",
  BAD_DECK_CODE: "Deck codes have 5 letters or numbers, for example 1ZW29.",
  DECK_NOT_FOUND: "No deck has that code. Check the code and try again.",
  DECK_FETCH_FAILED: "Many Decks did not answer. Try again in a moment.",
  DECK_EMPTY: "That deck has no usable cards.",
  TOO_MANY_BOTS: "The game already has as many bots as were set before the start.",
  TERMS_REQUIRED: "Accept the Terms of Use and the Privacy Notice to play.",
};
