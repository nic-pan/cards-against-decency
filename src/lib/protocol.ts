// Messages between the browser and the server. Shared types and constants, safe to import in the client.
import type { GameSummary, GameView, Settings } from "../engine/game";

export type { GameView, Settings, GameSummary };
export type { AudienceVoteView, LastRoundView, RoleSwitchView, SpectatorView, VoteView } from "../engine/game";
export type { PublicPlayer, SubmissionView, RoundView, PlayerStatus } from "../engine/game";
export type { WhiteCard, BlackCard, DeckSummary } from "../engine/deck";

/**
 * Version of the Terms of Use and Privacy Notice that players accept: the date of the last change that matters.
 * Change it, and the "Last updated" date on both pages, when the documents change. Players must then accept again.
 */
// v2 has its own label, so it never matches a label that v1 players accepted. v2's Terms and Privacy
// Notice add rules (votes, the audience vote), so every v1 player must accept again when v2 goes live.
// On v2's launch day, set it to "v2-<launch date>" and update the "Last updated" dates.
// When a merge from main conflicts here, keep a label that starts with "v2-".
export const TERMS_VERSION = "v2-2026-11-21";

/** A room that waits this long between games closes. Keep in sync with LOBBY_MAX_MS in src/engine/game.ts. */
export const LOBBY_MAX_MINUTES = 30;
/** The room asks "Is anyone still here?" this long before it closes. Keep in sync with LOBBY_WARNING_MS. */
export const LOBBY_WARNING_SECONDS = 120;

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

/** Where an online person is. Never which room. */
export type OnlineStatus = "playing" | "watching" | "browsing";

export interface OnlineUser {
  /** Opaque id for blocking. It changes when the server restarts. */
  handle: string;
  name: string;
  status: OnlineStatus;
  you: boolean;
  /** The viewer blocked this person. */
  blocked: boolean;
}

/** Who this browser is. Sent when the socket connects (as auth) and with identity:update. */
export interface IdentityPayload {
  name?: string;
  browser: string;
  /** Sealed blocks from block:create. Only the server can read them. */
  blocks?: string[];
}

export interface ClientToServer {
  /** The name or the blocks changed. */
  "identity:update": (p: IdentityPayload, ack: (r: Ack) => void) => void;
  /** Block someone from the online list (handle) or from your room (playerId). Store the token and send it back with your identity. */
  "block:create": (p: { handle?: string; playerId?: string }, ack: (r: Ack<{ token: string; name: string }>) => void) => void;
  /** Reports a name from the online list. Reports from 3 networks hide the name in the public lists. */
  "name:report": (p: { handle: string }, ack: (r: Ack) => void) => void;
  /** A bug report or an idea for the developer. */
  "feedback:send": (
    p: { type: "bug" | "idea" | "other"; message: string; email?: string; page: "home" | "game" | "info"; website?: string },
    ack: (r: Ack) => void,
  ) => void;
  /** Is this name free on the whole server? The player's own previous seat does not count. */
  "name:check": (p: { name: string; previous?: PreviousSeat }, ack: (r: Ack<{ available: boolean; reason?: string }>) => void) => void;
  /** Does this seat still exist? Used for the "You are still in a game" banner. */
  "room:seat": (p: PreviousSeat, ack: (r: Ack<{ valid: boolean; hostName?: string }>) => void) => void;
  /** Leave a seat by its token, without being connected to the room. Used by "Leave game" and "Log out". */
  "room:abandon": (p: PreviousSeat, ack: (r: Ack) => void) => void;
  "lobby:subscribe": (ack: (r: Ack<{ games: RoomListing[]; online: OnlineUser[] }>) => void) => void;
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
  /** The player takes back their answer before judging starts. Once in each round. */
  "card:takeBack": (ack: (r: Ack) => void) => void;
  "czar:pick": (p: { submissionId: string }, ack: (r: Ack) => void) => void;
  /** A player or spectator votes for the best answer while the Card Czar is gone. */
  "audience:vote": (p: { submissionId: string }, ack: (r: Ack) => void) => void;
  "player:back": (ack: (r: Ack) => void) => void;
  /** The host imports a Many Decks deck into the room by its 5-character code. */
  "deck:add": (p: { code: string }, ack: (r: Ack<{ deckId: string; name: string }>) => void) => void;
  "deck:remove": (p: { deckId: string }, ack: (r: Ack) => void) => void;
  /** A spectator starts to play. */
  "player:play": (ack: (r: Ack) => void) => void;
  /** A player asks to watch, or a spectator asks to play. During a game it applies when the round ends. A second call cancels. */
  "member:switch": (ack: (r: Ack) => void) => void;
  "player:kick": (p: { playerId: string; ban: boolean }, ack: (r: Ack) => void) => void;
  /** A player or spectator keeps a waiting room open for another 30 minutes. */
  "room:keepOpen": (ack: (r: Ack) => void) => void;
  /** A player starts a vote to remove another player. Not for the host, who can remove players directly. */
  "vote:start": (p: { playerId: string }, ack: (r: Ack) => void) => void;
  /** A voter votes yes or no in the open vote. */
  "vote:cast": (p: { yes: boolean }, ack: (r: Ack) => void) => void;
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
  /** Who is online. Sent with the game list, only to sockets that subscribed. */
  online: (p: { users: OnlineUser[] }) => void;
  /** bans is empty for everybody but the host. */
  state: (view: GameView & { code: string; bans: { id: string; name: string }[] }) => void;
  /** Another player was removed, by the host, by a vote or for being idle. Everybody else sees and hears it. */
  "player:removed": (p: { playerId: string; name: string; reason: "kicked" | "kickedAgain" | "banned" | "idle" | "voted" }) => void;
  /** You were removed from the room. */
  /** "lobbyExpired": nobody started a game or kept the room open for 30 minutes. */
  /** times and cooldownMs come with "kicked": the removal count from this connection, and the wait before rejoining. "voted" has cooldownMs. */
  removed: (p: { reason: "kicked" | "banned" | "closed" | "lobbyExpired" | "left" | "idle" | "voted"; times?: number; cooldownMs?: number }) => void;
}

/** Plain-language messages for error codes. */
/** The bot-name message has a title and a body, so the name field can show it in two parts. */
export const NAME_RESERVED_TEXT = {
  title: "That name is classified.",
  body: "One of our agencies has already claimed it. Changing the capitalisation or adding punctuation won't fool anyone. Try another name.",
};

/** The message for a name that the filter blocks. It does not say which word matched. */
export const NAME_BLOCKED_TEXT = {
  title: "Choose a different name.",
  body: "Crude is fine. Slurs, hate symbols, links, contact details and fake staff names are not. Everyone in the game list sees your name.",
};

/** The short-name message, in the same two parts. */
export const NAME_TOO_SHORT_TEXT = {
  title: "That's hardly a name.",
  body: "Your identity needs at least 3 characters. We're running a game, not a witness protection programme.",
};

/** Feedback limits. The server checks them again. */
export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 1000;
export const FEEDBACK_PER_HOUR = 3;

export const ERROR_TEXT: Record<string, string> = {
  FEEDBACK_TOO_SHORT: `Write at least ${FEEDBACK_MIN} characters.`,
  FEEDBACK_TOO_LONG: `Write at most ${FEEDBACK_MAX} characters.`,
  FEEDBACK_BAD_EMAIL: "That email address does not look right. Check it, or leave the field empty.",
  FEEDBACK_LIMIT: `You can send ${FEEDBACK_PER_HOUR} reports in an hour. Try again later.`,
  NOT_HOST: "Only the host can do that.",
  WRONG_PHASE: "You can't do that right now.",
  ROOM_FULL: "This room is full.",
  LATE_JOIN_DISABLED: "The game has started and the host does not allow late joining.",
  NAME_INVALID: "Enter a name.",
  NAME_TOO_SHORT: `${NAME_TOO_SHORT_TEXT.title} ${NAME_TOO_SHORT_TEXT.body}`,
  NAME_TAKEN: "Somebody is already playing with that name. Choose another name.",
  NAME_RESERVED: `${NAME_RESERVED_TEXT.title} ${NAME_RESERVED_TEXT.body}`,
  NAME_BLOCKED: `${NAME_BLOCKED_TEXT.title} ${NAME_BLOCKED_TEXT.body}`,
  NOT_ENOUGH_PLAYERS: "You need at least 3 players. Add bots or invite more friends.",
  NOT_ENOUGH_CARDS: "The selected decks do not have enough cards.",
  NO_DECKS: "Select at least one deck.",
  UNKNOWN_DECK: "That deck does not exist.",
  NOT_A_PARTICIPANT: "You are not playing in this round.",
  ALREADY_SUBMITTED: "You already submitted.",
  NOT_SUBMITTED: "You have not played a card in this round.",
  TAKE_BACK_USED: "You already changed your answer in this round.",
  BAD_CARDS: "Choose the right number of cards from your hand.",
  NOT_CZAR: "Only the Card Czar can choose.",
  UNKNOWN_SUBMISSION: "That answer no longer exists.",
  BAD_SETTINGS: "Those settings are not valid.",
  ROOM_NOT_FOUND: "This room does not exist or has closed.",
  BAD_PASSWORD: "Wrong room password.",
  BANNED: "You can't join this room.",
  BLOCKED_IN_ROOM: "Someone you blocked is in this game. Unblock them on the game list first.",
  REMOVAL_COOLDOWN: "The host removed you from this room 3 times. You can join again in a few minutes.",
  HOSTED_GAMES_LIMIT: "Your network already hosts as many games as it can. Join one of them, or close one first.",
  RATE_LIMITED: "Slow down a little and try again.",
  BAD_REQUEST: "That request was not valid.",
  NOT_IN_ROOM: "You are not in a room.",
  SESSION_EXPIRED: "Your session has expired. Join again.",
  SPECTATORS_FULL: "This game has no free spectator seats.",
  SWITCH_DURING_VOTE: "The players are voting on whether to remove you. You can switch when the vote ends.",
  SWITCH_TOO_FEW: "The game needs at least 3 players. You can switch between games, or when more people play.",
  TOO_MANY_DECKS: "A game can have at most 10 imported decks.",
  BAD_DECK_CODE: "Deck codes have 5 letters or numbers, for example 1ZW29.",
  DECK_NOT_FOUND: "No deck has that code. Check the code and try again.",
  DECK_FETCH_FAILED: "Many Decks did not answer. Try again in a moment.",
  DECK_EMPTY: "That deck has no usable cards.",
  TOO_MANY_BOTS: "The game already has as many bots as were set before the start.",
  TERMS_REQUIRED: "Accept the Terms of Use and the Privacy Notice to play.",
  VOTE_IN_PROGRESS: "A vote is already open. Wait until it ends.",
  VOTE_TOO_FEW: "A vote needs at least 3 players.",
  VOTE_COOLDOWN: "Your last vote failed. You can start another one in 2 minutes.",
  NO_VOTE: "That vote has ended.",
  NOT_A_VOTER: "You can't vote in this vote.",
  NO_AUDIENCE_VOTE: "The vote for the best answer has ended.",
  NETWORK_VOTED: "Someone on your network already voted. People on the same Wi-Fi share one vote.",
  OWN_ANSWER: "You can't vote for your own answer, or for an answer from your network.",
  VOTED_OUT_COOLDOWN: "The players voted you out of this room. You can join again in a few minutes.",
};
