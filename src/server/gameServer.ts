import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z, ZodError } from "zod";
import { DeckRegistry } from "../engine/deck";
import { Game, GameError, LIMITS, NAME_MAX, NAME_MIN, isReservedName, nameKey } from "../engine/game";
import { isBlockedName } from "../engine/nameFilter";
import { TERMS_VERSION, type ClientToServer, type OnlineStatus, type OnlineUser, type RoomListing, type ServerToClient } from "../lib/protocol";
import { TokenBucket, WindowCounter } from "./rateLimit";
import { ipKey, securityLog } from "./securityLog";
import { DeckImportError, fetchManyDeck, normalizeCode } from "./manyDecks";
import { clientIpFrom, ipHeaderFromEnv, trustedHopsFromEnv } from "./clientIp";
import { BlockSeal, hasBlocked, identityInput, type Identity } from "./identity";
import { browserSummary, feedbackSenderFromEnv, type FeedbackSender } from "./feedback";
import { APP_VERSION } from "../lib/site";
import { FEEDBACK_MAX, FEEDBACK_MIN, FEEDBACK_PER_HOUR } from "../lib/protocol";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Time a disconnected player keeps their seat. */
export const RECONNECT_GRACE_MS = 90_000;
/** A room with no player actions for this long closes. */
export const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;
/** No 0/O or 1/I/L, so people can read codes aloud. 31^6 is about 887 million codes. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const PASSWORD_MAX = 64;

// ---------------------------------------------------------------------------
// Room storage
// ---------------------------------------------------------------------------

export interface Room {
  code: string;
  game: Game;
  password: { salt: Buffer; hash: Buffer } | null;
  /** Session token -> player id. Tokens are the only proof of identity. */
  tokens: Map<string, string>;
  /** Player id -> connected socket ids. One player can have several tabs. */
  sockets: Map<string, Set<string>>;
  /** Secret for this room's IP hashes. It lives only in memory and disappears with the room. */
  salt: Buffer;
  /** Player id -> hashed IP of the last connection (with the room's salt). Used for bans and the hosted-games limit. */
  ipKeys: Map<string, string>;
  /** Ban id -> ban. Exists only while the room exists. */
  bans: Map<string, Ban>;
  /** Hashed IP -> how often the host removed someone from this connection. */
  removals: Map<string, number>;
  /** Hashed IP -> time (ms) until which this connection cannot join the room again. */
  cooldowns: Map<string, number>;
  /** Member id -> who they are and whom they blocked. Used to keep blocked people apart. */
  who: Map<string, Identity>;
  removeTimers: Map<string, ReturnType<typeof setTimeout>>;
  lastActivity: number;
  broadcastQueued: boolean;
  closed: boolean;
}

/** A ban blocks the player's hashed IP address and their sessions, whatever name they use next. */
export interface Ban {
  id: string;
  /** The name at the time of the ban. Shown to the host for unbanning. */
  name: string;
  ipHash: string | null;
  tokens: string[];
}

/** After this many removals by the host, a connection must wait before it joins the room again. */
export const REMOVALS_BEFORE_COOLDOWN = 3;
export const REMOVAL_COOLDOWN_MS = 5 * 60_000;

/** Hashes an IP address with the room's salt. The hash stays the same for the life of the room. */
function roomIpHash(room: Room, ip: string): string {
  return createHash("sha256").update(room.salt).update(ip).digest("base64url").slice(0, 22);
}

function isBanned(room: Room, ip: string | null, token: string | null): boolean {
  const ipHash = ip ? roomIpHash(room, ip) : null;
  for (const ban of room.bans.values()) {
    if (ipHash && ban.ipHash === ipHash) return true;
    if (token && ban.tokens.includes(token)) return true;
  }
  return false;
}

/** Live rooms. Replace this with a shared store when the game runs on more than one server. */
export interface RoomStore {
  get(code: string): Room | undefined;
  set(room: Room): void;
  delete(code: string): void;
  all(): Iterable<Room>;
}

export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();
  get(code: string) {
    return this.rooms.get(code);
  }
  set(room: Room) {
    this.rooms.set(room.code, room);
  }
  delete(code: string) {
    this.rooms.delete(code);
  }
  all() {
    return this.rooms.values();
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const name = z.string().min(1).max(NAME_MAX * 2);
const code = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().length(CODE_LENGTH).regex(/^[A-Z0-9]+$/));
const password = z.string().max(PASSWORD_MAX).optional();
const id = z.string().min(1).max(64);
const int = (k: keyof typeof LIMITS) => z.number().int().min(LIMITS[k].min).max(LIMITS[k].max);

const schemas = {
  create: z.object({
    name,
    password,
    isPublic: z.boolean().optional(),
    termsVersion: z.string().max(40).optional(),
    previous: z.object({ code, token: z.string().min(20).max(100) }).optional(),
  }),
  join: z.object({
    code,
    name,
    password,
    as: z.enum(["player", "spectator"]).default("player"),
    termsVersion: z.string().max(40).optional(),
    previous: z.object({ code, token: z.string().min(20).max(100) }).optional(),
  }),
  resume: z.object({ code, token: z.string().min(20).max(100) }),
  info: z.object({ code }),
  settings: z
    .object({
      deckIds: z.array(id).max(50),
      maxPlayers: int("maxPlayers"),
      botCount: int("botCount"),
      targetScore: int("targetScore"),
      submitSeconds: int("submitSeconds"),
      judgeSeconds: int("judgeSeconds"),
      allowLateJoin: z.boolean(),
      isPublic: z.boolean(),
      maxSpectators: int("maxSpectators"),
    })
    .partial()
    .strict(),
  submit: z.object({ cardIds: z.array(id).min(1).max(3) }),
  pick: z.object({ submissionId: id }),
  kick: z.object({ playerId: id, ban: z.boolean() }),
  deckAdd: z.object({ code: z.string().max(20) }),
  nameCheck: z.object({ name }),
  block: z.object({ handle: z.string().max(32).optional(), playerId: id.optional() }),
  report: z.object({ handle: z.string().min(1).max(32) }),
  feedback: z.object({
    type: z.enum(["bug", "idea", "other"]),
    message: z.string().max(FEEDBACK_MAX + 200),
    email: z.string().max(200).optional(),
    page: z.enum(["home", "game", "info"]),
    /** A hidden field. People never see it, so a value means a bot filled in the form. */
    website: z.string().max(500).optional(),
  }),
  deckRemove: z.object({ deckId: id }),
  unban: z.object({ banId: id }),
  botRemove: z.object({ playerId: id }),
};

/** Removes control characters and direction overrides. Keeps line breaks and tabs. */
function cleanFeedback(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
}

class RequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

interface SocketData {
  ip: string;
  bucket: TokenBucket;
  code?: string;
  playerId?: string;
  /** Sent by the page when it connects. Missing for old pages. */
  who?: Identity;
}

type IO = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export interface GameServerOptions {
  store?: RoomStore;
  /** Create, join, resume and leave actions each minute from one IP address. */
  joinsPerMinute?: number;
  /** Name and seat checks each minute from one IP address. They change nothing, so the limit is higher. */
  lookupsPerMinute?: number;
  /** Seals blocks. Defaults to the BLOCK_KEY environment variable. */
  blockSeal?: BlockSeal;
  /** Open games that one IP address can host at the same time. Defaults to HOSTED_GAMES_PER_IP, or 3. */
  hostedGamesPerIp?: number;
  /** Sends player feedback. Defaults to the Notion database from the environment, or the server log. */
  sendFeedback?: FeedbackSender;
}

/** Reads HOSTED_GAMES_PER_IP. A missing or invalid value gives the default. */
export function hostedGamesFromEnv(value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || value.trim() === "") return DEFAULT_HOSTED_GAMES_PER_IP;
  if (!Number.isInteger(n) || n < 1) {
    console.warn(`HOSTED_GAMES_PER_IP must be a whole number of 1 or more. Using ${DEFAULT_HOSTED_GAMES_PER_IP}.`);
    return DEFAULT_HOSTED_GAMES_PER_IP;
  }
  return n;
}

const DEFAULT_HOSTED_GAMES_PER_IP = 3;

export function attachGameServer(server: Server, decks: DeckRegistry, options: GameServerOptions = {}) {
  const store = options.store ?? new MemoryRoomStore();
  const io = server as unknown as IO;
  // Friends on one Wi-Fi share one IP address, so these limits are for the whole group.
  // Behind a hosting proxy, set CLIENT_IP_HEADER and TRUST_PROXY (see README),
  // or all players look like one address.
  const joinAttempts = new WindowCounter(options.joinsPerMinute ?? 60, 60_000);
  const lookups = new WindowCounter(options.lookupsPerMinute ?? 300, 60_000);
  const passwordFailures = new WindowCounter(5, 10 * 60_000);
  // Deck imports call an outside service, so they have their own, lower limit.
  const deckImports = new WindowCounter(10, 60_000);
  const feedbackReports = new WindowCounter(FEEDBACK_PER_HOUR, 60 * 60_000);
  const sendFeedback = options.sendFeedback ?? feedbackSenderFromEnv(process.env);
  const seal = options.blockSeal ?? BlockSeal.fromEnv(process.env.BLOCK_KEY);
  const hostedGamesPerIp = options.hostedGamesPerIp ?? hostedGamesFromEnv(process.env.HOSTED_GAMES_PER_IP);

  /** Open games whose current host connects from this IP address. The game in `leaving` does not count. */
  function hostedGames(ip: string | null | undefined, leaving?: { code: string; token: string }): number {
    if (!ip) return 0;
    const left = leaving && store.get(String(leaving.code));
    const leftHost = left && left.tokens.get(String(leaving.token)) === left.game.host() ? left : undefined;
    let n = 0;
    for (const room of store.all()) {
      if (room.closed || room === leftHost) continue;
      const hostIp = room.ipKeys.get(room.game.host());
      if (hostIp && hostIp === roomIpHash(room, ip)) n += 1;
    }
    return n;
  }

  // ----- Public game list ----------------------------------------------

  const LOBBY = "lobby";
  const LIST_MAX = 100;
  let lobbyTimer: ReturnType<typeof setTimeout> | null = null;

  /** Who is in a room now: players and spectators who told us who they are. */
  function membersOf(room: Room): Identity[] {
    return room.game.memberIds().flatMap((m) => {
      const who = room.who.get(m);
      return who ? [who] : [];
    });
  }

  /** "blockedYou": somebody in the room blocked the viewer. "youBlocked": the viewer blocked somebody there. */
  function blockConflict(room: Room, viewer: Identity | undefined): "blockedYou" | "youBlocked" | null {
    if (!viewer) return null;
    const members = membersOf(room);
    if (members.some((m) => hasBlocked(m, viewer))) return "blockedYou";
    if (members.some((m) => hasBlocked(viewer, m))) return "youBlocked";
    return null;
  }

  /** Public games, without the games where the viewer and somebody inside have blocked each other. */
  function listGames(viewer?: Identity): RoomListing[] {
    const games: RoomListing[] = [];
    for (const room of store.all()) {
      if (room.closed) continue;
      if (blockConflict(room, viewer)) continue;
      const { isPublic, ...summary } = room.game.summary();
      if (!isPublic || !summary.hostName) continue;
      games.push({
        code: room.code,
        hasPassword: !!room.password,
        ...summary,
        hostName: publicName(summary.hostName),
        players: summary.players.map((p) => (p.isBot ? p : { ...p, name: publicName(p.name) })),
        spectators: summary.spectators.map(publicName),
      });
    }
    // Games that have not started come first, then the busiest games.
    const order = (g: RoomListing) => (g.phase === "lobby" ? 0 : g.phase === "gameOver" ? 1 : 2);
    games.sort((a, b) => order(a) - order(b) || b.players.length - a.players.length);
    return games.slice(0, LIST_MAX);
  }

  /** Sends the game list and the online list to subscribers at most 4 times each second. Each viewer gets their own lists. */
  function lobbyChanged(): void {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = null;
      const online = onlineEntries();
      for (const sid of io.sockets.adapter.rooms.get(LOBBY) ?? []) {
        const s = io.sockets.sockets.get(sid);
        if (!s) continue;
        s.emit("lobby", { games: listGames(s.data.who) });
        s.emit("online", { users: onlineFor(online, s.data.who) });
      }
    }, 250);
  }

  // ----- Online list ---------------------------------------------------

  const ONLINE_MAX = 200;
  /** Reports from this many networks hide a name in the public lists. */
  const REPORTS_TO_HIDE = 3;
  /** How long a reported name stays hidden, and how long a report counts. */
  const HIDE_MS = 24 * 60 * 60_000;
  const HIDDEN_NAME = "Hidden name";
  type OnlineEntry = { who: Identity; status: OnlineStatus };
  const STATUS_ORDER: Record<OnlineStatus, number> = { playing: 0, watching: 1, browsing: 2 };

  /** One entry for each browser with a name: in a game, watching one, or on the game list. */
  function onlineEntries(): OnlineEntry[] {
    const byBrowser = new Map<string, OnlineEntry>();
    for (const s of io.sockets.sockets.values()) {
      const who = s.data.who;
      // A browser can send any name. Names that the filter blocks never show in the list.
      if (!who || !who.nameKey || isBlockedName(who.name)) continue;
      let status: OnlineStatus | null = null;
      const room = s.data.code ? store.get(s.data.code) : undefined;
      if (room && s.data.playerId && room.game.hasMember(s.data.playerId)) {
        status = room.game.hasPlayer(s.data.playerId) ? "playing" : "watching";
      } else if (s.rooms.has(LOBBY)) {
        status = "browsing";
      }
      if (!status) continue;
      const known = byBrowser.get(who.browser);
      if (!known || STATUS_ORDER[status] < STATUS_ORDER[known.status]) byBrowser.set(who.browser, { who, status });
    }
    return [...byBrowser.values()];
  }

  // ----- Reported names ------------------------------------------------
  // People can report a name from the online list. When people on REPORTS_TO_HIDE different
  // networks report the same name, the public game list and the online list show HIDDEN_NAME
  // instead, for HIDE_MS. Inside a room, the name stays: the host can remove or ban the player.
  // Everything is in memory only. The security log records each report for review.

  /** Name key -> the networks (hashed IP addresses) that reported it, and when the first report came. */
  const nameReports = new Map<string, { networks: Set<string>; since: number }>();
  /** Name key -> the time when the name shows again. */
  const hiddenNames = new Map<string, number>();

  function isHiddenName(name: string): boolean {
    const until = hiddenNames.get(nameKey(name));
    if (until === undefined) return false;
    if (until > Date.now()) return true;
    hiddenNames.delete(nameKey(name));
    return false;
  }

  /** The name as the public lists show it. */
  function publicName(name: string): string {
    return isHiddenName(name) ? HIDDEN_NAME : name;
  }

  function reportName(target: Identity, reporterIp: string): void {
    const now = Date.now();
    for (const [key, r] of nameReports) if (now - r.since > HIDE_MS) nameReports.delete(key);
    const entry = nameReports.get(target.nameKey) ?? { networks: new Set<string>(), since: now };
    entry.networks.add(ipKey(reporterIp));
    nameReports.set(target.nameKey, entry);
    const count = entry.networks.size;
    securityLog("name_report", { ip: reporterIp, detail: `${target.name} (${count}/${REPORTS_TO_HIDE})` });
    if (count >= REPORTS_TO_HIDE && !isHiddenName(target.name)) {
      hiddenNames.set(target.nameKey, now + HIDE_MS);
      securityLog("name_hidden", { detail: target.name });
      lobbyChanged();
    }
  }

  /** The online list for one viewer. People who blocked the viewer do not show. */
  function onlineFor(entries: OnlineEntry[], viewer: Identity | undefined): OnlineUser[] {
    return entries
      .filter((e) => !hasBlocked(e.who, viewer))
      .slice(0, ONLINE_MAX)
      .map((e) => ({
        handle: seal.handle(e.who.browser),
        // You always see your own name. Others see "Hidden name" when people reported it.
        name: e.who.browser === viewer?.browser ? e.who.name : publicName(e.who.name),
        status: e.status,
        you: e.who.browser === viewer?.browser,
        blocked: hasBlocked(viewer, e.who),
      }))
      .sort((a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name));
  }

  // ----- Room lifecycle ------------------------------------------------

  function newCode(): string {
    for (;;) {
      let c = "";
      for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!store.get(c)) return c;
    }
  }

  function createRoom(pw: string | undefined): Room {
    const roomCode = newCode();
    const room: Room = {
      code: roomCode,
      game: null as unknown as Game,
      password: pw ? hashPassword(pw) : null,
      tokens: new Map(),
      sockets: new Map(),
      ipKeys: new Map(),
      salt: randomBytes(16),
      bans: new Map(),
      removals: new Map(),
      cooldowns: new Map(),
      who: new Map(),
      removeTimers: new Map(),
      lastActivity: Date.now(),
      broadcastQueued: false,
      closed: false,
    };
    room.game = new Game({
      decks,
      onChange: () => queueBroadcast(room),
      onEmpty: () => closeRoom(room, null),
      // The game removes players who miss too many rounds. Tell them why and end their session.
      onRemoved: (playerId, why, name) => {
        // Everybody else sees and hears a removal by the host or for being idle.
        if (why === "idle" || why === "kicked" || why === "kickedAgain" || why === "banned") {
          for (const [otherId, ids] of room.sockets) {
            if (otherId === playerId) continue;
            for (const sid of ids) io.to(sid).emit("player:removed", { playerId, name, reason: why });
          }
        }
        if (why !== "idle") return;
        for (const sid of room.sockets.get(playerId) ?? []) io.to(sid).emit("removed", { reason: "idle" });
        dropSeat(room, playerId);
      },
    });
    store.set(room);
    return room;
  }

  function closeRoom(room: Room, reason: "closed" | null): void {
    if (room.closed) return;
    room.closed = true;
    room.game.dispose();
    for (const t of room.removeTimers.values()) clearTimeout(t);
    for (const ids of room.sockets.values()) {
      for (const sid of ids) {
        const s = io.sockets.sockets.get(sid);
        if (!s) continue;
        if (reason) s.emit("removed", { reason });
        detach(s);
      }
    }
    store.delete(room.code);
    lobbyChanged();
  }

  function queueBroadcast(room: Room): void {
    if (room.closed) return;
    lobbyChanged();
    if (room.broadcastQueued) return;
    room.broadcastQueued = true;
    queueMicrotask(() => {
      room.broadcastQueued = false;
      if (room.closed) return;
      for (const [playerId, ids] of room.sockets) {
        if (!room.game.hasMember(playerId)) continue;
        // Only the host sees the ban list, to be able to unban.
        const bans = room.game.isHost(playerId)
          ? [...room.bans.values()].map((b) => ({ id: b.id, name: b.name }))
          : [];
        const view = { ...room.game.viewFor(playerId), code: room.code, bans };
        for (const sid of ids) io.to(sid).emit("state", view);
      }
    });
  }

  // ----- Sessions ------------------------------------------------------

  function attach(socket: Sock, room: Room, playerId: string): void {
    detach(socket);
    void socket.leave(LOBBY);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    const set = room.sockets.get(playerId) ?? new Set();
    set.add(socket.id);
    room.sockets.set(playerId, set);
    room.ipKeys.set(playerId, roomIpHash(room, socket.data.ip));
    if (socket.data.who) room.who.set(playerId, socket.data.who);
    lobbyChanged();
    const timer = room.removeTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      room.removeTimers.delete(playerId);
    }
    room.game.setConnected(playerId, true);
    queueBroadcast(room);
  }

  /** Unlinks a socket from its room. Starts the reconnect timer if it was the last tab. */
  function detach(socket: Sock): void {
    const { code: roomCode, playerId } = socket.data;
    socket.data.code = undefined;
    socket.data.playerId = undefined;
    if (!roomCode || !playerId) return;
    lobbyChanged();
    const room = store.get(roomCode);
    if (!room || room.closed) return;
    const set = room.sockets.get(playerId);
    set?.delete(socket.id);
    if (set && set.size > 0) return;
    room.sockets.delete(playerId);
    if (!room.game.hasMember(playerId)) return;
    room.game.setConnected(playerId, false);
    room.removeTimers.set(
      playerId,
      setTimeout(() => {
        room.removeTimers.delete(playerId);
        revoke(room, playerId);
        room.game.removePlayer(playerId, "timeout");
      }, RECONNECT_GRACE_MS),
    );
  }

  /** Removes a seat at once: all tabs, the reconnect timer and the token. */
  function removeSeat(room: Room, playerId: string, why: "left" | "kicked"): void {
    dropSeat(room, playerId);
    room.game.removePlayer(playerId, why);
  }

  /** Unlinks a seat from its tabs, its reconnect timer and its token. Does not touch the game. */
  function dropSeat(room: Room, playerId: string): void {
    for (const sid of room.sockets.get(playerId) ?? []) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      s.data.code = undefined;
      s.data.playerId = undefined;
    }
    room.sockets.delete(playerId);
    const timer = room.removeTimers.get(playerId);
    if (timer) clearTimeout(timer);
    room.removeTimers.delete(playerId);
    revoke(room, playerId);
  }

  /** Leaves the seat that a token belongs to. Returns false when the seat no longer exists. */
  function abandon(seat: { code: string; token: string } | undefined, notify: boolean): boolean {
    if (!seat) return false;
    const room = store.get(seat.code);
    const playerId = room?.tokens.get(seat.token);
    if (!room || !playerId || !room.game.hasMember(playerId)) return false;
    if (notify) {
      for (const sid of room.sockets.get(playerId) ?? []) io.to(sid).emit("removed", { reason: "left" });
    }
    removeSeat(room, playerId, "left");
    return true;
  }

  /** True when a person in any room uses this name. */
  function nameInUse(rawName: string): boolean {
    const key = nameKey(rawName);
    for (const room of store.all()) {
      if (room.closed) continue;
      if (room.game.memberNames().some((m) => nameKey(m.name) === key)) return true;
    }
    return false;
  }

  /** Checks that a name is free on the whole server. */
  function requireFreeName(rawName: string): void {
    if (isReservedName(rawName)) throw new GameError("NAME_RESERVED");
    if (isBlockedName(rawName)) throw new GameError("NAME_BLOCKED");
    if (nameInUse(rawName)) throw new GameError("NAME_TAKEN");
  }

  function revoke(room: Room, playerId: string): void {
    for (const [token, pid] of room.tokens) if (pid === playerId) room.tokens.delete(token);
  }

  function issueToken(room: Room, playerId: string): string {
    const token = randomBytes(24).toString("base64url");
    room.tokens.set(token, playerId);
    return token;
  }

  function current(socket: Sock): { room: Room; playerId: string } {
    const { code: roomCode, playerId } = socket.data;
    const room = roomCode ? store.get(roomCode) : undefined;
    if (!room || !playerId || !room.game.hasMember(playerId)) throw new RequestError("NOT_IN_ROOM");
    room.lastActivity = Date.now();
    return { room, playerId };
  }

  function checkLookupRate(socket: Sock): void {
    if (!lookups.hit(socket.data.ip)) {
      securityLog("join_rate_limited", { ip: socket.data.ip, detail: "lookup" });
      throw new RequestError("RATE_LIMITED");
    }
  }

  function checkJoinRate(socket: Sock): void {
    if (!joinAttempts.hit(socket.data.ip)) {
      securityLog("join_rate_limited", { ip: socket.data.ip });
      throw new RequestError("RATE_LIMITED");
    }
  }

  // ----- Event handling ------------------------------------------------

  type Handler = (socket: Sock, payload: unknown) => object | void | Promise<object | void>;

  function on(socket: Sock, event: keyof ClientToServer, handler: Handler): void {
    socket.on(event, async (...args: unknown[]) => {
      const ack = typeof args.at(-1) === "function" ? (args.pop() as (r: unknown) => void) : () => {};
      const payload = args[0];
      if (!socket.data.bucket.take()) {
        securityLog("rate_limited", { ip: socket.data.ip, room: socket.data.code, detail: event });
        ack({ ok: false, error: "RATE_LIMITED" });
        return;
      }
      try {
        const result = (await handler(socket, payload)) ?? {};
        ack({ ok: true, ...result });
      } catch (err) {
        if (err instanceof GameError || err instanceof RequestError || err instanceof DeckImportError) {
          ack({ ok: false, error: err.code, message: err.message });
        } else if (err instanceof ZodError) {
          securityLog("invalid_payload", { ip: socket.data.ip, room: socket.data.code, detail: event });
          ack({ ok: false, error: "BAD_REQUEST" });
        } else {
          console.error(`Error in ${event}:`, err);
          ack({ ok: false, error: "BAD_REQUEST" });
        }
      }
    });
  }

  io.on("connection", (socket: Sock) => {
    socket.data.ip = clientIpFrom(socket.handshake.headers, socket.handshake.address, {
      trustedHops: trustedHopsFromEnv(process.env.TRUST_PROXY),
      header: ipHeaderFromEnv(process.env.CLIENT_IP_HEADER),
    });
    // 12 actions at once, then 4 each second.
    socket.data.bucket = new TokenBucket(12, 4);
    // The page says who it is when it connects (see src/lib/socket.ts).
    const hello = identityInput.safeParse(socket.handshake.auth);
    if (hello.success) socket.data.who = seal.identity(hello.data);

    on(socket, "identity:update", (s, p) => {
      const who = seal.identity(identityInput.parse(p));
      s.data.who = who;
      if (s.data.code && s.data.playerId) store.get(s.data.code)?.who.set(s.data.playerId, who);
      lobbyChanged();
    });

    /** Seals a person for the blocker's browser: someone from the online list, or a member of the blocker's room. */
    on(socket, "block:create", (s, p) => {
      const { handle, playerId } = schemas.block.parse(p);
      let target: Identity | undefined;
      if (handle) {
        target = [...io.sockets.sockets.values()].map((x) => x.data.who).find((w) => w && seal.handle(w.browser) === handle);
      } else if (playerId && s.data.code) {
        const room = store.get(s.data.code);
        if (room?.game.hasMember(playerId)) target = room.who.get(playerId);
      }
      if (!target || target.browser === s.data.who?.browser) throw new RequestError("UNKNOWN_PLAYER");
      return { token: seal.seal(target.browser, target.name), name: target.name };
    });

    /** Sends a bug report or an idea to the developer. */
    on(socket, "feedback:send", async (s, p) => {
      const f = schemas.feedback.parse(p);
      if (f.website) {
        // A bot filled in the hidden field. Pretend that it worked.
        securityLog("feedback_trap", { ip: s.data.ip });
        return;
      }
      const message = cleanFeedback(f.message);
      if (message.length < FEEDBACK_MIN) throw new RequestError("FEEDBACK_TOO_SHORT");
      if (message.length > FEEDBACK_MAX) throw new RequestError("FEEDBACK_TOO_LONG");
      const email = f.email?.trim() ? f.email.trim() : null;
      if (email !== null && !z.string().email().safeParse(email).success) throw new RequestError("FEEDBACK_BAD_EMAIL");
      if (!feedbackReports.hit(ipKey(s.data.ip))) throw new RequestError("FEEDBACK_LIMIT");
      securityLog("feedback", { ip: s.data.ip, detail: f.type });
      await sendFeedback({
        type: f.type,
        message,
        email,
        page: f.page,
        browser: browserSummary(s.handshake.headers["user-agent"]),
        version: APP_VERSION,
      });
    });

    /** Reports a name from the online list. */
    on(socket, "name:report", (s, p) => {
      checkLookupRate(s);
      const { handle } = schemas.report.parse(p);
      const target = [...io.sockets.sockets.values()].map((x) => x.data.who).find((w) => w && seal.handle(w.browser) === handle);
      if (!target || target.browser === s.data.who?.browser) throw new RequestError("UNKNOWN_PLAYER");
      reportName(target, s.data.ip);
    });

    on(socket, "lobby:subscribe", (s) => {
      // A player who opens the game list is no longer looking at their room.
      // Their seat waits for the reconnect window, like a lost connection.
      detach(s);
      void s.join(LOBBY);
      lobbyChanged();
      return { games: listGames(s.data.who), online: onlineFor(onlineEntries(), s.data.who) };
    });

    on(socket, "lobby:unsubscribe", (s) => {
      void s.leave(LOBBY);
      lobbyChanged();
    });

    on(socket, "name:check", (s, p) => {
      checkLookupRate(s);
      const { name: n } = schemas.nameCheck.parse(p);
      const previous = (p as { previous?: { code: string; token: string } }).previous;
      const own = previous && store.get(String(previous.code))?.tokens.get(String(previous.token));
      const ownRoom = own ? store.get(String(previous!.code)) : undefined;
      const key = nameKey(n);
      if (key.length === 0) return { available: false, reason: "NAME_INVALID" };
      if ([...key].length < NAME_MIN) return { available: false, reason: "NAME_TOO_SHORT" };
      if (isReservedName(n)) return { available: false, reason: "NAME_RESERVED" };
      if (isBlockedName(n)) return { available: false, reason: "NAME_BLOCKED" };
      for (const room of store.all()) {
        if (room.closed) continue;
        for (const m of room.game.memberNames()) {
          if (nameKey(m.name) !== key) continue;
          // The player's own previous seat does not block the name.
          if (room === ownRoom && m.id === own) continue;
          return { available: false, reason: "NAME_TAKEN" };
        }
      }
      return { available: true };
    });

    on(socket, "room:seat", (s, p) => {
      checkLookupRate(s);
      const seat = schemas.resume.parse(p);
      const room = store.get(seat.code);
      const playerId = room?.tokens.get(seat.token);
      if (!room || !playerId || !room.game.hasMember(playerId)) return { valid: false };
      return { valid: true, hostName: room.game.summary().hostName };
    });

    on(socket, "room:abandon", (s, p) => {
      checkJoinRate(s);
      const seat = schemas.resume.parse(p);
      if (s.data.code === seat.code) detach(s);
      if (!abandon(seat, true)) throw new RequestError("SESSION_EXPIRED");
    });

    on(socket, "room:info", (s, p) => {
      checkLookupRate(s);
      const { code: c } = schemas.info.parse(p);
      const room = store.get(c);
      // For somebody that a member blocked, the room looks closed.
      if (!room || blockConflict(room, s.data.who) === "blockedYou") return { exists: false, needsPassword: false };
      return { exists: true, needsPassword: !!room.password };
    });

    on(socket, "room:create", (s, p) => {
      checkJoinRate(s);
      const { name: n, password: pw, isPublic, termsVersion, previous } = schemas.create.parse(p);
      requireTerms(termsVersion);
      // Friends on one Wi-Fi share one IP address, so this limit is for the whole network.
      // Check it before anything changes. The game that the player leaves does not count.
      if (hostedGames(s.data.ip, previous) >= hostedGamesPerIp) {
        securityLog("hosted_games_limit", { ip: s.data.ip });
        throw new RequestError("HOSTED_GAMES_LIMIT");
      }
      // Moving to a new game leaves the previous one, so the old seat does not block the name.
      detach(s);
      abandon(previous, true);
      requireFreeName(n);
      const room = createRoom(pw);
      try {
        const playerId = room.game.addPlayer(n);
        if (isPublic !== undefined) room.game.updateSettings(playerId, { isPublic });
        const token = issueToken(room, playerId);
        attach(s, room, playerId);
        return { code: room.code, token, playerId };
      } catch (err) {
        closeRoom(room, null);
        throw err;
      }
    });

    on(socket, "room:join", (s, p) => {
      checkJoinRate(s);
      const { code: c, name: n, password: pw, as, termsVersion, previous } = schemas.join.parse(p);
      requireTerms(termsVersion);
      const room = store.get(c);
      if (!room) throw new RequestError("ROOM_NOT_FOUND");
      if (isBanned(room, s.data.ip, null)) {
        securityLog("banned_join", { ip: s.data.ip, room: c });
        throw new RequestError("BANNED");
      }
      // Somebody inside blocked this person: the room looks closed, so the block stays private.
      const conflict = blockConflict(room, s.data.who);
      if (conflict === "blockedYou") throw new RequestError("ROOM_NOT_FOUND");
      if (conflict === "youBlocked") throw new RequestError("BLOCKED_IN_ROOM");
      if (s.data.ip && (room.cooldowns.get(roomIpHash(room, s.data.ip)) ?? 0) > Date.now()) {
        throw new RequestError("REMOVAL_COOLDOWN");
      }
      if (room.password) {
        const failKey = `${ipKey(s.data.ip)}|${c}`;
        // Check the limit first, so a correct guess after the limit does not work.
        if (passwordFailures.blocked(failKey)) throw new RequestError("RATE_LIMITED");
        if (!checkPassword(room.password, pw ?? "")) {
          securityLog("bad_password", { ip: s.data.ip, room: c });
          passwordFailures.hit(failKey);
          throw new RequestError("BAD_PASSWORD");
        }
      }
      // Leave the previous game only after the checks for this room pass.
      if (previous && previous.code !== c) {
        detach(s);
        abandon(previous, true);
      }
      requireFreeName(n);
      const playerId = as === "spectator" ? room.game.addSpectator(n) : room.game.addPlayer(n);
      const token = issueToken(room, playerId);
      attach(s, room, playerId);
      return { code: room.code, token, playerId };
    });

    on(socket, "room:resume", (s, p) => {
      checkJoinRate(s);
      const { code: c, token } = schemas.resume.parse(p);
      const room = store.get(c);
      if (!room) throw new RequestError("ROOM_NOT_FOUND");
      const playerId = room.tokens.get(token);
      if (!playerId || !room.game.hasMember(playerId)) throw new RequestError("SESSION_EXPIRED");
      if (isBanned(room, null, token)) throw new RequestError("BANNED");
      attach(s, room, playerId);
      return { code: room.code, token, playerId };
    });

    on(socket, "room:leave", (s) => {
      const { room, playerId } = current(s);
      // Close the other tabs of the same player too.
      removeSeat(room, playerId, "left");
    });

    on(socket, "settings:update", (s, p) => {
      const { room, playerId } = current(s);
      room.game.updateSettings(playerId, schemas.settings.parse(p));
    });

    on(socket, "game:start", (s) => {
      const { room, playerId } = current(s);
      room.game.start(playerId);
    });

    on(socket, "game:end", (s) => {
      const { room, playerId } = current(s);
      room.game.endGame(playerId);
    });

    on(socket, "game:lobby", (s) => {
      const { room, playerId } = current(s);
      room.game.backToLobby(playerId);
    });

    on(socket, "card:submit", (s, p) => {
      const { room, playerId } = current(s);
      room.game.submit(playerId, schemas.submit.parse(p).cardIds);
    });

    on(socket, "czar:pick", (s, p) => {
      const { room, playerId } = current(s);
      room.game.pick(playerId, schemas.pick.parse(p).submissionId);
    });

    on(socket, "player:back", (s) => {
      const { room, playerId } = current(s);
      room.game.markBack(playerId);
    });

    on(socket, "deck:add", async (s, p) => {
      const { room, playerId } = current(s);
      // Check the permission before the request to the outside service.
      if (!room.game.isHost(playerId)) throw new GameError("NOT_HOST");
      const deckCode = normalizeCode(schemas.deckAdd.parse(p).code);
      if (!deckCode) throw new RequestError("BAD_DECK_CODE");
      if (!deckImports.hit(ipKey(s.data.ip))) throw new RequestError("RATE_LIMITED");
      const deck = await fetchManyDeck(deckCode);
      if (room.closed) throw new RequestError("NOT_IN_ROOM");
      room.game.addDeck(playerId, deck);
      return { deckId: deck.id, name: deck.name };
    });

    on(socket, "deck:remove", (s, p) => {
      const { room, playerId } = current(s);
      room.game.removeDeck(playerId, schemas.deckRemove.parse(p).deckId);
    });

    on(socket, "player:play", (s) => {
      const { room, playerId } = current(s);
      room.game.promoteSpectator(playerId);
    });

    on(socket, "player:kick", (s, p) => {
      const { room, playerId } = current(s);
      const { playerId: target, ban } = schemas.kick.parse(p);
      if (!room.game.isHost(playerId)) throw new GameError("NOT_HOST");
      if (target === playerId || !room.game.memberIds().includes(target)) throw new GameError("UNKNOWN_PLAYER");

      if (ban) {
        const name = room.game.memberNames().find((m) => m.id === target)?.name ?? "Unknown player";
        const id = randomBytes(6).toString("base64url");
        room.bans.set(id, {
          id,
          name,
          ipHash: room.ipKeys.get(target) ?? null,
          tokens: [...room.tokens].filter(([, pid]) => pid === target).map(([token]) => token),
        });
      }
      securityLog(ban ? "ban" : "kick", { ip: s.data.ip, room: room.code });
      // Count removals for each connection. From the 3rd one, the connection waits before it can join again.
      let times: number | undefined;
      let cooldownMs: number | undefined;
      const ipHash = room.ipKeys.get(target);
      if (!ban && ipHash) {
        times = (room.removals.get(ipHash) ?? 0) + 1;
        room.removals.set(ipHash, times);
        if (times >= REMOVALS_BEFORE_COOLDOWN) {
          cooldownMs = REMOVAL_COOLDOWN_MS;
          room.cooldowns.set(ipHash, Date.now() + REMOVAL_COOLDOWN_MS);
        }
      }
      for (const sid of room.sockets.get(target) ?? []) {
        const other = io.sockets.sockets.get(sid);
        if (!other) continue;
        other.emit("removed", ban ? { reason: "banned" } : { reason: "kicked", times, cooldownMs });
        other.data.code = undefined;
        other.data.playerId = undefined;
      }
      room.sockets.delete(target);
      const timer = room.removeTimers.get(target);
      if (timer) clearTimeout(timer);
      room.removeTimers.delete(target);
      revoke(room, target);
      room.game.removePlayer(target, ban ? "banned" : (times ?? 0) >= REMOVALS_BEFORE_COOLDOWN ? "kickedAgain" : "kicked");
    });

    on(socket, "bot:remove", (s, p) => {
      const { room, playerId } = current(s);
      room.game.removeBot(playerId, schemas.botRemove.parse(p).playerId);
    });

    on(socket, "bot:add", (s) => {
      const { room, playerId } = current(s);
      room.game.addBot(playerId);
    });

    on(socket, "player:unban", (s, p) => {
      const { room, playerId } = current(s);
      if (!room.game.isHost(playerId)) throw new GameError("NOT_HOST");
      const { banId } = schemas.unban.parse(p);
      if (!room.bans.delete(banId)) throw new GameError("UNKNOWN_PLAYER");
      securityLog("unban", { ip: s.data.ip, room: room.code });
      queueBroadcast(room);
    });

    socket.on("disconnect", () => {
      detach(socket);
      lobbyChanged();
    });
  });

  // Close idle rooms and clear old rate-limit entries.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of [...store.all()]) {
      if (now - room.lastActivity > ROOM_IDLE_MS) closeRoom(room, "closed");
    }
    joinAttempts.sweep();
    passwordFailures.sweep();
    deckImports.sweep();
    lookups.sweep();
  }, 60_000);
  sweep.unref();

  return { store, close: () => clearInterval(sweep) };
}

/** Players must accept the current Terms of Use before they create or join a room. */
function requireTerms(version: string | undefined): void {
  if (version !== TERMS_VERSION) throw new RequestError("TERMS_REQUIRED");
}

function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return { salt, hash: scryptSync(pw, salt, 32) };
}

function checkPassword(stored: { salt: Buffer; hash: Buffer }, pw: string): boolean {
  const hash = scryptSync(pw, stored.salt, 32);
  return timingSafeEqual(hash, stored.hash);
}
