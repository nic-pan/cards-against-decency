"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BOT_DIVISION, BOT_PROFILES } from "@/engine/bots";
import { call, session } from "@/lib/socket";
import { GameBrowser } from "@/components/GameBrowser";
import { ProfileForm } from "@/components/ProfileForm";

type Step = { kind: "loading" } | { kind: "profile" } | { kind: "browse"; name: string };

export default function Home() {
  const [step, setStep] = useState<Step>({ kind: "loading" });

  // A returning player who already chose a name and accepted the current terms goes straight to the game list.
  useEffect(() => {
    const name = session.name().trim();
    setStep(name && session.termsAccepted() ? { kind: "browse", name } : { kind: "profile" });
    // A saved name that the name filter now blocks: the player must choose a new one.
    if (name) {
      void call<{ available: boolean; reason?: string }>("name:check", { name, previous: session.current() }).then((r) => {
        if (r.ok && r.data.reason === "NAME_BLOCKED") setStep({ kind: "profile" });
      });
    }
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
          <p className="mb-5 text-sm text-muted">You need a name and to agree to the terms to start playing.</p>
          <ProfileForm submitLabel="Continue" onSubmit={(name) => setStep({ kind: "browse", name })} />
        </section>
      )}

      <section className="mt-12 grid gap-4 text-sm text-muted sm:grid-cols-3">
        <p>
          <b className="text-ink">How to play.</b> Each round, one player takes the role of Card Czar and reads a black
          card. Everyone else plays their funniest white card. Poor judgement is strongly encouraged.
        </p>
        <p>
          <b className="text-ink">Who wins.</b> The Card Czar chooses the best answer without knowing who played it.
          The winning player gets an Offence. Offences are the points in this game. Your record will follow you.
        </p>
        <p>
          <b className="text-ink">Small group?</b> Call in the bots. The FBI, CIA, MI6 and other fine institutions will
          play random cards from the deck. Humans always judge. We have standards. Somewhere.
        </p>
      </section>

      <BotRoster />

      <p className="mt-4 text-center text-sm text-muted">
        Is it for kids? Can I play on my phone? Read the{" "}
        <Link href="/faq" className="font-semibold underline">
          FAQ
        </Link>
        .
      </p>
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

/** The list of bots, closed by default, under the instructions. */
function BotRoster() {
  return (
    <details className="group mt-4 rounded-2xl border border-line bg-surface text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span>
          🕵️ Meet the bots <span className="font-normal text-muted">({BOT_PROFILES.length} agents)</span>
        </span>
        <span aria-hidden className="text-muted transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        <p className="mb-3 text-muted">{BOT_DIVISION}. A bot gets one of these names when the host adds it to a game.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {BOT_PROFILES.map((b) => (
            <li key={b.name} className="rounded-lg border border-line bg-paper px-3 py-2">
              <p>
                <b>{b.name}</b> <span className="text-muted">· {b.title}</span>
              </p>
              <p className="mt-0.5 text-xs italic text-muted">{b.tagline}</p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
