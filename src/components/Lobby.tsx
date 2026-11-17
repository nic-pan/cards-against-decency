"use client";

import type { GameView, Settings } from "@/lib/protocol";
import type { Act } from "./Room";
import { useState } from "react";
import { MANY_DECKS_URL, PACK_BROWSER_URL } from "@/lib/protocol";
import { Badge, Button, Toggle, inputClass } from "./ui";

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** The bot count to use when the host turns bots on. */
function suggestedBots(humans: number): number {
  return humans === 1 ? 2 : 1;
}

function botHint(humans: number): string {
  if (humans === 1) return "Playing alone? Use 2–3 bots for practice mode. You are the Card Czar every round.";
  if (humans === 2) return "Two people: add 1–2 bots for a small game.";
  if (humans === 3) return "Three people: 1 bot gives more answers to choose from.";
  return "You have enough people. Bots are optional.";
}

export function Lobby({ view, isHost, act }: { view: GameView; isHost: boolean; act: Act }) {
  const s = view.settings;
  const humans = view.players.filter((p) => !p.isBot).length;
  const total = view.players.length;
  const set = (patch: Partial<Settings>) => act("settings:update", patch);

  const toggleDeck = (id: string) =>
    set({ deckIds: s.deckIds.includes(id) ? s.deckIds.filter((d) => d !== id) : [...s.deckIds, id] });

  const startBlocker =
    total < 3 ? `You need ${3 - total} more player${3 - total === 1 ? "" : "s"}. Invite friends or add bots.` : s.deckIds.length === 0 ? "Select at least one deck." : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-xl font-bold">Waiting for players</h2>
        <p className="mt-1 text-muted">
          Send the invite link to your friends. {isHost ? "Start when everyone is here." : "The host starts the game."}
        </p>
        {isHost && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => act("game:start")} disabled={!!startBlocker} className="px-6">
              Start game
            </Button>
            {startBlocker && <span className="text-sm text-muted">{startBlocker}</span>}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-4 font-bold">Game settings {!isHost && <span className="font-normal text-muted">(the host can change these)</span>}</h2>

        <fieldset disabled={!isHost} className="space-y-6">
          <div className="space-y-3">
            <Toggle
              label="Play with bots"
              checked={s.botCount > 0}
              onChange={(on) => set({ botCount: on ? suggestedBots(humans) : 0 })}
              hint="Bots play random cards from the decks. They are never the Card Czar."
            />
            {s.botCount > 0 && (
              <div>
                <span className="mb-1 block text-sm font-semibold">Number of bots</span>
                <div className="flex flex-wrap gap-2">
                  {range(1, 6).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set({ botCount: n })}
                      aria-pressed={s.botCount === n}
                      className={`h-11 w-11 rounded-lg border text-sm font-bold ${
                        s.botCount === n ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper"
                      } disabled:opacity-60`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">{botHint(humans)}</p>
              </div>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Points to win"
              value={s.targetScore}
              options={range(3, 15).map((n) => [n, `${n} points`])}
              onChange={(v) => set({ targetScore: v })}
              hint="The first player to reach this score wins the game."
            />
            <Select
              label="Maximum players"
              value={s.maxPlayers}
              options={range(3, 20).map((n) => [n, `${n} players`])}
              onChange={(v) => set({ maxPlayers: v })}
              hint="More than 10 players is hard to follow. Rounds get slow, and more people leave or stop playing."
              warn={s.maxPlayers > 10}
            />
            <Select
              label="Time to play a card"
              value={s.submitSeconds}
              options={[30, 45, 60, 75, 90, 120, 180, 300].map((n) => [n, seconds(n)])}
              onChange={(v) => set({ submitSeconds: v })}
              hint="A player who does not play in time misses the round. After 2 missed rounds, the player sits out until they come back."
            />
            <Select
              label="Time for the Card Czar"
              value={s.judgeSeconds}
              options={[30, 45, 60, 75, 90, 120, 180, 300].map((n) => [n, seconds(n)])}
              onChange={(v) => set({ judgeSeconds: v })}
              hint="If the Card Czar does not choose in time, nobody scores and the cards go back to the players."
            />
            <Select
              label="Maximum spectators"
              value={s.maxSpectators}
              options={[0, 2, 5, 10, 15, 20].map((n) => [n, n === 0 ? "No spectators" : `${n} spectators`])}
              onChange={(v) => set({ maxSpectators: v })}
              hint="Spectators watch the game but do not play. They are never the Card Czar."
            />
          </div>

          <div className="space-y-4 border-t border-line pt-5">
            <Toggle
              label="Show in the public game list"
              checked={s.isPublic}
              onChange={(on) => set({ isPublic: on })}
              hint="When this is off, only people with the invite link or the room code can find the game."
            />
            <Toggle
              label="Allow joining during the game"
              checked={s.allowLateJoin}
              onChange={(on) => set({ allowLateJoin: on })}
              hint="New players get cards at once and play from the next round. Spectators can also switch to playing."
            />
          </div>

          <div>
            <span className="block text-sm font-semibold">Decks</span>
            <span className="mb-2 block text-xs text-muted">
              Select one or more decks. The game mixes the cards from all selected decks.
            </span>
            <ul className="space-y-2">
              {view.decks.map((d) => (
                <li key={d.id}>
                  <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-ink">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={s.deckIds.includes(d.id)}
                      onChange={() => toggleDeck(d.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{d.name}</span>
                      {d.external && (
                        <span className="ml-2 inline-block">
                          <Badge tone="accent">User-made</Badge>
                        </span>
                      )}
                      <span className="ml-2 text-xs text-muted">
                        {d.blackCount} prompts · {d.whiteCount} answers
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{d.description}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {d.attribution}{" "}
                        {d.external ? (
                          <a href={d.source.url} className="underline" target="_blank" rel="noreferrer">
                            View on {d.source.name}
                          </a>
                        ) : (
                          <a href={d.license.url} className="underline" target="_blank" rel="noreferrer">
                            {d.license.name}
                          </a>
                        )}
                      </span>
                    </span>
                    {d.external && (
                      <button
                        type="button"
                        className="self-start rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-paper"
                        onClick={(e) => {
                          e.preventDefault();
                          void act("deck:remove", { deckId: d.id });
                        }}
                        aria-label={`Remove ${d.name}`}
                      >
                        Remove
                      </button>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            {isHost && <ImportDeck act={act} />}
          </div>
        </fieldset>
      </section>
    </div>
  );
}

function seconds(n: number) {
  return n < 60 ? `${n} seconds` : n % 60 === 0 ? `${n / 60} minute${n === 60 ? "" : "s"}` : `${Math.floor(n / 60)} min ${n % 60} s`;
}

function Select({
  label,
  value,
  options,
  onChange,
  hint,
  warn = false,
}: {
  label: string;
  value: number;
  options: [number, string][];
  onChange: (v: number) => void;
  hint?: string;
  /** Shows the hint as a warning. */
  warn?: boolean;
}) {
  const list = options.some(([v]) => v === value) ? options : [[value, String(value)] as [number, string], ...options];
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <select
        className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base disabled:opacity-60"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {list.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      {hint && <span className={`mt-1 block text-xs ${warn ? "font-semibold text-accent" : "text-muted"}`}>{hint}</span>}
    </label>
  );
}

/** Imports a user-made deck from Many Decks by its 5-character code. */
function ImportDeck({ act }: { act: Act }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await act("deck:add", { code });
    setBusy(false);
    if (ok) setCode("");
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-line p-4">
      <h3 className="text-sm font-semibold">Add a deck from outside</h3>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-muted">
        <li>
          Find a pack in the{" "}
          <a href={PACK_BROWSER_URL} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">
            pack browser
          </a>
          , or build your own deck on{" "}
          <a href={MANY_DECKS_URL} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">
            Many Decks
          </a>
          .
        </li>
        <li>Copy the 5-character deck code, for example 1ZW29.</li>
        <li>Paste the code here and click Add deck. You can add up to 10 decks.</li>
      </ol>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          className={`${inputClass} max-w-40 font-mono uppercase tracking-[0.2em]`}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          maxLength={5}
          placeholder="CODE"
          aria-label="Deck code"
          autoComplete="off"
        />
        <Button variant="secondary" disabled={code.length !== 5 || busy} className="shrink-0">
          {busy ? "Adding…" : "Add deck"}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">
        Other people make these decks, and nobody checks them. If your game is public, the game list shows a
        &quot;Custom decks&quot; label. The deck stays in this room only and is gone when the room closes.
      </p>
    </div>
  );
}
