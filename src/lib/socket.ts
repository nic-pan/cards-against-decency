"use client";

import { io, type Socket } from "socket.io-client";
import type { Ack, ClientToServer, IdentityPayload, ServerToClient } from "./protocol";
import { ERROR_TEXT, TERMS_VERSION } from "./protocol";

export type GameSocket = Socket<ServerToClient, ClientToServer>;

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  // The identity goes with every (re)connection, so the server knows it before the first request.
  if (!socket) socket = io({ transports: ["websocket", "polling"], auth: (cb) => cb(identity()) });
  return socket;
}

/** A random id for this browser. It lets a block cover a person who changes their name. Log out deletes it. */
function browserId(): string {
  try {
    let id = localStorage.getItem("bs.browser");
    if (!id) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem("bs.browser", id);
    }
    return id;
  } catch {
    // Without storage, the id lasts only while the page is open.
    return (fallbackId ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));
  }
}
let fallbackId: string | null = null;

function identity(): IdentityPayload {
  return { name: session.name() || undefined, browser: browserId(), blocks: blocks.list().map((b) => b.token) };
}

/** Tells the server about a new name or new blocks. */
export function sendIdentity(): void {
  if (socket?.connected) void call("identity:update", identity());
}

export interface BlockedPerson {
  name: string;
  /** Sealed by the server. Only the server can read it. */
  token: string;
}

/** People this browser blocked. Stored in this browser only. */
export const blocks = {
  list(): BlockedPerson[] {
    try {
      const v = JSON.parse(localStorage.getItem("bs.blocks") ?? "[]");
      return Array.isArray(v) ? v.filter((b) => typeof b?.name === "string" && typeof b?.token === "string") : [];
    } catch {
      return [];
    }
  },
  /** Blocks someone from the online list (handle) or from your room (playerId). */
  async add(target: { handle?: string; playerId?: string }): Promise<string | null> {
    const r = await call<{ token: string; name: string }>("block:create", target);
    if (!r.ok) return r.text;
    try {
      localStorage.setItem("bs.blocks", JSON.stringify([...blocks.list(), { name: r.data.name, token: r.data.token }]));
    } catch {}
    sendIdentity();
    return null;
  },
  remove(token: string): void {
    try {
      localStorage.setItem("bs.blocks", JSON.stringify(blocks.list().filter((b) => b.token !== token)));
    } catch {}
    sendIdentity();
  },
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string; text: string };

/** Sends an event and waits for the server's answer. */
export async function call<T = object>(event: keyof ClientToServer, payload?: unknown): Promise<Result<T>> {
  const s = getSocket() as unknown as Socket;
  try {
    const args = payload === undefined ? [] : [payload];
    const r = (await s.timeout(8000).emitWithAck(event, ...args)) as Ack<T>;
    if (r.ok) return { ok: true, data: r as T };
    return { ok: false, error: r.error, text: ERROR_TEXT[r.error] ?? r.message ?? r.error };
  } catch {
    return { ok: false, error: "TIMEOUT", text: "The server did not answer. Check your connection." };
  }
}

// The session token stays in this browser so a reload or a lost connection
// can resume the same seat. It is not sent anywhere except this server.
const key = (code: string) => `bs.session.${code}`;

export const session = {
  get(code: string): string | null {
    try {
      return localStorage.getItem(key(code));
    } catch {
      return null;
    }
  },
  set(code: string, token: string) {
    try {
      localStorage.setItem(key(code), token);
      localStorage.setItem("bs.current", JSON.stringify({ code, token }));
    } catch {}
  },
  clear(code: string) {
    try {
      localStorage.removeItem(key(code));
      if (session.current()?.code === code) localStorage.removeItem("bs.current");
    } catch {}
  },
  /** The last game this browser joined. The server frees it when the player moves on. */
  current(): { code: string; token: string } | undefined {
    try {
      const raw = localStorage.getItem("bs.current");
      const v = raw ? JSON.parse(raw) : null;
      return v && typeof v.code === "string" && typeof v.token === "string" ? v : undefined;
    } catch {
      return undefined;
    }
  },
  /** Forgets the name, the terms agreement and all seats. */
  logout() {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("bs.")) localStorage.removeItem(k);
    } catch {}
    sendIdentity();
  },
  name(): string {
    try {
      return localStorage.getItem("bs.name") ?? "";
    } catch {
      return "";
    }
  },
  setName(name: string) {
    try {
      localStorage.setItem("bs.name", name);
    } catch {}
    sendIdentity();
  },
  /** True when this browser accepted the current version of the terms. */
  termsAccepted(): boolean {
    try {
      return localStorage.getItem("bs.terms") === TERMS_VERSION;
    } catch {
      return false;
    }
  },
  acceptTerms() {
    try {
      localStorage.setItem("bs.terms", TERMS_VERSION);
    } catch {}
  },
};
