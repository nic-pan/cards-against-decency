import { createServer } from "node:http";
import { join } from "node:path";
import next from "next";
import { Server } from "socket.io";
import { loadDecks } from "./src/server/decks";
import { attachGameServer } from "./src/server/gameServer";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "localhost";
const port = Number(process.env.PORT ?? 3000);

const decks = loadDecks(join(process.cwd(), "data/decks"));
const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();

const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(httpServer, {
  // Game messages are small. Reject large payloads early.
  maxHttpBufferSize: 16 * 1024,
  serveClient: false,
});
attachGameServer(io, decks);

httpServer.listen(port, hostname, () => {
  const counts = decks.list().map((d) => `${d.name} (${d.blackCount}/${d.whiteCount})`).join(", ");
  console.log(`> Ready on http://${hostname}:${port} — decks: ${counts}`);
});
