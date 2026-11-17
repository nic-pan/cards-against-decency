"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { call, session } from "@/lib/socket";
import { ERROR_TEXT } from "@/lib/protocol";
import { Button, Field, inputClass } from "./ui";

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
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setName(session.name());
    setAgreed(session.termsAccepted());
  }, []);

  const trimmed = name.trim();
  const ready = trimmed.length > 0 && agreed && !busy && !checking;

  async function finish(action: (name: string) => void) {
    if (!ready) return;
    // Names are unique on the whole server. Your own previous seat does not count.
    setChecking(true);
    setNameError(null);
    const r = await call<{ available: boolean; reason?: string }>("name:check", {
      name: trimmed,
      previous: session.current(),
    });
    setChecking(false);
    if (r.ok && !r.data.available) {
      setNameError(ERROR_TEXT[r.data.reason ?? "NAME_TAKEN"] ?? ERROR_TEXT.NAME_TAKEN);
      return;
    }
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
      <Field label="Username" hint="Other players see this name. It does not have to be your real name.">
        <input
          className={`${inputClass} text-lg`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          maxLength={NAME_MAX}
          required
          autoFocus
          autoComplete="nickname"
          placeholder="Your name"
        />
      </Field>

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

      {(nameError ?? error) && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm">{nameError ?? error}</p>}

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
