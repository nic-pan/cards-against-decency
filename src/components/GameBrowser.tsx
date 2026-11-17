"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { call, getSocket, session } from "@/lib/socket";
import { TERMS_VERSION, type JoinAs, type JoinResult, type RoomListing } from "@/lib/protocol";
import { Badge, Button, inputClass } from "./ui";

/** The public game list. Shown after the player chooses a name and accepts the terms. */
export function GameBrowser({ name, onChangeName }: { name: string; onChangeName: () => void }) {
  const router = useRouter();
  const [games, setGames] = useState<RoomListing[] | null>(null);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    const socket = getSocket();
    const onLobby = (p: { games: RoomListing[] }) => setGames(p.games);
    const subscribe = () =>
      void call<{ games: RoomListing[] }>("lobby:subscribe").then((r) => r.ok && setGames(r.data.games));
    socket.on("lobby", onLobby);
    socket.on("connect", subscribe);
    if (socket.connected) subscribe();
    return () => {
      socket.off("lobby", onLobby);
      socket.off("connect", subscribe);
      void call("lobby:unsubscribe");
    };
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!games || !q) return games;
    return games.filter((g) =>
      [g.code, g.hostName, ...g.players.map((p) => p.name), ...g.spectators, ...g.deckNames].some((t) =>
        t.toLowerCase().includes(q),
      ),
    );
  }, [games, filter]);

  async function join(game: { code: string }, as: JoinAs, password?: string): Promise<string | null> {
    const r = await call<JoinResult>("room:join", { code: game.code, name, password, as, termsVersion: TERMS_VERSION });
    if (!r.ok) return r.text;
    session.set(r.data.code, r.data.token);
    router.push(`/r/${r.data.code}`);
    return null;
  }

  function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.length === 6) router.push(`/r/${code}`);
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <Button onClick={() => setCreating((c) => !c)} aria-expanded={creating} className="shrink-0">
          {creating ? "Close" : "Create game"}
        </Button>
        <input
          className={`${inputClass} sm:max-w-xs`}
          type="search"
          placeholder="Filter games by keyword"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter games"
        />
        <form onSubmit={joinByCode} className="flex gap-2 sm:ml-auto">
          <input
            className={`${inputClass} w-full font-mono uppercase tracking-[0.2em] sm:w-32`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            maxLength={6}
            placeholder="CODE"
            aria-label="Room code"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <Button variant="secondary" disabled={code.length !== 6} className="shrink-0">
            Join code
          </Button>
        </form>
      </div>

      <p className="mt-3 text-right text-sm">
        Playing as <b>{name}</b>
        <span className="mx-2 text-muted">·</span>
        <button type="button" className="font-semibold text-accent underline" onClick={onChangeName}>
          Change
        </button>
      </p>

      {creating && <CreatePanel name={name} />}

      {/* List */}
      <div className="mb-3 mt-6 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">
          Open games {games && <span className="font-normal text-muted">({games.length})</span>}
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-ok" aria-hidden /> Updates live
        </span>
      </div>

      {shown === null ? (
        <p className="py-12 text-center text-muted">Loading games…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center">
          <p className="font-semibold">{games?.length ? "No games match your filter." : "No open games right now."}</p>
          <p className="mt-1 text-sm text-muted">Create a game and send the link to your friends.</p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {shown.map((g) => (
            <GameCard key={g.code} game={g} onJoin={join} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreatePanel({ name }: { name: string }) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await call<JoinResult>("room:create", {
      name,
      isPublic,
      password: password || undefined,
      termsVersion: TERMS_VERSION,
    });
    setBusy(false);
    if (!r.ok) return setError(r.text);
    session.set(r.data.code, r.data.token);
    router.push(`/r/${r.data.code}`);
  }

  return (
    <form onSubmit={create} className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">Create a game</h2>
      <p className="mb-4 text-sm text-muted">You are the host. You choose the decks and the rules in the next step.</p>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Who can find this game?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice checked={isPublic} onChange={() => setIsPublic(true)} title="Public">
            Everyone sees it in the game list.
          </Choice>
          <Choice checked={!isPublic} onChange={() => setIsPublic(false)} title="Private">
            Only people with the link or the code.
          </Choice>
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-semibold">
          Password <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          className={`${inputClass} sm:max-w-xs`}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={64}
          autoComplete="new-password"
        />
      </label>

      {error && <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm">{error}</p>}
      <Button className="mt-5 px-8" disabled={busy}>
        Create game
      </Button>
    </form>
  );
}

function Choice({
  checked,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${checked ? "border-ink bg-paper" : "border-line"}`}
    >
      <input type="radio" className="mt-1" checked={checked} onChange={onChange} />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{children}</span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------

const STATUS: Record<RoomListing["phase"], { text: string; tone: "ok" | "accent" | "neutral" }> = {
  lobby: { text: "Not started", tone: "ok" },
  submitting: { text: "In progress", tone: "accent" },
  judging: { text: "In progress", tone: "accent" },
  roundOver: { text: "In progress", tone: "accent" },
  gameOver: { text: "Finished", tone: "neutral" },
};

function GameCard({
  game,
  onJoin,
}: {
  game: RoomListing;
  onJoin: (g: RoomListing, as: JoinAs, password?: string) => Promise<string | null>;
}) {
  const [pending, setPending] = useState<JoinAs | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const humans = game.players.filter((p) => !p.isBot).length;
  const started = game.phase !== "lobby" && game.phase !== "gameOver";
  const joinBlocked =
    humans >= game.maxPlayers ? "Full" : started && !game.allowLateJoin ? "Started" : null;
  const spectateBlocked =
    game.maxSpectators === 0 ? "No spectators" : game.spectators.length >= game.maxSpectators ? "Full" : null;
  const status = STATUS[game.phase];

  async function go(as: JoinAs) {
    if (game.hasPassword && pending !== as) {
      setPending(as);
      setError(null);
      return;
    }
    setBusy(true);
    const err = await onJoin(game, as, game.hasPassword ? password : undefined);
    setBusy(false);
    setError(err);
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface sm:flex-row">
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-lg font-bold leading-tight">
            <span className="break-words">{game.hostName}&apos;s Game</span>
            {game.hasPassword && (
              <span className="ml-2 text-sm" title="Password required" aria-label="Password required">
                🔒
              </span>
            )}
          </h3>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={status.tone}>{status.text}</Badge>
            {game.customDecks && (
              <span title="This game uses user-made decks that nobody checks.">
                <Badge tone="accent">Custom decks</Badge>
              </span>
            )}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {humans}/{game.maxPlayers} players · {game.spectators.length}/{game.maxSpectators} spectators
        </p>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="font-semibold">Players</dt>
          <dd className="min-w-0 break-words">
            {game.players.map((p, i) => (
              <span key={p.name}>
                {i > 0 && ", "}
                {p.name}
                {p.isBot && <span className="text-muted"> (bot)</span>}
              </span>
            ))}
          </dd>
          <dt className="font-semibold">Spectators</dt>
          <dd className="min-w-0 break-words text-muted">{game.spectators.join(", ") || "None"}</dd>
          <dt className="font-semibold">Goal</dt>
          <dd>{game.targetScore} points</dd>
          <dt className="font-semibold">Decks</dt>
          <dd className="min-w-0 break-words">{game.deckNames.join(", ") || "None selected"}</dd>
        </dl>

        {pending && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void go(pending);
            }}
          >
            <input
              className={`${inputClass} py-2`}
              type="password"
              placeholder="Room password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={64}
              autoFocus
              required
            />
            <Button className="min-h-10 shrink-0" disabled={busy || !password}>
              {pending === "player" ? "Join" : "Spectate"}
            </Button>
          </form>
        )}
        {error && <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">{error}</p>}
      </div>

      <div className="flex border-t border-line sm:w-36 sm:flex-col sm:border-l sm:border-t-0">
        <button
          type="button"
          onClick={() => go("player")}
          disabled={!!joinBlocked || busy}
          className="flex min-h-12 flex-1 items-center justify-center bg-accent px-3 text-sm font-black uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted sm:flex-[2]"
        >
          {joinBlocked ?? "Join"}
        </button>
        <button
          type="button"
          onClick={() => go("spectator")}
          disabled={!!spectateBlocked || busy}
          className="flex min-h-12 flex-1 items-center justify-center border-l border-line px-3 text-sm font-bold uppercase tracking-wide transition hover:bg-paper disabled:cursor-not-allowed disabled:text-muted sm:border-l-0 sm:border-t"
        >
          {spectateBlocked && spectateBlocked !== "Full" ? spectateBlocked : spectateBlocked ? "Watch full" : "Spectate"}
        </button>
      </div>
    </li>
  );
}
