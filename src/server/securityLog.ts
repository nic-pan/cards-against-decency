import { createHash, randomBytes } from "node:crypto";

// Security events go to stdout as JSON lines, separate from game state.
// IP addresses are never written in plain text. They are hashed with a salt
// that changes every day and exists only in memory, so the hashes cannot be
// joined across days or after a restart.

let salt = randomBytes(16);
let saltDay = new Date().toISOString().slice(0, 10);

export function ipKey(ip: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== saltDay) {
    salt = randomBytes(16);
    saltDay = today;
  }
  return createHash("sha256").update(salt).update(ip).digest("base64url").slice(0, 16);
}

export type SecurityEvent =
  | "rate_limited"
  | "join_rate_limited"
  | "bad_password"
  | "banned_join"
  | "kick"
  | "ban"
  | "unban"
  | "invalid_payload";

export function securityLog(event: SecurityEvent, data: { ip?: string; room?: string; detail?: string }): void {
  console.warn(
    JSON.stringify({
      t: new Date().toISOString(),
      kind: "security",
      event,
      room: data.room,
      ipKey: data.ip ? ipKey(data.ip) : undefined,
      detail: data.detail,
    }),
  );
}
