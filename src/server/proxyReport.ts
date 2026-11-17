import type { IncomingMessage } from "node:http";
import { clientIpFrom, ipHeaderFromEnv, trustedHopsFromEnv } from "./clientIp";

// TEMPORARY diagnostic for the TRUST_PROXY setting. Remove it after the check.
// It reports counts and header names only. It never returns an IP address.

const PROXY_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "true-client-ip",
  "cf-connecting-ip",
  "x-forwarded-proto",
  "x-forwarded-host",
  "forwarded",
  "via",
];

/** True for loopback and private network addresses, which point to a proxy inside the host. */
export function isPrivateAddress(address: string): boolean {
  const a = address.replace(/^::ffff:/, "");
  return (
    a === "::1" ||
    /^127\./.test(a) ||
    /^10\./.test(a) ||
    /^192\.168\./.test(a) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(a) ||
    /^f[cd][0-9a-f]{2}:/i.test(a)
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export function proxyReport(req: IncomingMessage) {
  const raw = req.headers["x-forwarded-for"];
  const header = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const list = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const entries = list.length;
  const cf = one(req.headers["cf-connecting-ip"]);
  const trueClient = one(req.headers["true-client-ip"]);
  // Position of a header value in X-Forwarded-For, counted from the right (1 = last). Booleans and numbers only.
  const fromRight = (v: string | undefined) => {
    if (!v) return null;
    const i = list.lastIndexOf(v);
    return i < 0 ? null : list.length - i;
  };
  // A test value from the query string, for example ?probe=6.6.6.6, to see which headers a client can fake.
  const probe = new URL(req.url ?? "/", "http://x").searchParams.get("probe") ?? undefined;
  const trustedHops = trustedHopsFromEnv(process.env.TRUST_PROXY);
  return {
    forwardedForEntries: entries,
    trustedHops,
    directConnectionIsPrivate: isPrivateAddress(req.socket.remoteAddress ?? ""),
    proxyHeadersPresent: PROXY_HEADERS.filter((h) => req.headers[h] !== undefined),
    cfConnectingIpPositionFromRight: fromRight(cf),
    trueClientIpPositionFromRight: fromRight(trueClient),
    trueClientIpEqualsCfConnectingIp: cf !== undefined && cf === trueClient,
    clientIpHeader: ipHeaderFromEnv(process.env.CLIENT_IP_HEADER) ?? null,
    serverChoiceEqualsCfConnectingIp:
      cf !== undefined &&
      clientIpFrom(req.headers, req.socket.remoteAddress ?? "", {
        trustedHops,
        header: ipHeaderFromEnv(process.env.CLIENT_IP_HEADER),
      }) === cf,
    probe: probe
      ? {
          leftmostForwardedForIsProbe: list[0] === probe,
          cfConnectingIpIsProbe: cf === probe,
          trueClientIpIsProbe: trueClient === probe,
        }
      : null,
    howToRead:
      "Open this page normally: forwardedForEntries should equal trustedHops. " +
      "Then send a fake X-Forwarded-For header: the count should go up by exactly 1, " +
      "which proves that the proxy appends the real address on the right.",
  };
}
