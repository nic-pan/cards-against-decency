"use client";

import { useEffect, useState } from "react";
import { session } from "@/lib/socket";
import { GameBrowser } from "@/components/GameBrowser";
import { ProfileForm } from "@/components/ProfileForm";

type Step = { kind: "loading" } | { kind: "profile" } | { kind: "browse"; name: string };

export default function Home() {
  const [step, setStep] = useState<Step>({ kind: "loading" });

  // A returning player who already chose a name and accepted the current terms goes straight to the game list.
  useEffect(() => {
    const name = session.name().trim();
    setStep(name && session.termsAccepted() ? { kind: "browse", name } : { kind: "profile" });
  }, []);

  if (step.kind === "browse") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-5 flex items-center gap-3">
          <Logo />
          <h1 className="text-2xl font-black tracking-tight">Cards Against Decency</h1>
        </header>
        <GameBrowser name={step.name} onLogout={() => setStep({ kind: "profile" })} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8 text-center sm:mb-10">
        <div className="inline-flex items-center gap-3">
          <Logo />
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Cards Against Decency</h1>
        </div>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
          A fill-in-the-blank party card game. Play with friends in the browser. No accounts, no downloads.
        </p>
      </header>

      {step.kind === "loading" ? (
        <div className="h-80" aria-busy />
      ) : (
        <section className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="mb-1 text-xl font-bold">Choose a username</h2>
          <p className="mb-5 text-sm text-muted">You need a name and the terms to start playing.</p>
          <ProfileForm submitLabel="Continue" onSubmit={(name) => setStep({ kind: "browse", name })} />
        </section>
      )}

      <section className="mt-12 grid gap-4 text-sm text-muted sm:grid-cols-3">
        <p>
          <b className="text-ink">How to play.</b> Each round, one player is the Card Czar and reads a black card.
          Everybody else plays their funniest white card.
        </p>
        <p>
          <b className="text-ink">Who wins.</b> The Card Czar chooses the best answer without knowing who played it.
          That player gets an Offence. Offences are the points in this game.
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
      <span className="absolute inset-0 rotate-[-8deg] rounded-md bg-card-black ring-1 ring-[#555]" />
      <span className="absolute inset-0 translate-x-2 rotate-[6deg] rounded-md border border-line bg-card-white" />
    </span>
  );
}
