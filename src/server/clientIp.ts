/**
 * Finds the player's IP address.
 *
 * Behind a hosting proxy, the socket address is the proxy, so the real address
 * is in X-Forwarded-For. A browser can send its own X-Forwarded-For, so we
 * never trust the left side of the list. Each trusted proxy appends the address
 * it saw, so we count `trustedHops` entries from the right.
 *
 * TRUST_PROXY=0 or unset: use the socket address (no proxy).
 * TRUST_PROXY=1: one proxy in front of the app (for example Render's load balancer).
 */
export function clientIp(
  forwardedFor: string | string[] | undefined,
  socketAddress: string,
  trustedHops: number,
): string {
  if (!Number.isInteger(trustedHops) || trustedHops < 1) return socketAddress;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
  if (!header) return socketAddress;
  const list = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // With N trusted proxies, the client is the Nth entry from the right.
  const ip = list[list.length - trustedHops];
  return ip ?? socketAddress;
}

/**
 * Reads the player's address from a header that the host's edge network sets
 * and protects, for example "cf-connecting-ip" behind Cloudflare (Render).
 * Use it only when every request passes through that network: otherwise a
 * browser could send the header itself. Falls back to clientIp() when the
 * header is missing.
 */
export function clientIpFrom(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string,
  options: { trustedHops: number; header?: string },
): string {
  if (options.header) {
    const raw = headers[options.header.toLowerCase()];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (value && value.length <= 64 && /^[0-9a-fA-F:.]+$/.test(value)) return value;
  }
  return clientIp(headers["x-forwarded-for"], socketAddress, options.trustedHops);
}

/** Header names that clientIpFrom may read. Other names are ignored. */
const ALLOWED_IP_HEADERS = ["cf-connecting-ip", "true-client-ip", "x-real-ip"];

export function ipHeaderFromEnv(value: string | undefined): string | undefined {
  const name = value?.trim().toLowerCase();
  return name && ALLOWED_IP_HEADERS.includes(name) ? name : undefined;
}

export function trustedHopsFromEnv(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
}
