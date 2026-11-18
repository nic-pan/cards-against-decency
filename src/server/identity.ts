import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { nameKey } from "../engine/game";

// Who is behind a connection, and whom they blocked. There are no accounts:
// a person is a username plus a random browser id that the page keeps in
// local storage. A block covers both, so a new name in the same browser, or
// the same name in another browser, is still blocked.

export interface Identity {
  name: string;
  nameKey: string;
  /** Random id that the browser keeps. Never sent to other players. */
  browser: string;
  blockedBrowsers: Set<string>;
  blockedNames: Set<string>;
}

/** What the page sends when it connects, and again when the name or the blocks change. */
export const identityInput = z.object({
  name: z.string().max(64).optional(),
  browser: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  blocks: z.array(z.string().max(400)).max(200).optional(),
});

const MAX_BLOCKS = 200;

/**
 * Seals a blocked person (browser id + name) into a string that only this server
 * can read. The blocker's browser stores the sealed string, so it never learns the
 * other person's browser id. Each seal is different, so two seals of the same
 * person cannot be matched.
 */
export class BlockSeal {
  private readonly key: Buffer;
  private readonly handleKey: Buffer;

  constructor(key?: Buffer) {
    // Without a fixed key, blocks stop working after a server restart.
    this.key = key ?? randomBytes(32);
    this.handleKey = randomBytes(32);
  }

  static fromEnv(value: string | undefined): BlockSeal {
    const key = value ? Buffer.from(value, "base64") : undefined;
    if (key && key.length !== 32) throw new Error("BLOCK_KEY must be 32 bytes, base64-encoded");
    if (!key) console.warn("BLOCK_KEY is not set: blocks are lost when the server restarts.");
    return new BlockSeal(key);
  }

  seal(browser: string, name: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify({ b: browser, n: nameKey(name) }), "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  open(token: string): { browser: string; nameKey: string } | null {
    try {
      const raw = Buffer.from(token, "base64url");
      if (raw.length < 29) return null;
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
      const v = JSON.parse(text) as { b?: unknown; n?: unknown };
      return typeof v.b === "string" && typeof v.n === "string" ? { browser: v.b, nameKey: v.n } : null;
    } catch {
      return null;
    }
  }

  /** A short public id for a browser in the online list. It changes when the server restarts. */
  handle(browser: string): string {
    return createHmac("sha256", this.handleKey).update(browser).digest("base64url").slice(0, 16);
  }

  identity(input: z.infer<typeof identityInput>): Identity {
    const blockedBrowsers = new Set<string>();
    const blockedNames = new Set<string>();
    for (const token of (input.blocks ?? []).slice(0, MAX_BLOCKS)) {
      const v = this.open(token);
      if (!v) continue;
      blockedBrowsers.add(v.browser);
      if (v.nameKey) blockedNames.add(v.nameKey);
    }
    const name = input.name ?? "";
    return { name, nameKey: nameKey(name), browser: input.browser, blockedBrowsers, blockedNames };
  }
}

/** True when a blocked b. */
export function hasBlocked(a: Identity | undefined, b: Identity | undefined): boolean {
  if (!a || !b || a.browser === b.browser) return false;
  return a.blockedBrowsers.has(b.browser) || (b.nameKey !== "" && a.blockedNames.has(b.nameKey));
}
