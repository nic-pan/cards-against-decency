"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FEEDBACK_MAX, FEEDBACK_MIN } from "@/lib/protocol";
import { call } from "@/lib/socket";
import { Button } from "./ui";

type FeedbackType = "bug" | "idea" | "other";
type FeedbackPage = "home" | "game" | "info";

const TYPES: { value: FeedbackType; label: string; hint: string }[] = [
  { value: "bug", label: "🐞 Bug", hint: "Something does not work" },
  { value: "idea", label: "💡 Idea", hint: "A feature or a change" },
  { value: "other", label: "💬 Other", hint: "Anything else" },
];

const PLACEHOLDER: Record<FeedbackType, string> = {
  bug: "What happened, and what did you expect? What did you do just before?",
  idea: "What would you like to see in the game?",
  other: "Your message",
};

/** The "Feedback" button in the corner of the home page and the info pages. Rooms have their own button in the header. */
export function FloatingFeedback() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (path.startsWith("/r/")) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold shadow-lg hover:bg-paper"
      >
        <span aria-hidden>💬</span> Feedback
      </button>
      {open && <FeedbackDialog page={path === "/" ? "home" : "info"} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The form for bug reports and ideas. */
export function FeedbackDialog({ page, onClose }: { page: FeedbackPage; onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const first = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const length = message.trim().length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (length < FEEDBACK_MIN) {
      setError(`Write at least ${FEEDBACK_MIN} characters.`);
      return;
    }
    setSending(true);
    setError(null);
    const r = await call("feedback:send", { type, message, email: email.trim() || undefined, page, website: trap || undefined });
    setSending(false);
    if (r.ok) setSent(true);
    else setError(r.text);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <h2 id="feedback-title" className="flex-1 text-xl font-black">
            {sent ? "Thank you!" : "Send feedback"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-11 min-w-11 rounded-lg border border-line text-lg hover:bg-paper"
          >
            ✕
          </button>
        </div>

        {sent ? (
          <div className="mt-3 space-y-4 text-sm">
            <p>We got your message. We read every report, but we cannot answer all of them.</p>
            <Button onClick={onClose}>Back</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-4">
            <p className="text-sm text-muted">Found a bug, or have an idea for the game? Tell us.</p>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">What is it about?</legend>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <label
                    key={t.value}
                    className={`cursor-pointer rounded-lg border px-2 py-2 text-center text-sm ${
                      type === t.value ? "border-accent bg-accent-soft font-bold" : "border-line hover:bg-paper"
                    }`}
                  >
                    <input
                      type="radio"
                      name="feedback-type"
                      value={t.value}
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                      className="sr-only"
                    />
                    <span className="block">{t.label}</span>
                    <span className="block text-xs font-normal text-muted">{t.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Message</span>
              <textarea
                ref={first}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={FEEDBACK_MAX}
                rows={6}
                placeholder={PLACEHOLDER[type]}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-right text-xs text-muted">
                {message.length}/{FEEDBACK_MAX}
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                Email <span className="font-normal text-muted">(optional, only if you want an answer)</span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                autoComplete="email"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              />
            </label>

            {/* People never see this field. Bots fill it in, and the server then drops the report. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </label>
            </div>

            <p className="text-xs text-muted">
              We send your message, the game version, the page and your browser type (for example &quot;Chrome on
              Android&quot;). We do not send your username or the room code. Do not write passwords or other private
              details. Read the{" "}
              <Link href="/privacy" target="_blank" className="underline">
                Privacy Notice
              </Link>
              .
            </p>

            {error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
