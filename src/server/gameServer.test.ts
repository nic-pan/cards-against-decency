import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GameView } from "../engine/game";
import { loadDecks } from "./decks";
import { attachGameServer, hostedGamesFromEnv } from "./gameServer";
import { TERMS_VERSION } from "../lib/protocol";

const T = { termsVersion: TERMS_VERSION };
let nameSeq = 0;
/** Names must be unique on the whole server, so tests add a number. */
const nm = (base: string) => `${base}${++nameSeq}`;

let url = "";
let server: ReturnType<typeof createServer>;
let ioServer: Server;
const clients: Socket[] = [];

beforeAll(async () => {
  server = createServer();
  ioServer = new Server(server);
  // All test clients share one IP address, so the test server allows more joins.
  attachGameServer(ioServer, loadDecks(join(process.cwd(), "data/decks")), {
    joinsPerMinute: 1000,
    lookupsPerMinute: 1000,
    hostedGamesPerIp: 1000,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.close();
  ioServer.close();
  await new Promise((r) => server.close(r));
});

type View = GameView & { code: string };

/** Runs a test in which clients can have their own addresses (the ip argument of client()). */
async function withTestIps(fn: () => Promise<void>) {
  const before = process.env.CLIENT_IP_HEADER;
  process.env.CLIENT_IP_HEADER = "x-real-ip";
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env.CLIENT_IP_HEADER;
    else process.env.CLIENT_IP_HEADER = before;
  }
}

/**
 * auth is what the page sends as its identity (src/lib/socket.ts).
 * ip is a fake client address. It works only while CLIENT_IP_HEADER is "x-real-ip" (see withTestIps).
 */
async function client(auth?: { name?: string; browser: string; blocks?: string[] }, ip?: string) {
  const s = connect(url, { transports: ["websocket"], forceNew: true, auth, extraHeaders: ip ? { "x-real-ip": ip } : undefined });
  clients.push(s);
  await new Promise<void>((r) => s.once("connect", () => r()));
  let latest: View | null = null;
  const waiters: { pred: (v: View) => boolean; resolve: (v: View) => void }[] = [];
  s.on("state", (v: View) => {
    latest = v;
    for (const w of [...waiters]) if (w.pred(v)) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(v);
    }
  });
  return {
    s,
    emit: (event: string, payload?: unknown) =>
      (payload === undefined ? s.emitWithAck(event) : s.emitWithAck(event, payload)) as Promise<any>,
    view: () => latest!,
    until: (pred: (v: View) => boolean) =>
      new Promise<View>((resolve, reject) => {
        if (latest && pred(latest)) return resolve(latest);
        waiters.push({ pred, resolve });
        setTimeout(() => reject(new Error("timed out waiting for state")), 3000);
      }),
  };
}

describe("game server", () => {
  it("plays a full round with three people", async () => {
    const a = await client();
    const created = await a.emit("room:create", { ...T, name: "Ana" });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);

    const b = await client();
    const c = await client();
    expect((await b.emit("room:join", { ...T, code: created.code.toLowerCase(), name: "Bob" })).ok).toBe(true);
    expect((await c.emit("room:join", { ...T, code: created.code, name: "Cyd" })).ok).toBe(true);

    // Only the host can start.
    expect((await b.emit("game:start")).error).toBe("NOT_HOST");
    expect((await a.emit("game:start")).ok).toBe(true);

    const all = [a, b, c];
    const views = await Promise.all(all.map((p) => p.until((v) => v.phase === "submitting")));
    const czarId = views[0].round!.czarId;
    for (const p of all) {
      const v = p.view();
      if (v.mustSubmit) {
        // A card that is not in the hand is rejected.
        expect((await p.emit("card:submit", { cardIds: ["cah-base:w:999999"] })).error).toBe("BAD_CARDS");
        expect((await p.emit("card:submit", { cardIds: v.hand.slice(0, v.round!.black.pick).map((x) => x.id) })).ok).toBe(true);
      }
    }
    const czar = all.find((p) => p.view().youId === czarId)!;
    const judging = await czar.until((v) => v.phase === "judging");
    expect(judging.round!.submissions!.every((s) => s.playerId === null)).toBe(true);

    expect((await czar.emit("czar:pick", { submissionId: judging.round!.submissions![0].id })).ok).toBe(true);
    const over = await a.until((v) => v.phase === "roundOver");
    expect(over.players.reduce((n, p) => n + p.score, 0)).toBe(1);
  });

  it("keeps the seat when a player reconnects with the token", async () => {
    const a = await client();
    const created = await a.emit("room:create", { ...T, name: nm("Host") });
    const b = await client();
    const joined = await b.emit("room:join", { ...T, code: created.code, name: "Rejoin" });
    b.s.disconnect();
    await a.until((v) => v.players.some((p) => p.name === "Rejoin" && !p.connected));

    const b2 = await client();
    expect((await b2.emit("room:resume", { code: created.code, token: "x".repeat(32) })).error).toBe("SESSION_EXPIRED");
    const resumed = await b2.emit("room:resume", { code: created.code, token: joined.token });
    expect(resumed.playerId).toBe(joined.playerId);
    await a.until((v) => v.players.some((p) => p.name === "Rejoin" && p.connected));
  });

  it("checks room passwords", async () => {
    const a = await client();
    const created = await a.emit("room:create", { ...T, name: nm("Host"), password: "secret" });
    const b = await client();
    expect((await b.emit("room:info", { code: created.code })).needsPassword).toBe(true);
    expect((await b.emit("room:join", { ...T, code: created.code, name: "Bea" })).error).toBe("BAD_PASSWORD");
    expect((await b.emit("room:join", { ...T, code: created.code, name: "Bea", password: "secret" })).ok).toBe(true);
  });

  it("lets the host ban a player", async () => {
    const a = await client();
    const created = await a.emit("room:create", { ...T, name: nm("Host") });
    const b = await client();
    const joined = await b.emit("room:join", { ...T, code: created.code, name: "Troll" });
    const removed = new Promise((r) => b.s.once("removed", r));
    expect((await a.emit("player:kick", { playerId: joined.playerId, ban: true })).ok).toBe(true);
    expect(await removed).toEqual({ reason: "banned" });
    expect((await b.emit("room:join", { ...T, code: created.code, name: "Troll2" })).error).toBe("BANNED");
    expect((await b.emit("room:resume", { code: created.code, token: joined.token })).ok).toBe(false);
  });

  it("requires the current terms to create or join", async () => {
    const a = await client();
    expect((await a.emit("room:create", { name: "NoTerms" })).error).toBe("TERMS_REQUIRED");
    expect((await a.emit("room:create", { name: "Old", termsVersion: "v0" })).error).toBe("TERMS_REQUIRED");
    const created = await a.emit("room:create", { ...T, name: nm("Host") });
    const b = await client();
    expect((await b.emit("room:join", { code: created.code, name: "Bea" })).error).toBe("TERMS_REQUIRED");
  });

  it("lists public rooms only, and lets people spectate", async () => {
    const watcher = await client();
    const first = await watcher.emit("lobby:subscribe");
    expect(first.ok).toBe(true);

    const a = await client();
    const pub = await a.emit("room:create", { ...T, name: "PublicHost" });
    const b = await client();
    const priv = await b.emit("room:create", { ...T, name: "PrivateHost", isPublic: false });

    const listed = await new Promise<any>((resolve) => {
      watcher.s.on("lobby", (p: any) => {
        if (p.games.some((g: any) => g.code === pub.code)) resolve(p);
      });
    });
    const game = listed.games.find((g: any) => g.code === pub.code);
    expect(game.hostName).toBe("PublicHost");
    expect(game.phase).toBe("lobby");
    expect(listed.games.some((g: any) => g.code === priv.code)).toBe(false);
    // The list never contains session tokens or player ids.
    expect(JSON.stringify(listed)).not.toContain(pub.token);
    expect(JSON.stringify(listed)).not.toContain(pub.playerId);

    const spec = await watcher.emit("room:join", { ...T, code: pub.code, name: "Watcher", as: "spectator" });
    expect(spec.ok).toBe(true);
    const view = await watcher.until((v) => v.youAreSpectator);
    expect(view.spectators.map((s) => s.name)).toEqual(["Watcher"]);
    expect((await watcher.emit("player:play")).ok).toBe(true);
    await watcher.until((v) => !v.youAreSpectator && v.players.some((p) => p.name === "Watcher"));
  });

  it("lets people spectate a private room with the code", async () => {
    const a = await client();
    const priv = await a.emit("room:create", { ...T, name: nm("Host"), isPublic: false });
    const b = await client();
    expect((await b.emit("room:join", { ...T, code: priv.code, name: nm("Watcher"), as: "spectator" })).ok).toBe(true);
    const view = await b.until((v) => v.youAreSpectator);
    expect(view.settings.isPublic).toBe(false);
  });

  it("keeps names unique on the whole server, and reserves bot names", async () => {
    const a = await client();
    const first = await a.emit("room:create", { ...T, name: "Unique Name" });
    const b = await client();
    expect((await b.emit("room:create", { ...T, name: "unique  name" })).error).toBe("NAME_TAKEN");
    expect((await b.emit("room:join", { ...T, code: first.code, name: "UNIQUE NAME" })).error).toBe("NAME_TAKEN");
    expect((await b.emit("name:check", { name: "Unique Name" })).available).toBe(false);
    expect((await b.emit("name:check", { name: "Bot 3" })).reason).toBe("NAME_RESERVED");
    expect((await b.emit("room:create", { ...T, name: "bot 1" })).error).toBe("NAME_RESERVED");
    expect((await b.emit("name:check", { name: "s.w.a.t" })).reason).toBe("NAME_RESERVED");
    expect((await b.emit("name:check", { name: " ab " })).reason).toBe("NAME_TOO_SHORT");
    expect((await b.emit("name:check", { name: "abc" })).available).toBe(true);
    expect((await b.emit("name:check", { name: "fbi" })).reason).toBe("NAME_RESERVED");
    // The owner of the name can reuse it when they move to a new game.
    const previous = { code: first.code, token: first.token };
    expect((await a.emit("name:check", { name: "Unique Name", previous })).available).toBe(true);
    const moved = await a.emit("room:create", { ...T, name: "Unique Name", previous });
    expect(moved.ok).toBe(true);
    expect(moved.code).not.toBe(first.code);
  });

  it("gives the room to the longest-present player when the host leaves", async () => {
    const watcher = await client();
    await watcher.emit("lobby:subscribe");
    const host = await client();
    const room = await host.emit("room:create", { ...T, name: nm("Owner") });
    const b = await client();
    await b.emit("room:join", { ...T, code: room.code, name: "Second In" });
    const c = await client();
    await c.emit("room:join", { ...T, code: room.code, name: "Third In" });

    // Leaving by token, as "Leave game" and "Log out" do, works without a room connection.
    expect((await watcher.emit("room:abandon", { code: room.code, token: room.token })).ok).toBe(true);
    const listed = await new Promise<any>((resolve) => {
      const check = (p: any) => {
        const g = p.games.find((x: any) => x.code === room.code);
        if (g && g.hostName === "Second In") resolve(g);
      };
      watcher.s.on("lobby", check);
    });
    expect(listed.players.map((p: any) => p.name)).toEqual(["Second In", "Third In"]);
    // The old token no longer works, and the name is free again.
    expect((await host.emit("room:resume", { code: room.code, token: room.token })).ok).toBe(false);
  });

  it("closes the room when only bots remain", async () => {
    const watcher = await client();
    await watcher.emit("lobby:subscribe");
    const host = await client();
    const room = await host.emit("room:create", { ...T, name: nm("Solo") });
    await host.emit("settings:update", { botCount: 2 });
    await host.emit("room:leave");
    await new Promise<void>((resolve) => {
      const check = (p: any) => {
        if (!p.games.some((g: any) => g.code === room.code)) resolve();
      };
      watcher.s.on("lobby", check);
    });
    expect((await watcher.emit("room:info", { code: room.code })).exists).toBe(false);
  });

  it("marks a player as offline when they open the game list", async () => {
    const host = await client();
    const room = await host.emit("room:create", { ...T, name: nm("Stay") });
    const b = await client();
    await b.emit("room:join", { ...T, code: room.code, name: nm("Wander") });
    await b.emit("lobby:subscribe");
    const v = await host.until((v) => v.players.some((p) => p.name.startsWith("Wander") && !p.connected));
    expect(v.players).toHaveLength(2);
  });

  it("tells an idle player why the game removed them, and ends their seat", async () => {
    const host = await client();
    const room = await host.emit("room:create", { ...T, name: nm("Busy") });
    // Two bots, so the game goes on even if the host also misses rounds.
    await host.emit("settings:update", { botCount: 2, submitSeconds: 20, judgeSeconds: 20 });
    const b = await client();
    const joined = await b.emit("room:join", { ...T, code: room.code, name: nm("Sleepy") });
    const removed = new Promise((r) => b.s.once("removed", r));

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      await host.emit("game:start");
      // Two rounds pass without the sleepy player. The host plays when not the Czar.
      for (let round = 0; round < 2; round++) {
        const v = host.view();
        if (v.mustSubmit) await host.emit("card:submit", { cardIds: [v.hand[0].id] });
        await vi.advanceTimersByTimeAsync(20_000);
        await vi.advanceTimersByTimeAsync(20_000);
        await vi.advanceTimersByTimeAsync(8_000);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(await removed).toEqual({ reason: "idle" });
    expect((await b.emit("room:resume", { code: room.code, token: joined.token })).ok).toBe(false);
  });

  it("tells the other players when the host removes someone", async () => {
    const host = await client();
    const room = await host.emit("room:create", { ...T, name: nm("Boss") });
    const b = await client();
    await b.emit("room:join", { ...T, code: room.code, name: nm("Watcher") });
    const c = await client();
    const target = await c.emit("room:join", { ...T, code: room.code, name: "Troublemaker" });

    const seenByB = new Promise((r) => b.s.once("player:removed", r));
    let seenByTarget = false;
    c.s.once("player:removed", () => (seenByTarget = true));
    await host.emit("player:kick", { playerId: target.playerId, ban: false });

    expect(await seenByB).toEqual({ playerId: target.playerId, name: "Troublemaker", reason: "kicked" });
    await new Promise((r) => setTimeout(r, 100));
    expect(seenByTarget).toBe(false);
  });

  it("makes a connection wait after the host removes it 3 times", async () => {
    const host = await client();
    const room = await host.emit("room:create", { ...T, name: nm("Strict") });
    let last: unknown = null;
    for (let i = 1; i <= 3; i++) {
      const c = await client();
      const joined = await c.emit("room:join", { ...T, code: room.code, name: nm(`Pest${i}`) });
      const removed = new Promise((r) => c.s.once("removed", r));
      await host.emit("player:kick", { playerId: joined.playerId, ban: false });
      last = await removed;
    }
    expect(last).toEqual({ reason: "kicked", times: 3, cooldownMs: 5 * 60_000 });
    const view = await host.until((v: any) => v.log.at(-1)?.text.includes("has had enough"));
    expect((view as any).log.at(-1)).toMatchObject({ tone: "danger" });
    const again = await client();
    expect((await again.emit("room:join", { ...T, code: room.code, name: nm("Pest4") })).error).toBe("REMOVAL_COOLDOWN");
  });

  it("refuses names that the name filter blocks", async () => {
    const a = await client();
    expect(await a.emit("name:check", { name: "Hitler Fan" })).toMatchObject({ available: false, reason: "NAME_BLOCKED" });
    expect((await a.emit("room:create", { ...T, name: "www.spam.com" })).error).toBe("NAME_BLOCKED");
    expect(await a.emit("name:check", { name: nm("Poop Lord") })).toMatchObject({ available: true });
  });

  it("hides a name in the public lists after people on 3 networks report it", async () =>
    withTestIps(async () => {
      const rude = nm("Rude");
      const target = await client({ name: rude, browser: "browser-of-rude-00001" }, "10.0.1.1");
      const room = await target.emit("room:create", { ...T, name: rude });
      const reporters = await Promise.all(
        [2, 3, 4].map((n) => client({ name: nm("Reporter"), browser: `browser-of-reporter-${n}` }, `10.0.1.${n}`)),
      );
      const handleOf = async (c: Awaited<ReturnType<typeof client>>) =>
        (await c.emit("lobby:subscribe")).online.find((u: { name: string }) => u.name === rude).handle;
      const handle = await handleOf(reporters[0]);

      // Two reports from one network count once.
      expect((await reporters[0].emit("name:report", { handle })).ok).toBe(true);
      expect((await reporters[0].emit("name:report", { handle })).ok).toBe(true);
      expect((await reporters[1].emit("name:report", { handle })).ok).toBe(true);
      let list = await reporters[0].emit("lobby:subscribe");
      expect(list.games.find((g: { code: string }) => g.code === room.code).hostName).toBe(rude);

      expect((await reporters[2].emit("name:report", { handle })).ok).toBe(true);
      list = await reporters[0].emit("lobby:subscribe");
      expect(list.games.find((g: { code: string }) => g.code === room.code)).toMatchObject({ hostName: "Hidden name" });
      expect(list.online.map((u: { name: string }) => u.name)).not.toContain(rude);
      expect(list.online.map((u: { name: string }) => u.name)).toContain("Hidden name");
      // The person still sees their own name.
      const own = await target.emit("lobby:subscribe");
      expect(own.online.find((u: { you: boolean }) => u.you).name).toBe(rude);
      // Nobody can report themselves.
      expect((await target.emit("name:report", { handle })).error).toBe("UNKNOWN_PLAYER");
    }));

  it("keeps blocked people apart, and hides the blocker from the online list", async () => {
    const browserA = "browser-of-blocker-0001";
    const browserB = "browser-of-pest-000001";
    const nameA = nm("Blocker");
    const nameB = nm("Pest");
    const a = await client({ name: nameA, browser: browserA });
    const room = await a.emit("room:create", { ...T, name: nameA });
    // B joins, and A blocks B from the players list.
    const b = await client({ name: nameB, browser: browserB });
    const joined = await b.emit("room:join", { ...T, code: room.code, name: nameB });
    const blocked = await a.emit("block:create", { playerId: joined.playerId });
    expect(blocked).toMatchObject({ ok: true, name: nameB });
    expect(typeof blocked.token).toBe("string");
    await b.emit("room:leave");
    expect((await a.emit("identity:update", { name: nameA, browser: browserA, blocks: [blocked.token] })).ok).toBe(true);

    // B, even with a new name in the same browser, cannot see or join A's room.
    const b2 = await client({ name: nm("Renamed"), browser: browserB });
    const listB = await b2.emit("lobby:subscribe");
    expect(listB.games.map((g: { code: string }) => g.code)).not.toContain(room.code);
    expect(listB.online.map((u: { name: string }) => u.name)).not.toContain(nameA);
    expect((await b2.emit("room:join", { ...T, code: room.code, name: nm("Renamed") })).error).toBe("ROOM_NOT_FOUND");
    expect((await b2.emit("room:info", { code: room.code })).exists).toBe(false);
    expect((await b2.emit("room:join", { ...T, code: room.code, name: nm("Watcher"), as: "spectator" })).error).toBe("ROOM_NOT_FOUND");

    // Somebody else sees A's room, and sees A as "playing".
    const c = await client({ name: nm("Bystander"), browser: "browser-of-bystander-01" });
    const listC = await c.emit("lobby:subscribe");
    expect(listC.games.map((g: { code: string }) => g.code)).toContain(room.code);
    expect(listC.online).toContainEqual(expect.objectContaining({ name: nameA, status: "playing" }));

    // A cannot join a room where B is.
    const other = await b2.emit("room:create", { ...T, name: nm("PestHost") });
    const a2 = await client({ name: nm("BlockerTwo"), browser: browserA, blocks: [blocked.token] });
    expect((await a2.emit("room:join", { ...T, code: other.code, name: nm("BlockerTwo") })).error).toBe("BLOCKED_IN_ROOM");
  });

  it("ignores block tokens that the server did not make", async () => {
    const x = await client({ name: nm("Faker"), browser: "browser-of-faker-00001", blocks: ["not-a-real-token"] });
    expect((await x.emit("lobby:subscribe")).ok).toBe(true);
  });

  it("lets the host unban a player, and shows bans only to the host", async () => {
    const host = await client();
    const room = await host.emit("room:create", { ...T, name: nm("Judge") });
    const b = await client();
    const banned = await b.emit("room:join", { ...T, code: room.code, name: "Saboteur" });
    await host.emit("player:kick", { playerId: banned.playerId, ban: true });

    const hostView = await host.until((v: any) => v.bans?.length === 1);
    const ban = (hostView as any).bans[0];
    expect(ban.name).toBe("Saboteur");
    // Everybody in the room can see the ban in the activity log.
    expect((hostView as any).log.at(-1)).toMatchObject({ text: "Saboteur was banned from this game room.", tone: "danger" });

    // A new name from the same connection is still blocked.
    const again = await client();
    expect((await again.emit("room:join", { ...T, code: room.code, name: "Totally New" })).error).toBe("BANNED");

    expect((await host.emit("player:unban", { banId: ban.id })).ok).toBe(true);
    await host.until((v: any) => v.bans.length === 0);
    const back = await again.emit("room:join", { ...T, code: room.code, name: "Totally New" });
    expect(back.ok).toBe(true);
    // Other players never see the ban list.
    const otherView = await again.until((v: any) => Array.isArray(v.bans));
    expect((otherView as any).bans).toEqual([]);
  });

  it("rejects malformed payloads and unknown settings", async () => {
    const a = await client();
    await a.emit("room:create", { ...T, name: nm("Host") });
    expect((await a.emit("settings:update", { botCount: "lots" })).error).toBe("BAD_REQUEST");
    expect((await a.emit("settings:update", { isAdmin: true })).error).toBe("BAD_REQUEST");
    expect((await a.emit("room:join", { ...T, code: "<script>", name: "x" })).error).toBe("BAD_REQUEST");
  });
});

describe("hosted games limit", () => {
  it("reads the limit from HOSTED_GAMES_PER_IP", () => {
    expect(hostedGamesFromEnv(undefined)).toBe(3);
    expect(hostedGamesFromEnv("5")).toBe(5);
    expect(hostedGamesFromEnv("0")).toBe(3);
    expect(hostedGamesFromEnv("abc")).toBe(3);
  });

  it("stops one IP address from hosting more open games than the limit", async () => {
    // A limit of 1 keeps the test short. All test clients share 127.0.0.1.
    const http = createServer();
    const io = new Server(http);
    attachGameServer(io, loadDecks(join(process.cwd(), "data/decks")), {
      joinsPerMinute: 1000,
      lookupsPerMinute: 1000,
      hostedGamesPerIp: 1,
    });
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
    const at = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const open = async () => {
      const s = connect(at, { transports: ["websocket"], forceNew: true });
      await new Promise<void>((r) => s.once("connect", () => r()));
      return s;
    };
    const a = await open();
    const b = await open();
    try {
      const first = await a.emitWithAck("room:create", { ...T, name: "Hostess" });
      expect(first.ok).toBe(true);
      // The host moves to a new game: the old seat is left first, so this works.
      const moved = await a.emitWithAck("room:create", { ...T, name: "Hostess", previous: { code: first.code, token: first.token } });
      expect(moved.ok).toBe(true);
      // Someone else on the same network cannot host a second game.
      expect((await b.emitWithAck("room:create", { ...T, name: "Second" })).error).toBe("HOSTED_GAMES_LIMIT");
      // Joining that game is fine.
      const joined = await b.emitWithAck("room:join", { ...T, code: moved.code, name: "Second" });
      expect(joined.ok).toBe(true);
      // When the host leaves, the host role passes to b, so b still cannot host another game.
      await a.emitWithAck("room:leave");
      expect((await b.emitWithAck("room:create", { ...T, name: "Third" })).error).toBe("HOSTED_GAMES_LIMIT");
      // When the game closes, the network can host again.
      await b.emitWithAck("room:leave");
      expect((await b.emitWithAck("room:create", { ...T, name: "Third" })).ok).toBe(true);
    } finally {
      a.close();
      b.close();
      io.close();
      await new Promise((r) => http.close(r));
    }
  });
});
