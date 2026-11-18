"use client";

import { useState } from "react";
import { offences, type GameView, type PlayerStatus } from "@/lib/protocol";
import type { Act, Ghost, View } from "./Room";
import { BOT_DIVISION, botProfile } from "@/engine/bots";
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
          Players <span className="font-normal text-muted">{humans}/{view.settings.maxPlayers}</span>
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
                  {ghost.reason === "idle" ? "Removed for being idle" : ghost.reason === "banned" ? "Banned by the host" : "Removed by the host"}
                </p>
              </li>
            );
          }
          const you = p.id === view.youId;
          const canManage = isHost && !you;
          return (
            <li key={p.id} className="py-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? "bg-ok" : "bg-line"}`}
                  title={p.connected ? "Online" : "Offline"}
                />
                <span className={`min-w-0 truncate font-semibold `}>
                  {p.name}
                  {you && <span className="font-normal text-muted"> (you)</span>}
                </span>
                <span className="flex shrink-0 gap-1">
                  {p.isHost && <Badge tone="accent">Host</Badge>}
                  {p.isBot && <Badge>Bot</Badge>}
                </span>
                {view.phase !== "lobby" && <span
                    className="ml-auto pl-2 text-lg font-black tabular-nums"
                    title={offences(p.score)}
                    aria-label={offences(p.score)}
                  >
                    {p.score}
                  </span>}
                {canManage && (
                  <button
                    className={`${view.phase === "lobby" ? "ml-auto" : ""} rounded px-1.5 text-muted hover:bg-paper`}
                    aria-label={`Manage ${p.name}`}
                    onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                  >
                    ⋯
                  </button>
                )}
              </div>
              {p.isBot && <BotTitle name={p.name} />}
              {(STATUS_TEXT[p.status] || !p.connected) && (
                <p className={`pl-4 text-xs ${p.status === "czar" ? "font-bold text-accent" : p.status === "missed" ? "font-semibold text-danger" : "text-muted"}`}>
                  {STATUS_TEXT[p.status]}
                  {!p.connected && (STATUS_TEXT[p.status] ? " · offline" : "Offline, can reconnect")}
                </p>
              )}
              {menuFor === p.id && (
                <HostMenu
                  isBot={p.isBot}
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
          <h3 className="mb-1 flex items-baseline justify-between text-sm font-bold">
            Spectators
            <span className="text-xs font-normal text-muted">
              {view.spectators.length}/{view.settings.maxSpectators}
            </span>
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
                    {s.id === view.youId && <span className="text-muted"> (you)</span>}
                  </span>
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
  isBot,
  playersLeft,
  onRemove,
}: {
  isBot: boolean;
  /** Players after the removal, during a game. Null in the lobby. */
  playersLeft: number | null;
  onRemove: (ban: boolean) => void;
}) {
  const [confirm, setConfirm] = useState<{ ban: boolean } | null>(null);
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

  return (
    <div className="mt-2 flex gap-2 pl-4">
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
