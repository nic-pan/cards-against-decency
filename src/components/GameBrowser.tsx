"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { blocks, call, getSocket, session, type BlockedPerson } from "@/lib/socket";
import { TERMS_VERSION, offences, type JoinAs, type JoinResult, type OnlineUser, type RoomListing } from "@/lib/protocol";
import { Badge, Button, inputClass } from "./ui";

/** The public game list. Shown after the player chooses a name and accepts the terms. */
export function GameBrowser({
  name,
  onLogout,
  logo,
}: {
  name: string;
  onLogout: () => void;
  /** Shown left in the top row, next to "Playing as … · Log out". */
  logo?: React.ReactNode;
}) {
  const router = useRouter();
  const [games, setGames] = useState<RoomListing[] | null>(null);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [seat, setSeat] = useState<{ code: string; token: string; hostName?: string } | null>(null);

  // Show a banner when this browser still has a seat in a game.
  useEffect(() => {
    const current = session.current();
    if (!current) return;
    void call<{ valid: boolean; hostName?: string }>("room:seat", current).then((r) => {
      if (r.ok && r.data.valid) setSeat({ ...current, hostName: r.data.hostName });
      else if (r.ok) session.clear(current.code);
    });
  }, []);

  /** Leaves any game, forgets the name and the terms, and shows the first screen. */
  async function logout() {
    const current = session.current();
    if (current) await call("room:abandon", current);
    session.logout();
    onLogout();
  }

  useEffect(() => {
    const socket = getSocket();
    const onLobby = (p: { games: RoomListing[] }) => setGames(p.games);
    const onOnline = (p: { users: OnlineUser[] }) => setOnline(p.users);
    const subscribe = () =>
      void call<{ games: RoomListing[]; online: OnlineUser[] }>("lobby:subscribe").then((r) => {
        if (!r.ok) return;
        setGames(r.data.games);
        setOnline(r.data.online ?? []);
      });
    socket.on("lobby", onLobby);
    socket.on("online", onOnline);
    socket.on("connect", subscribe);
    if (socket.connected) subscribe();
    return () => {
      socket.off("lobby", onLobby);
      socket.off("online", onOnline);
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
    const r = await call<JoinResult>("room:join", {
      code: game.code,
      name,
      password,
      as,
      termsVersion: TERMS_VERSION,
      previous: session.current(),
    });
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
      <header className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {logo}
        <p className="text-sm">
          Playing as <b className="break-all">{name}</b>
          <span className="mx-2 text-muted">·</span>
          <button type="button" className="font-semibold text-accent underline" onClick={() => void logout()}>
            Log out
          </button>
        </p>
      </header>
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


      {seat && <StillInGame seat={seat} onLeft={() => setSeat(null)} />}

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
            <GameCard
              key={g.code}
              game={g}
              onJoin={join}
              onRejoin={seat?.code === g.code ? () => router.push(`/r/${g.code}`) : undefined}
            />
          ))}
        </ul>
      )}

      <OnlinePanel users={online} />
    </div>
  );
}

// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<OnlineUser["status"], string> = {
  playing: "In a game",
  watching: "Watching a game",
  browsing: "Browsing games",
};

/** Who is online, without the room they are in. You can block people here, and unblock them. */
function OnlinePanel({ users }: { users: OnlineUser[] }) {
  const [blocked, setBlocked] = useState<BlockedPerson[]>([]);
  const [confirm, setConfirm] = useState<OnlineUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setBlocked(blocks.list()), []);

  async function block(u: OnlineUser) {
    setError(await blocks.add({ handle: u.handle }));
    setConfirm(null);
    setBlocked(blocks.list());
  }

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-4" aria-label="Online now">
      <h2 className="mb-2 font-bold">
        Online now <span className="font-normal text-muted">({users.length})</span>
      </h2>
      {users.length === 0 ? (
        <p className="text-sm text-muted">Nobody else is here right now.</p>
      ) : (
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {users.map((u) => (
            <li key={u.handle} className="border-b border-line py-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden />
                <span className="min-w-0 truncate font-semibold" title={u.name}>
                  {u.name}
                </span>
                {u.you && <Badge tone="accent">You</Badge>}
                <span className="ml-auto shrink-0 text-xs text-muted">{STATUS_LABEL[u.status]}</span>
                {u.blocked ? (
                  <span className="shrink-0 px-1.5 text-xs font-semibold text-danger">Blocked</span>
                ) : !u.you && (
                  <button
                    type="button"
                    className="shrink-0 rounded px-1.5 text-xs text-muted underline hover:text-danger"
                    onClick={() => setConfirm(confirm?.handle === u.handle ? null : u)}
                  >
                    Block
                  </button>
                )}
              </div>
              {confirm?.handle === u.handle && (
                <div role="alert" className="mt-2 rounded-lg border border-danger bg-danger-soft p-2.5 text-xs">
                  <p className="font-bold text-danger">Block {u.name}?</p>
                  <p className="mt-0.5 text-ink">
                    You will not see each other&apos;s games, and you cannot join the same game. They will not see you
                    online. They are not told.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rounded bg-danger px-2.5 py-1 font-bold text-white" onClick={() => void block(u)}>
                      Block
                    </button>
                    <button type="button" className="rounded border border-line px-2.5 py-1" onClick={() => setConfirm(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {blocked.length > 0 && (
        <details className="mt-3 border-t border-line pt-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            Blocked <span className="font-normal text-muted">({blocked.length}, only you see this)</span>
          </summary>
          <ul className="mt-2 space-y-1">
            {blocked.map((b) => (
              <li key={b.token} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{b.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-accent underline"
                  onClick={() => {
                    blocks.remove(b.token);
                    setBlocked(blocks.list());
                  }}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

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
      previous: session.current(),
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
  onRejoin,
}: {
  game: RoomListing;
  onJoin: (g: RoomListing, as: JoinAs, password?: string) => Promise<string | null>;
  /** Set when this browser still has a seat in this game. The seat is kept, so no join is needed. */
  onRejoin?: () => void;
}) {
  const [pending, setPending] = useState<JoinAs | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const humans = game.players.filter((p) => !p.isBot).length;
  const bots = game.players.length - humans;
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
          {humans}/{game.maxPlayers} players
          {bots > 0 && ` · ${bots} ${bots === 1 ? "bot" : "bots"}`} · {game.spectators.length}/{game.maxSpectators}{" "}
          spectators
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
          <dd>{offences(game.targetScore)}</dd>
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
          onClick={() => (onRejoin ? onRejoin() : go("player"))}
          disabled={onRejoin ? false : !!joinBlocked || busy}
          className="flex min-h-12 flex-1 items-center justify-center bg-accent px-3 text-sm font-black uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted sm:flex-[2]"
        >
          {onRejoin ? "Rejoin" : (joinBlocked ?? "Join")}
        </button>
        <button
          type="button"
          onClick={() => go("spectator")}
          disabled={!!onRejoin || !!spectateBlocked || busy}
          title={onRejoin ? "You already have a seat in this game." : undefined}
          className="flex min-h-12 flex-1 items-center justify-center border-l border-line px-3 text-sm font-bold uppercase tracking-wide transition hover:bg-paper disabled:cursor-not-allowed disabled:text-muted sm:border-l-0 sm:border-t"
        >
          {spectateBlocked && spectateBlocked !== "Full" ? spectateBlocked : spectateBlocked ? "Watch full" : "Spectate"}
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

/** "You are still in a game" banner, with a way back and a way out. */
function StillInGame({
  seat,
  onLeft,
}: {
  seat: { code: string; token: string; hostName?: string };
  onLeft: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    await call("room:abandon", { code: seat.code, token: seat.token });
    session.clear(seat.code);
    setBusy(false);
    onLeft();
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-accent bg-accent-soft p-4 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm">
        <b>You are still in a game</b>
        {seat.hostName ? ` (${seat.hostName}'s Game, ${seat.code})` : ` (${seat.code})`}. Your seat is kept for 90
        seconds after you leave the game screen.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button className="min-h-10" onClick={() => router.push(`/r/${seat.code}`)}>
          Back to game
        </Button>
        <Button variant="ghost" className="min-h-10" disabled={busy} onClick={() => void leave()}>
          Leave game
        </Button>
      </div>
    </div>
  );
}
