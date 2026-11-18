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
        <GameBrowser
          name={step.name}
          onLogout={() => setStep({ kind: "profile" })}
          logo={
            <h1>
              <Wordmark className="h-14 w-auto sm:h-16" />
            </h1>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8 text-center sm:mb-10">
        <h1>
          <Wordmark className="mx-auto w-full max-w-md" />
        </h1>
        <div className="mx-auto mt-3 max-w-xl space-y-1">
          <p className="text-lg font-semibold">A party card game for people with questionable standards.</p>
          <p className="text-muted">Fill in the blanks. Make your friends regret inviting you.</p>
          <p className="text-muted">Play in your browser. No accounts, no downloads, no evidence retained.</p>
        </div>
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

/**
 * The full logo, with a transparent background. Dark pages get the version with white
 * text, light pages the version with dark text.
 */
function Wordmark({ className }: { className: string }) {
  return (
    <picture>
      <source srcSet="/logo/wordmark-dark.webp" media="(prefers-color-scheme: dark)" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo/wordmark.webp"
        alt="Cards Against Decency"
        width={960}
        height={360}
        className={className}
      />
    </picture>
  );
}
