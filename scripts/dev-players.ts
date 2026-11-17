// Development only: adds fake human players to a local room, for testing.
// They are not bots. The game treats them as real people.
//
// Usage (the dev server must run):
//   docker compose exec app npm run dev:players -- <ROOM CODE> [count] [--idle] [--password=...]
//
//   count       Number of players. Default 2, maximum 8.
//   --idle      The players only sit in the room. They do not play or judge.
//   --password  The room password, if the room has one.
//
// Without --idle, the players play random cards and choose random answers as
// Card Czar, after a short delay. Press Ctrl+C to remove them from the room.

import { io, type Socket } from "socket.io-client";
import { TERMS_VERSION, type GameView } from "../src/lib/protocol";

if (process.env.NODE_ENV === "production") {
  console.error("dev-players is for local development only.");
  process.exit(1);
}

const args = process.argv.slice(2);
const code = args.find((a) => /^[A-Za-z0-9]{6}$/.test(a))?.toUpperCase();
const count = Math.min(8, Number(args.find((a) => /^\d+$/.test(a)) ?? 2));
const idle = args.includes("--idle");
const password = args.find((a) => a.startsWith("--password="))?.slice("--password=".length);
const url = `http://localhost:${process.env.PORT ?? 3000}`;

if (!code) {
  console.error("Usage: npm run dev:players -- <ROOM CODE> [count] [--idle] [--password=...]");
  process.exit(1);
}

const NAMES = ["Tester Ana", "Tester Bo", "Tester Cy", "Tester Dee", "Tester Eli", "Tester Fen", "Tester Gus", "Tester Hal"];
const sockets: Socket[] = [];
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const later = (fn: () => void) => setTimeout(fn, 1500 + Math.random() * 2500);

async function addPlayer(name: string) {
  const socket = io(url, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));

  const r = await socket.emitWithAck("room:join", { code, name, password, termsVersion: TERMS_VERSION });
  if (!r.ok) {
    console.error(`${name}: could not join (${r.error}).`);
    socket.close();
    return;
  }
  console.log(`${name} joined ${code}.`);
  if (idle) return;

  // Act once in each round and phase.
  let acted = "";
  socket.on("state", (v: GameView) => {
    const round = v.round;
    if (!round) return;
    const key = `${round.number}:${v.phase}`;
    if (acted === key) return;

    if (v.mustSubmit) {
      acted = key;
      const cards = [...v.hand].sort(() => Math.random() - 0.5).slice(0, round.black.pick);
      later(() => void socket.emitWithAck("card:submit", { cardIds: cards.map((c) => c.id) }));
    } else if (v.phase === "judging" && round.czarId === v.youId && round.submissions?.length) {
      acted = key;
      const choice = pick(round.submissions);
      later(() => void socket.emitWithAck("czar:pick", { submissionId: choice.id }));
    }
  });
}

for (const name of NAMES.slice(0, count)) await addPlayer(name);
console.log(idle ? "The players are idle. Press Ctrl+C to remove them." : "The players play automatically. Press Ctrl+C to remove them.");

async function leave() {
  await Promise.all(sockets.map((s) => (s.connected ? s.timeout(2000).emitWithAck("room:leave").catch(() => {}) : null)));
  sockets.forEach((s) => s.close());
  process.exit(0);
}
process.on("SIGINT", leave);
process.on("SIGTERM", leave);
