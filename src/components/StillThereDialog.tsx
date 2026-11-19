"use client";

import { useEffect, useRef } from "react";
import { LOBBY_MAX_MINUTES, LOBBY_WARNING_SECONDS } from "@/lib/protocol";
import { playEventSound } from "@/lib/sounds";
import { useSecondsLeft } from "./Board";
import type { Act } from "./Room";

/**
 * "Is anyone still here?" Shown to everybody in a room that waited too long between games,
 * in the last LOBBY_WARNING_SECONDS before it closes. Anyone can keep the room open.
 */
export function StillThereDialog({
  closesAt,
  clockOffset,
  act,
  onLeave,
}: {
  closesAt: number | null;
  clockOffset: number;
  act: Act;
  onLeave: () => void;
}) {
  const left = useSecondsLeft(closesAt, clockOffset);
  const open = left !== null && left <= LOBBY_WARNING_SECONDS;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    playEventSound("idleWarning");
    button.current?.focus();
  }, [open]);

  if (!open) return null;
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="still-there-title"
        aria-describedby="still-there-text"
        className="w-full max-w-sm rounded-2xl border-2 border-accent bg-surface p-6 text-center shadow-xl"
      >
        <p className="text-4xl" aria-hidden>
          ⏳
        </p>
        <h2 id="still-there-title" className="mt-3 text-xl font-black">
          Is anyone still here?
        </h2>
        <p id="still-there-text" className="mt-2 text-sm leading-relaxed text-ink">
          Nobody has started a game for a while. This room closes in{" "}
          <b className="tabular-nums">
            {minutes}:{seconds}
          </b>{" "}
          unless someone keeps it open.
        </p>
        <p className="mt-2 text-xs text-muted">Waiting rooms close after {LOBBY_MAX_MINUTES} minutes without a game.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            ref={button}
            type="button"
            onClick={() => act("room:keepOpen")}
            className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-white hover:brightness-110"
          >
            Keep the room open
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="min-h-11 rounded-lg border border-line px-5 text-sm font-semibold hover:bg-paper"
          >
            Leave
          </button>
        </div>
      </section>
    </div>
  );
}
