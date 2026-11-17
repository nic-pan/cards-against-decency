"use client";

import type { GameView, Settings } from "@/lib/protocol";
import type { Act } from "./Room";
import { Button } from "./ui";

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

function botHint(humans: number): string {
  if (humans === 1) return "Playing alone? Add 2–3 bots for practice mode. You judge every round.";
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

        <fieldset disabled={!isHost} className="space-y-5">
          <div>
            <span className="mb-1 block text-sm font-semibold">Bots</span>
            <div className="flex flex-wrap gap-2">
              {range(0, 6).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set({ botCount: n })}
                  className={`h-11 w-11 rounded-lg border text-sm font-bold ${
                    s.botCount === n ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper"
                  } disabled:opacity-60`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              {botHint(humans)} Bots play random cards. They never judge, write cards or chat.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Points to win"
              value={s.targetScore}
              options={range(3, 15).map((n) => [n, `${n} points`])}
              onChange={(v) => set({ targetScore: v })}
            />
            <Select
              label="Maximum people"
              value={s.maxPlayers}
              options={range(3, 20).map((n) => [n, `${n} people`])}
              onChange={(v) => set({ maxPlayers: v })}
            />
            <Select
              label="Time to play a card"
              value={s.submitSeconds}
              options={[30, 45, 60, 75, 90, 120, 180, 300].map((n) => [n, seconds(n)])}
              onChange={(v) => set({ submitSeconds: v })}
            />
            <Select
              label="Time for the Card Czar"
              value={s.judgeSeconds}
              options={[30, 45, 60, 75, 90, 120, 180, 300].map((n) => [n, seconds(n)])}
              onChange={(v) => set({ judgeSeconds: v })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Maximum spectators"
              value={s.maxSpectators}
              options={[0, 2, 5, 10, 15, 20].map((n) => [n, n === 0 ? "No spectators" : `${n} spectators`])}
              onChange={(v) => set({ maxSpectators: v })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={s.isPublic}
              onChange={(e) => set({ isPublic: e.target.checked })}
            />
            Show this game in the public game list. When this is off, only people with the link or code can join.
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={s.allowLateJoin}
              onChange={(e) => set({ allowLateJoin: e.target.checked })}
            />
            Let people join after the game starts. They play from the next round.
          </label>

          <div>
            <span className="mb-2 block text-sm font-semibold">Decks</span>
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
                    <span className="min-w-0">
                      <span className="font-semibold">{d.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {d.blackCount} prompts · {d.whiteCount} answers
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{d.description}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {d.attribution}{" "}
                        <a href={d.license.url} className="underline" target="_blank" rel="noreferrer">
                          {d.license.name}
                        </a>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
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
}: {
  label: string;
  value: number;
  options: [number, string][];
  onChange: (v: number) => void;
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
    </label>
  );
}
