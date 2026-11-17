import type { IncomingMessage } from "node:http";
import { trustedHopsFromEnv } from "./clientIp";

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

export function proxyReport(req: IncomingMessage) {
  const raw = req.headers["x-forwarded-for"];
  const header = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const entries = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
  const trustedHops = trustedHopsFromEnv(process.env.TRUST_PROXY);
  return {
    forwardedForEntries: entries,
    trustedHops,
    directConnectionIsPrivate: isPrivateAddress(req.socket.remoteAddress ?? ""),
    proxyHeadersPresent: PROXY_HEADERS.filter((h) => req.headers[h] !== undefined),
    howToRead:
      "Open this page normally: forwardedForEntries should equal trustedHops. " +
      "Then send a fake X-Forwarded-For header: the count should go up by exactly 1, " +
      "which proves that the proxy appends the real address on the right.",
  };
}
