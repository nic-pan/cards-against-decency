"use client";

import type { VoteView } from "@/lib/protocol";
import { useSecondsLeft } from "./Board";
import type { Act } from "./Room";

/** The open vote to remove a player. Voters get Yes and No buttons. Everybody else sees the count. */
export function VoteBanner({
  vote,
  youId,
  act,
  clockOffset,
}: {
  vote: VoteView;
  youId: string;
  act: Act;
  clockOffset: number;
}) {
  const left = useSecondsLeft(vote.deadline, clockOffset);
  const aboutYou = vote.targetId === youId;
  const choice = (yes: boolean) => {
    const selected = vote.yourVote === (yes ? "yes" : "no");
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => act("vote:cast", { yes })}
        className={`min-h-9 rounded-lg border px-3 text-sm font-bold ${
          selected
            ? yes
              ? "border-danger bg-danger text-white"
              : "border-ink bg-ink text-paper"
            : "border-line bg-surface text-ink hover:bg-paper"
        }`}
      >
        {yes ? "Yes, remove" : "No, keep"}
      </button>
    );
  };

  return (
    <div
      role="status"
      className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-danger bg-danger-soft px-4 py-2.5 text-sm"
    >
      <p className="min-w-0 flex-1">
        <span className="font-bold text-danger">
          {aboutYou ? "The players are voting on whether to remove you." : `Vote: remove ${vote.targetName}?`}
        </span>{" "}
        <span className="text-ink">
          {aboutYou ? `${vote.startedByName} started it.` : `Started by ${vote.startedByName}.`} Yes {vote.yes} · No{" "}
          {vote.no} · {vote.needed} yes {vote.needed === 1 ? "vote removes" : "votes remove"}{" "}
          {aboutYou ? "you" : "them"}.
        </span>
        {left !== null && <span className="ml-1 tabular-nums text-muted">{left}s</span>}
      </p>
      {vote.canVote && vote.networkVotedBy && (
        <p className="w-full text-xs text-muted">
          {vote.networkVotedBy} already voted for your network. People on the same Wi-Fi share one vote.
        </p>
      )}
      {vote.canVote && !vote.networkVotedBy && (
        <div className="flex gap-2">
          {choice(true)}
          {choice(false)}
        </div>
      )}
    </div>
  );
}
