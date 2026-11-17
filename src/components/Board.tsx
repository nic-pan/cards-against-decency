"use client";

import { useEffect, useState } from "react";
import type { GameView, SubmissionView, WhiteCard } from "@/lib/protocol";
import { BlackCardView, WhiteCardView } from "./Cards";
import type { Act } from "./Room";
import { Button } from "./ui";

function useSecondsLeft(deadline: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - (now + offset)) / 1000));
}

export function Board({ view, isHost, act, clockOffset }: { view: GameView; isHost: boolean; act: Act; clockOffset: number }) {
  const round = view.round;
  const left = useSecondsLeft(round?.deadline ?? null, clockOffset);
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? "Someone who left";

  if (view.phase === "gameOver") return <GameOver view={view} isHost={isHost} act={act} nameOf={nameOf} />;
  if (!round) return null;

  const isCzar = round.czarId === view.youId;

  return (
    <div className="space-y-5">
      <StatusBar view={view} isCzar={isCzar} left={left} nameOf={nameOf} />

      {view.phase === "submitting" && <Submitting view={view} isCzar={isCzar} act={act} />}
      {view.phase === "judging" && <Judging view={view} isCzar={isCzar} act={act} nameOf={nameOf} />}
      {view.phase === "roundOver" && <RoundResult view={view} nameOf={nameOf} left={left} />}

      {isHost && <HostBar act={act} />}
    </div>
  );
}

function StatusBar({
  view,
  isCzar,
  left,
  nameOf,
}: {
  view: GameView;
  isCzar: boolean;
  left: number | null;
  nameOf: (id: string | null) => string;
}) {
  const round = view.round!;
  let text: string;
  if (view.youAreSpectator) {
    text =
      view.phase === "submitting"
        ? "You are watching. The players are choosing their cards."
        : view.phase === "judging"
          ? `You are watching. ${nameOf(round.czarId)} is choosing the best answer.`
          : round.end === "winner"
            ? "Round over."
            : "Round skipped.";
  } else if (view.phase === "submitting") {
    text = isCzar
      ? "You are the Card Czar. Wait while the others play their cards."
      : view.mustSubmit
        ? `Choose ${round.black.pick === 1 ? "a card" : `${round.black.pick} cards`} to play.`
        : view.yourSubmission
          ? "You played. Waiting for the others."
          : "You join from the next round.";
  } else if (view.phase === "judging") {
    text = isCzar ? "Choose the best answer." : `${nameOf(round.czarId)} is choosing the best answer.`;
  } else {
    text = round.end === "winner" ? "Round over." : "Round skipped.";
  }
  const urgent = left !== null && left <= 10 && view.phase !== "roundOver";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">Round {round.number}</span>
      <span className="text-sm">
        Card Czar: <b className="text-accent">{isCzar ? "You" : nameOf(round.czarId)}</b>
      </span>
      <span className="w-full text-base font-semibold sm:w-auto sm:flex-1">{text}</span>
      {view.phase === "submitting" && (
        <span className="text-sm text-muted">
          {round.submittedCount}/{round.expectedCount} played
        </span>
      )}
      {left !== null && (
        <span className={`font-mono text-lg font-bold tabular-nums ${urgent ? "text-accent" : ""}`} aria-label="Seconds left">
          {left}s
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Submitting({ view, isCzar, act }: { view: GameView; isCzar: boolean; act: Act }) {
  const round = view.round!;
  const pick = round.black.pick;
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Clear the selection when a new round starts.
  useEffect(() => setSelected([]), [round.number]);

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((c) => c !== id) : pick === 1 ? [id] : cur.length < pick ? [...cur, id] : cur,
    );

  const chosen = selected.map((id) => view.hand.find((c) => c.id === id)).filter(Boolean) as WhiteCard[];
  const answers = view.yourSubmission ?? (chosen.length ? chosen : undefined);

  async function submit() {
    setSending(true);
    const ok = await act("card:submit", { cardIds: selected });
    setSending(false);
    if (ok) setSelected([]);
  }

  return (
    <>
      <div className="mx-auto max-w-xl">
        <BlackCardView card={round.black} answers={answers?.map((c) => c.text)} />
      </div>

      {view.yourSubmission && (
        <p className="text-center text-sm text-muted">Your answer is in. The Card Czar will see it without your name.</p>
      )}

      {!view.youAreSpectator && <section>
        <h3 className="mb-2 text-sm font-bold text-muted">
          Your cards
          {isCzar && " (you do not play this round)"}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {view.hand.map((card) => (
            <WhiteCardView
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              order={pick > 1 && selected.includes(card.id) ? selected.indexOf(card.id) + 1 : undefined}
              disabled={!view.mustSubmit}
              onClick={view.mustSubmit ? () => toggle(card.id) : undefined}
            />
          ))}
        </div>
      </section>}

      {view.mustSubmit && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <span className="text-sm text-muted">
              {selected.length}/{pick} selected
            </span>
            <Button className="ml-auto px-8" disabled={selected.length !== pick || sending} onClick={submit}>
              {pick === 1 ? "Play this card" : `Play ${pick} cards`}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function Judging({
  view,
  isCzar,
  act,
}: {
  view: GameView;
  isCzar: boolean;
  act: Act;
  nameOf: (id: string | null) => string;
}) {
  const round = view.round!;
  const subs = round.submissions ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => setChosen(null), [round.number]);
  const preview = subs.find((s) => s.id === chosen);

  return (
    <>
      <div className="mx-auto max-w-xl">
        <BlackCardView card={round.black} answers={preview?.cards.map((c) => c.text)} />
      </div>
      <section>
        <h3 className="mb-2 text-sm font-bold text-muted">
          {subs.length} answer{subs.length === 1 ? "" : "s"}
          {isCzar && " — tap one to preview it, then confirm"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subs.map((s) => (
            <SubmissionGroup
              key={s.id}
              sub={s}
              selected={chosen === s.id}
              onClick={isCzar ? () => setChosen(s.id) : undefined}
            />
          ))}
        </div>
      </section>
      {isCzar && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-6xl justify-end">
            <Button className="px-8" disabled={!chosen} onClick={() => chosen && act("czar:pick", { submissionId: chosen })}>
              Choose this answer
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function SubmissionGroup({
  sub,
  selected,
  onClick,
  label,
}: {
  sub: SubmissionView;
  selected?: boolean;
  onClick?: () => void;
  label?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl p-2 transition ${
        sub.isWinner ? "bg-accent-soft ring-2 ring-accent" : selected ? "bg-accent-soft" : "bg-transparent"
      }`}
    >
      <div className={`grid gap-2 ${sub.cards.length > 1 ? "grid-cols-2" : ""}`}>
        {sub.cards.map((c, i) => (
          <WhiteCardView
            key={c.id}
            card={c}
            selected={selected}
            order={sub.cards.length > 1 ? i + 1 : undefined}
            onClick={onClick}
          />
        ))}
      </div>
      {label && <div className="mt-2 px-1 text-sm">{label}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function RoundResult({ view, nameOf, left }: { view: GameView; nameOf: (id: string | null) => string; left: number | null }) {
  const round = view.round!;
  const subs = round.submissions ?? [];
  const winner = subs.find((s) => s.isWinner);
  return (
    <>
      <div className="mx-auto max-w-xl">
        <BlackCardView card={round.black} answers={winner?.cards.map((c) => c.text)} />
      </div>
      {winner ? (
        <p className="text-center text-xl font-black">
          {winner.playerId === view.youId ? "You win this round!" : `${nameOf(winner.playerId)} wins this round.`}
        </p>
      ) : (
        <p className="text-center text-lg font-semibold">Nobody scored this round.</p>
      )}
      {left !== null && <p className="text-center text-sm text-muted">Next round in {left} seconds.</p>}
      {subs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...subs]
            .sort((a, b) => Number(b.isWinner) - Number(a.isWinner))
            .map((s) => (
              <SubmissionGroup
                key={s.id}
                sub={s}
                label={
                  <span className={s.isWinner ? "font-bold" : "text-muted"}>
                    {s.isWinner && "★ "}
                    {s.playerId === view.youId ? "You" : nameOf(s.playerId)}
                  </span>
                }
              />
            ))}
        </div>
      )}
    </>
  );
}

function GameOver({
  view,
  isHost,
  act,
  nameOf,
}: {
  view: GameView;
  isHost: boolean;
  act: Act;
  nameOf: (id: string | null) => string;
}) {
  const ranked = [...view.players].sort((a, b) => b.score - a.score);
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-muted">Game over</p>
      <h2 className="mt-2 text-3xl font-black">
        {view.winnerId ? (view.winnerId === view.youId ? "You win!" : `${nameOf(view.winnerId)} wins!`) : "Nobody scored."}
      </h2>
      <ol className="mx-auto mt-6 max-w-xs space-y-1 text-left">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between">
            <span>
              {i + 1}. {p.name}
              {p.isBot && <span className="text-muted"> (bot)</span>}
            </span>
            <span className="font-bold tabular-nums">{p.score}</span>
          </li>
        ))}
      </ol>
      {isHost ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => act("game:start")}>Play again</Button>
          <Button variant="ghost" onClick={() => act("game:lobby")}>
            Change settings
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">The host can start a new game.</p>
      )}
    </section>
  );
}

function HostBar({ act }: { act: Act }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-sm">
      <span className="text-muted">Host:</span>
      {confirm ? (
        <>
          <span>End the game for everyone?</span>
          <Button variant="danger" className="min-h-9 px-3" onClick={() => act("game:end")}>
            End game
          </Button>
          <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirm(true)}>
          End game
        </Button>
      )}
    </div>
  );
}
