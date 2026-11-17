"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { call, session } from "@/lib/socket";
import { TERMS_VERSION, type JoinResult } from "@/lib/protocol";
import { ProfileForm } from "@/components/ProfileForm";
import { Button, Field, inputClass } from "@/components/ui";

type Step = { kind: "loading" } | { kind: "profile" } | { kind: "play"; name: string };

export default function Home() {
  const [step, setStep] = useState<Step>({ kind: "loading" });

  // A returning player who already chose a name and accepted the current terms skips step 1.
  useEffect(() => {
    const name = session.name().trim();
    setStep(name && session.termsAccepted() ? { kind: "play", name } : { kind: "profile" });
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8 text-center sm:mb-10">
        <div className="inline-flex items-center gap-3">
          <Logo />
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Blank Slate</h1>
        </div>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
          A fill-in-the-blank party card game. Play with friends in the browser. No accounts, no downloads.
        </p>
      </header>

      {step.kind === "loading" && <div className="h-80" aria-busy />}

      {step.kind === "profile" && (
        <section className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="mb-1 text-xl font-bold">Choose a username</h2>
          <p className="mb-5 text-sm text-muted">You need a name and the terms to start playing.</p>
          <ProfileForm submitLabel="Continue" onSubmit={(name) => setStep({ kind: "play", name })} />
        </section>
      )}

      {step.kind === "play" && <PlayStep name={step.name} onChangeName={() => setStep({ kind: "profile" })} />}

      <section className="mt-12 grid gap-4 text-sm text-muted sm:grid-cols-3">
        <p>
          <b className="text-ink">How to play.</b> Each round, one player is the Card Czar and reads a black card.
          Everybody else plays their funniest white card.
        </p>
        <p>
          <b className="text-ink">Who wins.</b> The Card Czar chooses the best answer without knowing who played it.
          That player gets a point.
        </p>
        <p>
          <b className="text-ink">Small group?</b> Add bots. They play random cards from the deck. Humans always judge.
        </p>
      </section>
    </main>
  );
}

function PlayStep({ name, onChangeName }: { name: string; onChangeName: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await call<JoinResult>("room:create", {
      name,
      password: usePassword && password ? password : undefined,
      termsVersion: TERMS_VERSION,
    });
    setBusy(false);
    if (!r.ok) return setError(r.text);
    session.set(r.data.code, r.data.token);
    router.push(`/r/${r.data.code}`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return setError("Room codes have 6 characters.");
    router.push(`/r/${c}`);
  }

  return (
    <>
      <p className="mb-5 text-center text-sm">
        Playing as <b className="text-base">{name}</b>
        <span className="mx-2 text-muted">·</span>
        <button type="button" className="font-semibold text-accent underline" onClick={onChangeName}>
          Change
        </button>
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <form onSubmit={create} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-1 text-lg font-bold">Create a room</h2>
          <p className="mb-4 text-sm text-muted">You are the host. You choose the decks and the rules.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
            Protect the room with a password
          </label>
          {usePassword && (
            <div className="mt-3">
              <Field label="Room password">
                <input
                  className={inputClass}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={64}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          )}
          <Button className="mt-5 w-full" disabled={busy}>
            Create room
          </Button>
        </form>

        <form onSubmit={join} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-1 text-lg font-bold">Join a room</h2>
          <p className="mb-4 text-sm text-muted">Enter the code from the host, or open their invite link.</p>
          <Field label="Room code">
            <input
              className={`${inputClass} font-mono uppercase tracking-[0.3em]`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={6}
              placeholder="ABC234"
              required
              autoCapitalize="characters"
              autoComplete="off"
            />
          </Field>
          <Button className="mt-5 w-full" variant="secondary" disabled={code.length !== 6}>
            Join room
          </Button>
        </form>
      </div>

      {error && <p className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm">{error}</p>}
    </>
  );
}

function Logo() {
  return (
    <span aria-hidden className="relative inline-block h-10 w-8">
      <span className="absolute inset-0 rotate-[-8deg] rounded-md bg-card-black ring-1 ring-[#555]" />
      <span className="absolute inset-0 translate-x-2 rotate-[6deg] rounded-md border border-line bg-card-white" />
    </span>
  );
}
