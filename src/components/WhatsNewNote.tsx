"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CURRENT_RELEASE } from "@/lib/changelog";

const SEEN_KEY = "cad.whatsNewSeen";

/**
 * A note about the newest release on the home page. Only players who played before see it:
 * everything is new to a new player. Closing the note or opening the page hides it until the next release.
 */
export function WhatsNewNote({ returning }: { returning: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!returning) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      // Storage is blocked. Show the note.
    }
    setOpen(seen !== String(CURRENT_RELEASE.version));
  }, [returning]);

  if (!open) return null;

  const hide = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, String(CURRENT_RELEASE.version));
    } catch {
      // Storage is blocked. The note comes back on the next visit.
    }
  };

  return (
    <aside
      aria-label="What's new"
      className="mb-5 flex items-center gap-3 rounded-2xl border border-accent/50 bg-accent-soft px-4 py-3 text-sm"
    >
      <span aria-hidden className="text-lg">
        ✨
      </span>
      <p className="flex-1">
        <b>New: version {CURRENT_RELEASE.version}.</b> {CURRENT_RELEASE.summary}{" "}
        <Link href="/whats-new" onClick={hide} className="font-semibold underline">
          See what&apos;s new
        </Link>
      </p>
      <button
        type="button"
        onClick={hide}
        aria-label="Close"
        className="min-h-11 min-w-11 rounded-lg text-muted hover:bg-surface hover:text-ink"
      >
        ✕
      </button>
    </aside>
  );
}
