import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameView } from "../engine/game";
import { loadDecks } from "./decks";
import { attachGameServer } from "./gameServer";
import { TERMS_VERSION } from "../lib/protocol";

const T = { termsVersion: TERMS_VERSION };

let url = "";
let server: ReturnType<typeof createServer>;
let ioServer: Server;
const clients: Socket[] = [];

beforeAll(async () => {
  server = createServer();
  ioServer = new Server(server);
  attachGameServer(ioServer, loadDecks(join(process.cwd(), "data/decks")));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.close();
  ioServer.close();
  await new Promise((r) => server.close(r));
});

type View = GameView & { code: string };

async function client() {
  const s = connect(url, { transports: ["websocket"], forceNew: true });
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
    expect((await b.emit("room:join", { ...T, code: created.code.toLowerCase(), name: "Bo" })).ok).toBe(true);
    expect((await c.emit("room:join", { ...T, code: created.code, name: "Cy" })).ok).toBe(true);

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
    const created = await a.emit("room:create", { ...T, name: "Host" });
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
    const created = await a.emit("room:create", { ...T, name: "Host", password: "secret" });
    const b = await client();
    expect((await b.emit("room:info", { code: created.code })).needsPassword).toBe(true);
    expect((await b.emit("room:join", { ...T, code: created.code, name: "B" })).error).toBe("BAD_PASSWORD");
    expect((await b.emit("room:join", { ...T, code: created.code, name: "B", password: "secret" })).ok).toBe(true);
  });

  it("lets the host ban a player", async () => {
    const a = await client();
    const created = await a.emit("room:create", { ...T, name: "Host" });
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
    const created = await a.emit("room:create", { ...T, name: "Host" });
    const b = await client();
    expect((await b.emit("room:join", { code: created.code, name: "B" })).error).toBe("TERMS_REQUIRED");
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

  it("rejects malformed payloads and unknown settings", async () => {
    const a = await client();
    await a.emit("room:create", { ...T, name: "Host" });
    expect((await a.emit("settings:update", { botCount: "lots" })).error).toBe("BAD_REQUEST");
    expect((await a.emit("settings:update", { isAdmin: true })).error).toBe("BAD_REQUEST");
    expect((await a.emit("room:join", { ...T, code: "<script>", name: "x" })).error).toBe("BAD_REQUEST");
  });
});
