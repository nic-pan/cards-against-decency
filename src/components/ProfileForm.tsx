"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { isBotName } from "@/engine/bots";
import { call, session } from "@/lib/socket";
import { ERROR_TEXT, NAME_RESERVED_TEXT } from "@/lib/protocol";
import { Button, inputClass } from "./ui";

/** How long the player stops typing before the server checks the name. */
const CHECK_DELAY_MS = 500;

type NameProblem = { code: string } | null;

export const NAME_MAX = 24;

/** Name and terms form. Used on the front page and on invite links. */
export function ProfileForm({
  submitLabel,
  onSubmit,
  secondaryLabel,
  onSecondary,
  busy = false,
  error,
  children,
}: {
  submitLabel: string;
  /** Called with the trimmed name after the player accepts the terms. */
  onSubmit: (name: string) => void;
  /** Optional second action, for example "Watch as spectator". Needs the same name and terms. */
  secondaryLabel?: string;
  onSecondary?: (name: string) => void;
  busy?: boolean;
  error?: string | null;
  /** Extra fields, for example a room password. */
  children?: ReactNode;
}) {
  const termsId = useId();
  const nameId = useId();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<NameProblem>(null);
  // The name of the newest check. An older answer that arrives late is ignored.
  const latest = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setName(session.name());
    setAgreed(session.termsAccepted());
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const trimmed = name.trim();
  const ready = trimmed.length > 0 && agreed && !busy && !checking && !problem;

  /** Asks the server if the name is free. Names are unique on the whole server; your own previous seat does not count. */
  async function check(candidate: string): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (!candidate) return false;
    if (isBotName(candidate)) {
      setProblem({ code: "NAME_RESERVED" });
      return false;
    }
    latest.current = candidate;
    const r = await call<{ available: boolean; reason?: string }>("name:check", {
      name: candidate,
      previous: session.current(),
    });
    if (latest.current !== candidate) return false;
    const taken = r.ok && !r.data.available;
    setProblem(taken ? { code: r.data.reason ?? "NAME_TAKEN" } : null);
    return !taken;
  }

  /** While the player types: the bot names at once, the server after a short pause. */
  function onNameChange(value: string) {
    setName(value);
    const candidate = value.trim();
    if (timer.current) clearTimeout(timer.current);
    latest.current = candidate;
    if (candidate && isBotName(candidate)) return setProblem({ code: "NAME_RESERVED" });
    setProblem(null);
    if (candidate) timer.current = setTimeout(() => void check(candidate), CHECK_DELAY_MS);
  }

  async function finish(action: (name: string) => void) {
    if (!ready) return;
    setChecking(true);
    const free = await check(trimmed);
    setChecking(false);
    if (!free) return;
    session.setName(trimmed);
    session.acceptTerms();
    action(trimmed);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void finish(onSubmit);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={nameId} className="mb-1 block text-sm font-semibold">
          Username
        </label>
        <input
          id={nameId}
          className={`${inputClass} text-lg ${problem ? "border-danger focus:border-danger" : ""}`}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={() => void check(trimmed)}
          maxLength={NAME_MAX}
          required
          autoFocus
          autoComplete="nickname"
          placeholder="Your name"
          aria-invalid={!!problem}
          aria-describedby={`${nameId}-note`}
        />
        <div id={`${nameId}-note`} aria-live="polite">
          {problem ? (
            <NameError code={problem.code} />
          ) : (
            <span className="mt-1 block text-xs text-muted">
              Other players see this name. It does not have to be your real name.
            </span>
          )}
        </div>
      </div>

      {children}

      <div className="flex items-start gap-3 rounded-lg border border-line bg-paper p-3">
        <input
          id={termsId}
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <label htmlFor={termsId} className="text-sm leading-snug">
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="font-semibold underline">
            Terms of Use
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" target="_blank" className="font-semibold underline">
            Privacy Notice
          </Link>
          .
        </label>
      </div>

      {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">{error}</p>}

      <Button className="w-full" disabled={!ready}>
        {submitLabel}
      </Button>
      {secondaryLabel && onSecondary && (
        <Button type="button" variant="ghost" className="w-full" disabled={!ready} onClick={() => void finish(onSecondary)}>
          {secondaryLabel}
        </Button>
      )}
    </form>
  );
}

/** The message under the name field when the name cannot be used. */
function NameError({ code }: { code: string }) {
  return (
    <div role="alert" className="mt-2 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm">
      {code === "NAME_RESERVED" ? (
        <>
          <b className="block text-danger">{NAME_RESERVED_TEXT.title}</b>
          <span className="mt-0.5 block text-ink">{NAME_RESERVED_TEXT.body}</span>
        </>
      ) : (
        <span className="font-semibold text-danger">{ERROR_TEXT[code] ?? ERROR_TEXT.NAME_TAKEN}</span>
      )}
    </div>
  );
}
