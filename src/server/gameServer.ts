import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z, ZodError } from "zod";
import { DeckRegistry } from "../engine/deck";
import { Game, GameError, LIMITS, NAME_MAX } from "../engine/game";
import type { ClientToServer, ServerToClient } from "../lib/protocol";
import { TokenBucket, WindowCounter } from "./rateLimit";
import { ipKey, securityLog } from "./securityLog";

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
  /** Player id -> hashed IP of the last connection. Used for bans only. */
  ipKeys: Map<string, string>;
  /** Banned hashed IPs and tokens. Exists only while the room exists. */
  bans: Set<string>;
  removeTimers: Map<string, ReturnType<typeof setTimeout>>;
  lastActivity: number;
  broadcastQueued: boolean;
  closed: boolean;
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
  create: z.object({ name, password }),
  join: z.object({ code, name, password }),
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
    })
    .partial()
    .strict(),
  submit: z.object({ cardIds: z.array(id).min(1).max(3) }),
  pick: z.object({ submissionId: id }),
  kick: z.object({ playerId: id, ban: z.boolean() }),
};

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
}

type IO = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export function attachGameServer(server: Server, decks: DeckRegistry, store: RoomStore = new MemoryRoomStore()) {
  const io = server as unknown as IO;
  const joinAttempts = new WindowCounter(30, 60_000);
  const passwordFailures = new WindowCounter(5, 10 * 60_000);

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
      bans: new Set(),
      removeTimers: new Map(),
      lastActivity: Date.now(),
      broadcastQueued: false,
      closed: false,
    };
    room.game = new Game({
      decks,
      onChange: () => queueBroadcast(room),
      onEmpty: () => closeRoom(room, null),
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
  }

  function queueBroadcast(room: Room): void {
    if (room.broadcastQueued || room.closed) return;
    room.broadcastQueued = true;
    queueMicrotask(() => {
      room.broadcastQueued = false;
      if (room.closed) return;
      for (const [playerId, ids] of room.sockets) {
        if (!room.game.hasPlayer(playerId)) continue;
        const view = { ...room.game.viewFor(playerId), code: room.code };
        for (const sid of ids) io.to(sid).emit("state", view);
      }
    });
  }

  // ----- Sessions ------------------------------------------------------

  function attach(socket: Sock, room: Room, playerId: string): void {
    detach(socket);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    const set = room.sockets.get(playerId) ?? new Set();
    set.add(socket.id);
    room.sockets.set(playerId, set);
    room.ipKeys.set(playerId, ipKey(socket.data.ip));
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
    const room = store.get(roomCode);
    if (!room || room.closed) return;
    const set = room.sockets.get(playerId);
    set?.delete(socket.id);
    if (set && set.size > 0) return;
    room.sockets.delete(playerId);
    if (!room.game.hasPlayer(playerId)) return;
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
    if (!room || !playerId || !room.game.hasPlayer(playerId)) throw new RequestError("NOT_IN_ROOM");
    room.lastActivity = Date.now();
    return { room, playerId };
  }

  function checkJoinRate(socket: Sock): void {
    if (!joinAttempts.hit(socket.data.ip)) {
      securityLog("join_rate_limited", { ip: socket.data.ip });
      throw new RequestError("RATE_LIMITED");
    }
  }

  // ----- Event handling ------------------------------------------------

  type Handler = (socket: Sock, payload: unknown) => object | void;

  function on(socket: Sock, event: keyof ClientToServer, handler: Handler): void {
    socket.on(event, (...args: unknown[]) => {
      const ack = typeof args.at(-1) === "function" ? (args.pop() as (r: unknown) => void) : () => {};
      const payload = args[0];
      if (!socket.data.bucket.take()) {
        securityLog("rate_limited", { ip: socket.data.ip, room: socket.data.code, detail: event });
        ack({ ok: false, error: "RATE_LIMITED" });
        return;
      }
      try {
        const result = handler(socket, payload) ?? {};
        ack({ ok: true, ...result });
      } catch (err) {
        if (err instanceof GameError || err instanceof RequestError) {
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
    const forwarded = socket.handshake.headers["x-forwarded-for"];
    socket.data.ip =
      process.env.TRUST_PROXY === "1" && typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : socket.handshake.address;
    // 12 actions at once, then 4 each second.
    socket.data.bucket = new TokenBucket(12, 4);

    on(socket, "room:info", (s, p) => {
      checkJoinRate(s);
      const { code: c } = schemas.info.parse(p);
      const room = store.get(c);
      return { exists: !!room, needsPassword: !!room?.password };
    });

    on(socket, "room:create", (s, p) => {
      checkJoinRate(s);
      const { name: n, password: pw } = schemas.create.parse(p);
      const room = createRoom(pw);
      try {
        const playerId = room.game.addPlayer(n);
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
      const { code: c, name: n, password: pw } = schemas.join.parse(p);
      const room = store.get(c);
      if (!room) throw new RequestError("ROOM_NOT_FOUND");
      if (room.bans.has(ipKey(s.data.ip))) {
        securityLog("banned_join", { ip: s.data.ip, room: c });
        throw new RequestError("BANNED");
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
      const playerId = room.game.addPlayer(n);
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
      if (!playerId || !room.game.hasPlayer(playerId)) throw new RequestError("SESSION_EXPIRED");
      if (room.bans.has(token)) throw new RequestError("BANNED");
      attach(s, room, playerId);
      return { code: room.code, token, playerId };
    });

    on(socket, "room:leave", (s) => {
      const { room, playerId } = current(s);
      detach(s);
      // Close the other tabs of the same player too.
      for (const sid of room.sockets.get(playerId) ?? []) {
        const other = io.sockets.sockets.get(sid);
        if (other) detach(other);
      }
      const timer = room.removeTimers.get(playerId);
      if (timer) clearTimeout(timer);
      room.removeTimers.delete(playerId);
      revoke(room, playerId);
      room.game.removePlayer(playerId, "left");
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

    on(socket, "player:kick", (s, p) => {
      const { room, playerId } = current(s);
      const { playerId: target, ban } = schemas.kick.parse(p);
      if (!room.game.isHost(playerId)) throw new GameError("NOT_HOST");
      if (target === playerId || !room.game.humanIds().includes(target)) throw new GameError("UNKNOWN_PLAYER");

      if (ban) {
        const key = room.ipKeys.get(target);
        if (key) room.bans.add(key);
        for (const [token, pid] of room.tokens) if (pid === target) room.bans.add(token);
      }
      securityLog(ban ? "ban" : "kick", { ip: s.data.ip, room: room.code });
      for (const sid of room.sockets.get(target) ?? []) {
        const other = io.sockets.sockets.get(sid);
        if (!other) continue;
        other.emit("removed", { reason: ban ? "banned" : "kicked" });
        other.data.code = undefined;
        other.data.playerId = undefined;
      }
      room.sockets.delete(target);
      const timer = room.removeTimers.get(target);
      if (timer) clearTimeout(timer);
      room.removeTimers.delete(target);
      revoke(room, target);
      room.game.removePlayer(target, "kicked");
    });

    socket.on("disconnect", () => detach(socket));
  });

  // Close idle rooms and clear old rate-limit entries.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of [...store.all()]) {
      if (now - room.lastActivity > ROOM_IDLE_MS) closeRoom(room, "closed");
    }
    joinAttempts.sweep();
    passwordFailures.sweep();
  }, 60_000);
  sweep.unref();

  return { store, close: () => clearInterval(sweep) };
}

function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return { salt, hash: scryptSync(pw, salt, 32) };
}

function checkPassword(stored: { salt: Buffer; hash: Buffer }, pw: string): boolean {
  const hash = scryptSync(pw, stored.salt, 32);
  return timingSafeEqual(hash, stored.hash);
}
