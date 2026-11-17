import { createServer } from "node:http";
import { join } from "node:path";
import next from "next";
import { Server } from "socket.io";
import { loadDecks } from "./src/server/decks";
import { attachGameServer } from "./src/server/gameServer";
import { proxyReport } from "./src/server/proxyReport";

const dev = process.env.NODE_ENV !== "production";
// Hosts such as Render need the server to listen on all interfaces.
const hostname = process.env.HOST ?? (dev ? "localhost" : "0.0.0.0");
const port = Number(process.env.PORT ?? 3000);

const decks = loadDecks(join(process.cwd(), "data/decks"));
const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();

const httpServer = createServer((req, res) => {
  // Health check for the host and for uptime monitors. It does not render a page.
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
    res.end("ok");
    return;
  }
  // TEMPORARY: shows how many proxies are in front of the app, so we can check TRUST_PROXY.
  // It never shows IP addresses. Remove it after the check.
  if (req.url === "/healthz/proxy" || req.url?.startsWith("/healthz/proxy?")) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(proxyReport(req), null, 2));
    return;
  }
  void handle(req, res);
});
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
