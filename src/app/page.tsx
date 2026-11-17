"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { call, session } from "@/lib/socket";
import type { JoinResult } from "@/lib/protocol";
import { Button, Field, inputClass } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(session.name()), []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await call<JoinResult>("room:create", { name, password: usePassword && password ? password : undefined });
    setBusy(false);
    if (!r.ok) return setError(r.text);
    session.setName(name);
    session.set(r.data.code, r.data.token);
    router.push(`/r/${r.data.code}`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return setError("Room codes have 6 characters.");
    if (name.trim()) session.setName(name.trim());
    router.push(`/r/${c}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-10">
        <div className="inline-flex items-center gap-3">
          <Logo />
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Blank Slate</h1>
        </div>
        <p className="mt-3 max-w-xl text-lg text-muted">
          A fill-in-the-blank party card game. Make a room, send the link to your friends, and play in the browser.
          No accounts, no downloads.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <form onSubmit={create} className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 text-lg font-bold">Create a room</h2>
          <Field label="Your name">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              required
              autoComplete="nickname"
            />
          </Field>
          <label className="mt-3 flex items-center gap-2 text-sm">
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
          <Button className="mt-5 w-full" disabled={busy || !name.trim()}>
            Create room
          </Button>
        </form>

        <form onSubmit={join} className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 text-lg font-bold">Join a room</h2>
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
          <p className="mt-3 text-sm text-muted">Got an invitation link? Open it and you go straight to the room.</p>
          <Button className="mt-5 w-full" variant="secondary" disabled={code.length !== 6}>
            Join room
          </Button>
        </form>
      </div>

      {error && <p className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm">{error}</p>}

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

function Logo() {
  return (
    <span aria-hidden className="relative inline-block h-10 w-8">
      <span className="absolute inset-0 rotate-[-8deg] rounded-md bg-card-black ring-1 ring-line" />
      <span className="absolute inset-0 translate-x-2 rotate-[6deg] rounded-md border border-line bg-card-white" />
    </span>
  );
}
