"use client";

import { useState } from "react";
import { ERROR_TEXT, offences, type GameView, type PlayerStatus } from "@/lib/protocol";
import type { ErrorCode } from "@/engine/game";
import type { Act, Ghost, View } from "./Room";
import { BOT_DIVISION, botProfile } from "@/engine/bots";
import { blocks } from "@/lib/socket";
import { Badge, InfoTip } from "./ui";

/** The most bots a game can have (LIMITS.botCount.max in the engine). */
const MAX_BOTS = 6;

const STATUS_TEXT: Record<PlayerStatus, string> = {
  czar: "Card Czar",
  submitted: "Played",
  playing: "Choosing…",
  missed: "Missed this round",
  waiting: "Joins next round",
  idle: "",
};

export function PlayerList({
  view,
  isHost,
  act,
  ghosts = [],
}: {
  view: View;
  isHost: boolean;
  act: Act;
  ghosts?: Ghost[];
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Put each removed player back at their old place while their row fades out.
  const rows: { p: GameView["players"][number]; ghost?: Ghost }[] = view.players.map((p) => ({ p }));
  for (const g of [...ghosts].sort((a, b) => a.index - b.index)) {
    if (view.players.some((p) => p.id === g.player.id)) continue;
    rows.splice(Math.min(g.index, rows.length), 0, { p: g.player, ghost: g });
  }
  if (view.phase !== "lobby") rows.sort((a, b) => b.p.score - a.p.score);
  const humans = view.players.filter((p) => !p.isBot).length;
  const botsNow = view.players.filter((p) => p.isBot).length;
  const inGame = view.phase !== "lobby" && view.phase !== "gameOver";

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-bold">
          Players{" "}
          <span className="font-normal text-muted">
            {humans}/{view.settings.maxPlayers}
            {botsNow > 0 && ` · ${botsNow} ${botsNow === 1 ? "bot" : "bots"}`}
          </span>
        </h2>
        {view.phase !== "lobby" && (
          <span className="text-xs text-muted">Goal: {offences(view.settings.targetScore)}</span>
        )}
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ p, ghost }) => {
          if (ghost) {
            return (
              <li key={`ghost-${p.id}`} className="animate-player-removed py-2" aria-label={`${p.name} was removed`}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
                  <span className="min-w-0 truncate font-semibold text-danger line-through decoration-danger decoration-2">
                    {p.name}
                  </span>
                  {view.phase !== "lobby" && (
                    <span className="ml-auto pl-2 text-lg font-black tabular-nums text-danger line-through">{p.score}</span>
                  )}
                </div>
                <p className="pl-4 text-xs font-semibold text-danger">
                  {ghost.reason === "idle"
                    ? "Removed for being idle"
                    : ghost.reason === "banned"
                      ? "Banned by the host"
                      : ghost.reason === "voted"
                        ? "Voted out by the players"
                        : "Removed by the host"}
                </p>
              </li>
            );
          }
          const you = p.id === view.youId;
          // The host manages everybody else. Everybody can block another person (not a bot).
          const canManage = !you && (isHost || !p.isBot);
          return (
            <li key={p.id} className="py-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? "bg-ok" : "bg-line"}`}
                  title={p.connected ? "Online" : "Offline"}
                />
                <span className="min-w-0 truncate font-semibold" title={p.name}>
                  {p.name}
                </span>
                {view.phase !== "lobby" && <span
                    className="ml-auto pl-2 text-lg font-black tabular-nums"
                    title={offences(p.score)}
                    aria-label={offences(p.score)}
                  >
                    {p.score}
                  </span>}
                {canManage ? (
                  <button
                    className={`${view.phase === "lobby" ? "ml-auto" : ""} w-7 shrink-0 rounded text-center text-muted hover:bg-paper`}
                    aria-label={`Manage ${p.name}`}
                    onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                  >
                    ⋯
                  </button>
                ) : (
                  // Rows without a menu get an empty space as wide as the button, so the scores stay in one column.
                  <span aria-hidden className={`${view.phase === "lobby" ? "ml-auto" : ""} w-7 shrink-0`} />
                )}
              </div>
              {/* Badges and status sit on their own line, so the name gets the full first line. */}
              {(p.isHost || you || p.isBot || STATUS_TEXT[p.status] || !p.connected) && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-4 text-xs">
                  {p.isHost && <Badge tone="accent">Host</Badge>}
                  {you && <Badge tone="accent">You</Badge>}
                  {p.isBot && <Badge>Bot</Badge>}
                  {(STATUS_TEXT[p.status] || !p.connected) && (
                    <span className={p.status === "czar" ? "font-bold text-accent" : p.status === "missed" ? "font-semibold text-danger" : "text-muted"}>
                      {STATUS_TEXT[p.status]}
                      {!p.connected && (STATUS_TEXT[p.status] ? " · offline" : "Offline, can reconnect")}
                    </span>
                  )}
                </p>
              )}
              {p.isBot && <BotTitle name={p.name} />}
              {menuFor === p.id && (
                <HostMenu
                  isHost={isHost}
                  isBot={p.isBot}
                  name={p.name}
                  // Players (not the host, who can remove directly) can ask the room to vote. Spectators cannot.
                  onVote={
                    !isHost && !p.isBot && !view.youAreSpectator && !view.vote
                      ? () => act("vote:start", { playerId: p.id }).then((ok) => ok && setMenuFor(null))
                      : null
                  }
                  onBlock={async () => {
                    const err = await blocks.add({ playerId: p.id });
                    if (!err) setMenuFor(null);
                    return err;
                  }}
                  // During a game, a game needs 3 players. Ask first when a removal leaves fewer.
                  playersLeft={inGame ? view.players.length - 1 : null}
                  onRemove={(ban) =>
                    (p.isBot
                      ? act("bot:remove", { playerId: p.id })
                      : act("player:kick", { playerId: p.id, ban })
                    ).then(() => setMenuFor(null))
                  }
                />
              )}
            </li>
          );
        })}
      </ul>

      {isHost && (inGame ? botsNow < view.settings.botCount : botsNow < MAX_BOTS) && (
        <button
          type="button"
          onClick={() => act("bot:add")}
          className="mt-2 w-full rounded-lg border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted hover:bg-paper hover:text-ink"
        >
          + Add a bot ({botsNow}/{inGame ? view.settings.botCount : MAX_BOTS})
        </button>
      )}

      {isHost && view.bans.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1 flex items-baseline justify-between text-sm font-bold">
            Banned
            <span className="text-xs font-normal text-muted">only you see this</span>
          </h3>
          <ul className="space-y-1 text-sm">
            {view.bans.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <span className="min-w-0 truncate text-muted line-through">{b.name}</span>
                <button
                  type="button"
                  className="ml-auto rounded border border-line px-2 py-0.5 text-xs font-semibold hover:bg-paper"
                  onClick={() => act("player:unban", { banId: b.id })}
                  aria-label={`Unban ${b.name}`}
                >
                  Unban
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">
            A ban blocks the person&apos;s internet connection, whatever name they use. Others on the same Wi-Fi are
            blocked too.
          </p>
        </div>
      )}

      {(view.spectators.length > 0 || view.settings.maxSpectators > 0) && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1 flex items-baseline gap-2 text-sm font-bold">
            Spectators
            <span className="text-xs font-normal text-muted">
              {view.spectators.length}/{view.settings.maxSpectators}
            </span>
            {!view.youAreSpectator && view.roleSwitch && !view.roleSwitch.pending && (
              <WatchButton blocked={view.roleSwitch.blocked} onSwitch={() => void act("member:switch")} />
            )}
          </h3>
          {view.spectators.length === 0 ? (
            <p className="text-xs text-muted">Nobody is watching.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {view.spectators.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.connected ? "bg-ok" : "bg-line"}`} />
                  <span className="min-w-0 truncate">
                    {s.name}
                    {s.isHost && <span className="text-muted"> (host)</span>}
                    {s.id === view.youId && <span className="text-muted"> (you)</span>}
                  </span>
                  {/* A host who watches can still be voted out by the players. */}
                  {s.isHost && !isHost && !view.youAreSpectator && !view.vote && (
                    <button
                      className="ml-auto rounded px-1.5 text-xs text-muted underline hover:text-danger"
                      onClick={() => act("vote:start", { playerId: s.id })}
                    >
                      Vote to remove
                    </button>
                  )}
                  {isHost && s.id !== view.youId && (
                    <button
                      className="ml-auto rounded px-1.5 text-xs text-muted hover:bg-paper"
                      onClick={() => act("player:kick", { playerId: s.id, ban: false })}
                      aria-label={`Remove ${s.name}`}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** A game needs at least this many players, Card Czar included. Same rule as the server. */
const MIN_PLAYERS = 3;

/** The host's actions for one player or bot. Asks first when the removal would stop the game. */
function HostMenu({
  isHost,
  isBot,
  name,
  playersLeft,
  onRemove,
  onBlock,
  onVote,
}: {
  isHost: boolean;
  isBot: boolean;
  name: string;
  /** Starts a vote to remove this player. Null when you cannot start one. */
  onVote: (() => void) | null;
  /** Returns an error text, or null when the block worked. */
  onBlock: () => Promise<string | null>;
  /** Players after the removal, during a game. Null in the lobby. */
  playersLeft: number | null;
  onRemove: (ban: boolean) => void;
}) {
  const [confirm, setConfirm] = useState<{ ban: boolean } | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const stopsGame = playersLeft !== null && playersLeft < MIN_PLAYERS;
  const ask = (ban: boolean) => (stopsGame ? setConfirm({ ban }) : onRemove(ban));

  if (confirm) {
    return (
      <div role="alert" className="mt-2 ml-4 rounded-lg border border-danger bg-danger-soft p-2.5 text-xs">
        <p className="font-bold text-danger">
          Only {playersLeft} {playersLeft === 1 ? "player" : "players"} will be left.
        </p>
        <p className="mt-0.5 text-ink">The game stops at once, and everybody goes back to the lobby. Remove anyway?</p>
        <div className="mt-2 flex gap-2">
          <button
            className="rounded bg-danger px-2 py-1 font-semibold text-white hover:brightness-110"
            onClick={() => onRemove(confirm.ban)}
          >
            Remove anyway
          </button>
          <button className="rounded border border-line px-2 py-1 font-semibold hover:bg-paper" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirmBlock) {
    return (
      <div role="alert" className="mt-2 ml-4 rounded-lg border border-danger bg-danger-soft p-2.5 text-xs">
        <p className="font-bold text-danger">Block {name}?</p>
        <p className="mt-0.5 text-ink">
          Nothing changes in this game. From now on, you will not see each other&apos;s games, and you cannot join the
          same game. They are not told.
        </p>
        {blockError && <p className="mt-1 font-semibold text-danger">{blockError}</p>}
        <div className="mt-2 flex gap-2">
          <button
            className="rounded bg-danger px-2 py-1 font-semibold text-white hover:brightness-110"
            onClick={async () => setBlockError(await onBlock())}
          >
            Block
          </button>
          <button className="rounded border border-line px-2 py-1 font-semibold hover:bg-paper" onClick={() => setConfirmBlock(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const blockButton = !isBot && (
    <button
      className="rounded border border-line px-2 py-1 text-xs font-semibold text-muted hover:bg-paper hover:text-danger"
      onClick={() => setConfirmBlock(true)}
    >
      Block
    </button>
  );
  if (!isHost) {
    return (
      <div className="mt-2 flex flex-wrap gap-2 pl-4">
        {onVote && (
          <button
            className="rounded border border-line px-2 py-1 text-xs font-semibold hover:bg-paper hover:text-danger"
            onClick={onVote}
          >
            Vote to remove
          </button>
        )}
        {blockButton}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2 pl-4">
      {isBot ? (
        <button
          className="rounded border border-line px-2 py-1 text-xs font-semibold hover:bg-paper"
          onClick={() => ask(false)}
        >
          Remove bot
        </button>
      ) : (
        <>
          <button
            className="rounded border border-line px-2 py-1 text-xs font-semibold hover:bg-paper"
            onClick={() => ask(false)}
          >
            Remove
          </button>
          <button
            className="rounded border border-accent px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-soft"
            onClick={() => ask(true)}
          >
            Remove and ban
          </button>
          {blockButton}
        </>
      )}
    </div>
  );
}

/** The bot's full title under its name, with its tagline in a "?" tooltip. */
function BotTitle({ name }: { name: string }) {
  const profile = botProfile(name);
  if (!profile) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1.5 pl-4 text-xs text-muted">
      <span className="min-w-0 truncate">{profile.title}</span>
      <InfoTip
        label={name}
        text={
          <>
            <b className="block">{BOT_DIVISION}</b>
            {profile.tagline}
          </>
        }
      />
    </p>
  );
}

/**
 * "Watch instead" for a player. When the switch is not possible, the button stays visible but
 * explains why: on hover (title) and on tap (a short note under it).
 */
function WatchButton({ blocked, onSwitch }: { blocked: ErrorCode | null; onSwitch: () => void }) {
  const [why, setWhy] = useState(false);
  const reason = blocked ? ERROR_TEXT[blocked] : null;
  return (
    <span className="relative ml-auto">
      <button
        type="button"
        aria-disabled={!!reason}
        title={reason ?? "Watch the game instead of playing. During a game, this happens when the round ends."}
        onClick={() => (reason ? setWhy((w) => !w) : onSwitch())}
        className={`rounded px-1.5 text-xs font-semibold underline ${reason ? "cursor-help text-muted/60" : "text-muted hover:text-ink"}`}
      >
        Watch instead
      </button>
      {why && reason && (
        <span role="note" className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-line bg-surface p-2 text-xs font-normal text-ink shadow-lg">
          {reason}
        </span>
      )}
    </span>
  );
}
