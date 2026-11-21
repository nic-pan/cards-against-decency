"use client";

import { useEffect, useRef, useState } from "react";
import { offences, type BlackCard, type GameView, type LastRoundView, type WhiteCard } from "@/lib/protocol";
import { BlackCardView, CARD_GRID, CardBack, CardSlot, CardStack, SENTENCE_GRID, SentenceAnswer, WhiteCardView, deckIdOf } from "./Cards";
import type { Act } from "./Room";
import { Badge, Button } from "./ui";

export function useSecondsLeft(deadline: number | null, offset: number): number | null {
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
  // All answers are in. Judging starts in a few seconds, so the last player can still take back a card.
  const judgingIn = useSecondsLeft(round?.judgingStartsAt ?? null, clockOffset);
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? "Someone who left";
  const [showLast, setShowLast] = useState(false);

  if (view.phase === "gameOver") return <GameOver view={view} isHost={isHost} act={act} nameOf={nameOf} />;
  if (!round) return null;

  const isCzar = round.czarId === view.youId;
  // During the end of a round, that round is already on the table. The button shows the round before it.
  const last = view.lastRound;
  const lastIsOnTable = !!last && view.phase === "roundOver" && last.number === round.number;
  const onShowLast = last && !lastIsOnTable ? () => setShowLast(true) : null;

  return (
    <div className="space-y-5">
      <StatusBar view={view} isCzar={isCzar} left={left} judgingIn={judgingIn} nameOf={nameOf} onShowLast={onShowLast} />
      {showLast && last && !lastIsOnTable && (
        <LastRoundDialog last={last} current={round.number} decks={view.decks} onClose={() => setShowLast(false)} />
      )}

      <Table view={view} isCzar={isCzar} act={act} left={left} nameOf={nameOf} />

      {isHost && <HostBar act={act} />}
    </div>
  );
}

function StatusBar({
  view,
  isCzar,
  left,
  judgingIn,
  nameOf,
  onShowLast,
}: {
  view: GameView;
  isCzar: boolean;
  left: number | null;
  judgingIn: number | null;
  nameOf: (id: string | null) => string;
  /** Opens the "Last round" window. Null when there is no earlier round to show. */
  onShowLast: (() => void) | null;
}) {
  const round = view.round!;
  const audience = round.audience;
  let text: string;
  if (view.phase === "judging" && audience) {
    const why = audience.reason === "czarLeft" ? "The Card Czar left." : "The Card Czar did not choose in time.";
    const you = view.audienceVote;
    text = !you?.canVote
      ? `${why} The players and spectators are voting.`
      : you.networkVotedBy
        ? `${you.networkVotedBy} already voted for your network. People on the same Wi-Fi share one vote.`
        : you.yourVote
        ? "You voted. You can change your vote until the time ends."
        : `${why} Vote for the best answer.`;
  } else if (view.phase === "submitting" && judgingIn !== null) {
    text = round.czarLeft
      ? `Everyone played. The vote starts in ${Math.max(1, judgingIn)}…`
      : `Everyone played. Judging starts in ${Math.max(1, judgingIn)}…`;
  } else if (view.phase === "submitting" && round.czarLeft) {
    text = view.mustSubmit
      ? `The Card Czar left. Play ${round.black.pick === 1 ? "a card" : `${round.black.pick} cards`}. Everyone votes for the winner.`
      : "The Card Czar left. When all answers are in, everyone votes for the winner.";
  } else if (view.youAreSpectator) {
    text =
      view.phase === "submitting"
        ? "You are watching. The players are choosing their cards."
        : view.phase === "judging"
          ? `You are watching. ${nameOf(round.czarId)} is choosing the best answer.`
          : round.end === "winner" || round.end === "audienceVote"
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
    text = round.end === "winner" || round.end === "audienceVote" ? "Round over." : "Round skipped.";
  }
  // The countdown turns red for the last 15 seconds.
  const urgent = left !== null && left <= 15 && view.phase !== "roundOver";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">Round {round.number}</span>
      <span className="text-sm">
        Card Czar: <b className="text-accent">{isCzar ? "You" : nameOf(round.czarId)}</b>
      </span>
      {/* On phones: round, Czar, count and timer on the first line, the status text on the second. */}
      <span className="order-last w-full text-base font-semibold sm:order-none sm:w-auto sm:flex-1">{text}</span>
      {onShowLast && (
        <button
          type="button"
          onClick={onShowLast}
          className="rounded-lg border border-line px-3 py-1 text-xs font-semibold hover:bg-paper"
        >
          Last round
        </button>
      )}
      {view.phase === "submitting" && (
        <span className="ml-auto text-sm text-muted sm:ml-0">
          {round.submittedCount}/{round.expectedCount} played
        </span>
      )}
      {view.phase === "judging" && audience && (
        <span className="ml-auto text-sm text-muted sm:ml-0">
          {audience.voted}/{audience.voters} voted
        </span>
      )}
      {left !== null && (
        <span
          className={`font-mono text-lg font-bold tabular-nums ${view.phase === "submitting" ? "" : "ml-auto sm:ml-0"} ${urgent ? "animate-pulse text-danger" : ""}`}
          aria-label="Seconds left"
        >
          {left}s
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The table: black card and action on the left, played cards on the right, your hand below.

type Action = { label: string; disabled: boolean; onClick: () => void; note?: string; secondary?: boolean };

function Table({
  view,
  isCzar,
  act,
  left,
  nameOf,
}: {
  view: GameView;
  isCzar: boolean;
  act: Act;
  left: number | null;
  nameOf: (id: string | null) => string;
}) {
  const round = view.round!;
  const pick = round.black.pick;
  const subs = round.submissions ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // The Card Czar's hand is hidden until the Czar chooses. The Czar can peek.
  const [peekHand, setPeekHand] = useState(false);
  const judgingThisRound = isCzar && (view.phase === "submitting" || view.phase === "judging");
  // The Card Czar is gone. The other players and the spectators vote for the best answer.
  const voting = view.phase === "judging" && !!round.audience;
  const yourVote = view.audienceVote?.yourVote ?? null;
  const ownAnswer = view.audienceVote?.yourSubmissionId ?? null;
  const canVoteNow = !!view.audienceVote?.canVote && !view.audienceVote.networkVotedBy;
  const canChoose = (subId: string) => (voting ? canVoteNow && subId !== ownAnswer : isCzar);

  // Clear the choices when a new round starts.
  useEffect(() => {
    setSelected([]);
    setChosen(null);
    setPeekHand(false);
  }, [round.number]);

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((c) => c !== id) : pick === 1 ? [id] : cur.length < pick ? [...cur, id] : cur,
    );

  const winner = subs.find((s) => s.isWinner);
  const deckName = (cardId: string) => view.decks.find((d) => d.id === deckIdOf(cardId))?.name;
  const handChoice = selected.map((id) => view.hand.find((c) => c.id === id)).filter(Boolean) as WhiteCard[];

  // The black card shows the answer that is being previewed or revealed.
  let answers: WhiteCard[] | undefined;
  if (view.phase === "roundOver") answers = winner?.cards;
  else if (view.phase === "judging") answers = subs.find((s) => s.id === chosen)?.cards;
  else answers = view.yourSubmission ?? (handChoice.length ? handChoice : undefined);

  async function run(event: Parameters<Act>[0], payload: unknown, after: () => void) {
    setSending(true);
    const ok = await act(event, payload);
    setSending(false);
    if (ok) after();
  }

  let action: Action | null = null;
  if (view.phase === "submitting" && view.mustSubmit) {
    action = {
      label: pick === 1 ? "Play this card" : `Play ${pick} cards`,
      disabled: selected.length !== pick || sending,
      onClick: () => void run("card:submit", { cardIds: selected }, () => setSelected([])),
      note: `${selected.length}/${pick} selected`,
    };
  } else if (view.phase === "submitting" && view.canTakeBack) {
    action = {
      label: pick === 1 ? "Take back my card" : "Take back my cards",
      disabled: sending,
      onClick: () => void run("card:takeBack", undefined, () => setSelected([])),
      note: "You can change your answer once in each round.",
      secondary: true,
    };
  } else if (voting && canVoteNow) {
    action = {
      label: yourVote ? "Change my vote" : "Vote for this answer",
      disabled: !chosen || chosen === yourVote || sending,
      onClick: () => chosen && void run("audience:vote", { submissionId: chosen }, () => setChosen(null)),
      note: yourVote ? "Your vote is marked. Tap another answer to change it." : "Tap an answer to choose it. You can't vote for your own answer.",
    };
  } else if (view.phase === "judging" && isCzar && !voting) {
    action = {
      label: "Confirm selection",
      disabled: !chosen || sending,
      onClick: () => chosen && void run("czar:pick", { submissionId: chosen }, () => setChosen(null)),
      note: chosen ? undefined : "Tap an answer to preview it",
    };
  }

  let playedHeading: React.ReactNode = (
    <>
      The white cards played this round are:{" "}
      {view.phase === "submitting" && (
        <span className="font-normal">
          ({round.submittedCount}/{round.expectedCount})
        </span>
      )}
    </>
  );
  if (view.phase === "roundOver") {
    playedHeading = winner ? (
      <span className="text-base text-ink">
        {winner.playerId === view.youId
          ? "You win this round and get an Offence!"
          : `${nameOf(winner.playerId)} wins this round and gets an Offence.`}
        {round.end === "audienceVote" && " The players and spectators chose it."}
        {left !== null && <span className="ml-2 text-sm font-normal text-muted">Next round in {left} s</span>}
      </span>
    ) : (
      <span className="text-base text-ink">
        Nobody got an Offence this round.
        {left !== null && <span className="ml-2 text-sm font-normal text-muted">Next round in {left} s</span>}
      </span>
    );
  }

  return (
    <>
      <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h3 className="mb-2 text-sm font-bold text-muted">The black card for this round is:</h3>
          <div className="mx-auto max-w-[15rem] md:max-w-none">
            <BlackCardView card={round.black} answers={answers?.map((c) => c.text)} deckName={deckName(round.black.id)} />
          </div>
          {action && <ActionBar action={action} />}
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-bold text-muted">{playedHeading}</h3>
          {/* Pick 2 and Pick 3 answers show as full sentences, so they need wider cells. */}
          <div className={view.phase !== "submitting" && pick > 1 ? SENTENCE_GRID : CARD_GRID}>
            {view.phase === "submitting" && (
              <>
                {Array.from({ length: round.submittedCount }, (_, i) =>
                  pick === 1 ? <CardBack key={`b${i}`} /> : <CardStack key={`b${i}`} count={pick} />,
                )}
                {Array.from({ length: Math.max(0, round.expectedCount - round.submittedCount) }, (_, i) => (
                  <CardSlot key={`s${i}`} />
                ))}
              </>
            )}

            {view.phase === "judging" &&
              subs.map((s) => (
                <Group
                  key={s.id}
                  size={s.cards.length}
                  black={round.black}
                  highlight={chosen === s.id ? "selected" : yourVote === s.id ? "winner" : undefined}
                  answer={{
                    cards: s.cards,
                    onClick: canChoose(s.id) ? () => setChosen(s.id) : undefined,
                    selected: chosen === s.id,
                  }}
                  label={
                    voting && (s.id === yourVote || s.id === ownAnswer) ? (
                      <span className={s.id === yourVote ? "font-bold text-ink" : "text-muted"}>
                        {s.id === yourVote ? "✓ Your vote" : "Your answer"}
                      </span>
                    ) : undefined
                  }
                >
                  {s.cards.map((c, i) => (
                    <WhiteCardView
                      key={c.id}
                      card={c}
                      deckName={deckName(c.id)}
                      selected={chosen === s.id}
                      order={s.cards.length > 1 ? i + 1 : undefined}
                      onClick={canChoose(s.id) ? () => setChosen(s.id) : undefined}
                    />
                  ))}
                </Group>
              ))}

            {view.phase === "roundOver" &&
              [...subs]
                .sort((a, b) => Number(b.isWinner) - Number(a.isWinner))
                .map((s) => (
                  <Group
                    key={s.id}
                    size={s.cards.length}
                    black={round.black}
                    highlight={s.isWinner ? "winner" : undefined}
                    answer={{ cards: s.cards }}
                    label={
                      <span className={s.isWinner ? "font-bold text-ink" : "text-muted"}>
                        {s.isWinner && "★ "}
                        {s.playerId === view.youId ? "You" : nameOf(s.playerId)}
                        {s.votes !== null && ` · ${s.votes} ${s.votes === 1 ? "vote" : "votes"}`}
                      </span>
                    }
                  >
                    {s.cards.map((c, i) => (
                      <WhiteCardView key={c.id} card={c} deckName={deckName(c.id)} order={s.cards.length > 1 ? i + 1 : undefined} />
                    ))}
                  </Group>
                ))}
          </div>
          {view.phase === "judging" && (voting || !isCzar) && (
            <p className="mt-2 text-xs text-muted">
              {voting
                ? "The answers are shown without names until the vote ends. Votes are anonymous."
                : "The answers are shown without names until the Card Czar chooses."}
            </p>
          )}
        </div>
      </div>

      {!view.youAreSpectator &&
        (judgingThisRound && !peekHand ? (
          // The Card Czar does not play, so the hand is hidden: no distractions.
          <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-line px-4 py-3 text-sm">
            <span>
              <b>You are the Card Czar this round.</b>{" "}
              <span className="text-muted">Your cards come back when the round ends.</span>
            </span>
            <button type="button" className="ml-auto text-xs font-semibold text-muted underline" onClick={() => setPeekHand(true)}>
              Show my hand
            </button>
          </section>
        ) : (
          <section>
            <h3 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-muted">
              <span>
                Your hand
                <span className="font-normal">
                  {view.mustSubmit
                    ? ` — choose ${pick === 1 ? "a card" : `${pick} cards, in order`}`
                    : judgingThisRound
                      ? " — you are the Card Czar and do not play this round"
                      : view.players.find((p) => p.id === view.youId)?.status === "waiting"
                        ? " — you joined during this round and play from the next one"
                        : ""}
                </span>
              </span>
              {judgingThisRound && (
                <button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => setPeekHand(false)}>
                  Hide my hand
                </button>
              )}
            </h3>
            <div className={`${CARD_GRID} ${judgingThisRound ? "opacity-50 grayscale" : ""}`}>
              {view.hand.map((card) => (
                <WhiteCardView
                  key={card.id}
                  card={card}
                  deckName={deckName(card.id)}
                  selected={selected.includes(card.id)}
                  order={pick > 1 && selected.includes(card.id) ? selected.indexOf(card.id) + 1 : undefined}
                  disabled={!view.mustSubmit}
                  onClick={view.mustSubmit ? () => toggle(card.id) : undefined}
                />
              ))}
            </div>
          </section>
        ))}
    </>
  );
}

/**
 * One player's answer. A Pick 1 answer is one square card. A Pick 2 or Pick 3 answer is one
 * card with the full sentence (SentenceAnswer), on every screen size.
 */
function Group({
  size,
  black,
  highlight,
  label,
  children,
  answer,
}: {
  size: number;
  black: BlackCard;
  highlight?: "selected" | "winner";
  label?: React.ReactNode;
  /** The square cards, for a Pick 1 answer. */
  children: React.ReactNode;
  answer: { cards: WhiteCard[]; onClick?: () => void; selected?: boolean };
}) {
  const ring =
    highlight === "winner"
      ? "ring-2 ring-accent ring-offset-4 ring-offset-paper"
      : highlight === "selected"
        ? "ring-2 ring-accent/60 ring-offset-4 ring-offset-paper"
        : "";
  return (
    <div className="flex min-w-0 flex-col">
      <div className={`flex-1 rounded-lg ${ring}`}>
        {size > 1 ? (
          <SentenceAnswer black={black} cards={answer.cards} onClick={answer.onClick} selected={answer.selected} />
        ) : (
          children
        )}
      </div>
      {label && <div className="mt-1.5 truncate text-xs">{label}</div>}
    </div>
  );
}

/** The confirm button. Under the black card on wide screens, fixed at the bottom on phones. */
function ActionBar({ action }: { action: Action }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur md:static md:mt-3 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      <div className="mx-auto flex max-w-6xl items-center gap-3 md:block">
        {action.note && <span className="text-sm text-muted md:mb-1.5 md:block md:text-center md:text-xs">{action.note}</span>}
        <Button
          variant={action.secondary ? "ghost" : "primary"}
          className="ml-auto px-8 md:w-full"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The last round opens in a window above the game. It never replaces the current round.

function LastRoundDialog({
  last,
  current,
  decks,
  onClose,
}: {
  last: LastRoundView;
  current: number;
  decks: GameView["decks"];
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  // The game view updates often. Keep the latest onClose without running the effect again.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const deckName = (cardId: string) => decks.find((d) => d.id === deckIdOf(cardId))?.name;
  const winner = last.answers.find((a) => a.isWinner);
  const pick = last.black.pick;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="last-round-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-2xl border border-line bg-surface p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Last round</p>
            <h2 id="last-round-title" className="text-xl font-black">
              Round {last.number}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Card Czar: <b className="text-ink">{last.czarName}</b>. Round {current} continues behind this window.
            </p>
          </div>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-11 min-w-11 rounded-lg border border-line text-lg hover:bg-paper"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[15rem] md:max-w-none">
            <BlackCardView card={last.black} answers={winner?.cards.map((c) => c.text)} deckName={deckName(last.black.id)} />
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-sm font-bold text-ink">
              {winner
                ? winner.isYou
                  ? "You won this round."
                  : `${winner.playerName}${winner.playerLeft ? " (left)" : ""} won this round.`
                : "The Card Czar did not choose. Nobody got an Offence."}
              {last.end === "audience" && " The players and spectators chose the winner."}
            </h3>
            <div className={pick > 1 ? SENTENCE_GRID : CARD_GRID}>
              {last.answers.map((a, i) => (
                <Group
                  key={i}
                  size={pick}
                  black={last.black}
                  highlight={a.isWinner ? "winner" : undefined}
                  answer={{ cards: a.cards }}
                  label={
                    <span className={a.isWinner ? "font-bold text-ink" : "text-muted"}>
                      {a.isWinner && "★ "}
                      {a.isYou ? "You" : a.playerName}
                      {a.playerLeft && " (left)"}
                    </span>
                  }
                >
                  {a.cards.map((c, j) => (
                    <WhiteCardView key={c.id} card={c} deckName={deckName(c.id)} order={a.cards.length > 1 ? j + 1 : undefined} />
                  ))}
                </Group>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Back to the game</Button>
        </div>
      </section>
    </div>
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
  // Players with the same score share a place: 1, 1, 3.
  const place = (score: number) => ranked.findIndex((p) => p.score === score) + 1;
  // The host can end a game early. When the top score is shared, nobody wins.
  const draw = !view.winnerId && (ranked[0]?.score ?? 0) > 0;
  const verdict = verdictFor(view.youId, ranked);
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-muted">{draw ? "Case Closed (Sort Of)" : "Case Closed"}</p>
      <h2 className="mt-2 text-3xl font-black">
        {view.winnerId
          ? view.winnerId === view.youId
            ? "You win!"
            : `${nameOf(view.winnerId)} wins!`
          : draw
            ? "It's a Draw!"
            : "An Embarrassment to the Department"}
      </h2>
      {view.winnerId && (
        <p className="mt-3">
          <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
            🏅 A National Disgrace
          </span>
        </p>
      )}
      {!view.winnerId && !draw && (
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Not a single Offence recorded. We expected better. Much, much worse, actually.
        </p>
      )}
      {draw && (
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          The investigation has been suspended due to insufficient evidence and an alarming lack of competence.
        </p>
      )}
      {verdict && (
        <div className="mx-auto mt-5 max-w-xs rounded-xl border border-line bg-paper px-4 py-3">
          <p className="font-bold">{verdict.title}</p>
          <p className="mt-0.5 text-sm text-muted">{verdict.text}</p>
        </div>
      )}
      <ol className="mx-auto mt-6 max-w-xs space-y-1 text-left">
        {ranked.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3">
            <span className={`flex min-w-0 items-center gap-1.5 ${p.id === view.youId ? "font-bold" : ""}`}>
              <span className="truncate">
                {place(p.score)}. {p.name}
                {p.isBot && <span className="font-normal text-muted"> (bot)</span>}
              </span>
              {p.id === view.youId && <Badge tone="accent">You</Badge>}
            </span>
            <span className="font-bold tabular-nums">{offences(p.score)}</span>
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

/**
 * A personal line for a player who did not finish first. Players in last place get
 * "Clean Record", everybody between first and last "Within Acceptable Limits".
 * Nothing for the winner, for players who share first place, for spectators, or when
 * all players have the same score.
 */
export function verdictFor(youId: string, ranked: GameView["players"]): { title: string; text: string } | null {
  const you = ranked.find((p) => p.id === youId);
  if (!you || ranked.length < 2) return null;
  const top = ranked[0].score;
  const bottom = ranked[ranked.length - 1].score;
  if (top === bottom || you.score === top) return null;
  if (you.score === bottom) {
    return { title: "Clean Record", text: "Suspiciously well-behaved. We'll be keeping an eye on you." };
  }
  return {
    title: "Within Acceptable Limits",
    text: "Your performance met the minimum requirements. Try not to get comfortable.",
  };
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
