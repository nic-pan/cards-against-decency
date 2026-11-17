// Messages between the browser and the server. Types only: safe to import in the client.
import type { GameView, Settings } from "../engine/game";

export type { GameView, Settings };
export type { PublicPlayer, SubmissionView, RoundView, PlayerStatus } from "../engine/game";
export type { WhiteCard, BlackCard, DeckSummary } from "../engine/deck";

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string; message?: string };

export interface JoinResult {
  code: string;
  token: string;
  playerId: string;
}

export interface ClientToServer {
  "room:create": (p: { name: string; password?: string }, ack: (r: Ack<JoinResult>) => void) => void;
  "room:join": (p: { code: string; name: string; password?: string }, ack: (r: Ack<JoinResult>) => void) => void;
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
  "player:kick": (p: { playerId: string; ban: boolean }, ack: (r: Ack) => void) => void;
}

export interface ServerToClient {
  state: (view: GameView & { code: string }) => void;
  /** You were removed from the room. */
  removed: (p: { reason: "kicked" | "banned" | "closed" }) => void;
}

/** Plain-language messages for error codes. */
export const ERROR_TEXT: Record<string, string> = {
  NOT_HOST: "Only the host can do that.",
  WRONG_PHASE: "You can't do that right now.",
  ROOM_FULL: "This room is full.",
  LATE_JOIN_DISABLED: "The game has started and the host does not allow late joining.",
  NAME_INVALID: "Enter a name.",
  NAME_TAKEN: "Somebody in this room already uses that name.",
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
};
