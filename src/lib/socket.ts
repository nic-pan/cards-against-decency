"use client";

import { io, type Socket } from "socket.io-client";
import type { Ack, ClientToServer, ServerToClient } from "./protocol";
import { ERROR_TEXT, TERMS_VERSION } from "./protocol";

export type GameSocket = Socket<ServerToClient, ClientToServer>;

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (!socket) socket = io({ transports: ["websocket", "polling"] });
  return socket;
}

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
    } catch {}
  },
  clear(code: string) {
    try {
      localStorage.removeItem(key(code));
    } catch {}
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
