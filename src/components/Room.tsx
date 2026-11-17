"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { call, getSocket, session } from "@/lib/socket";
import { TERMS_VERSION, type GameView, type JoinAs, type JoinResult } from "@/lib/protocol";
import { Board } from "./Board";
import { Lobby } from "./Lobby";
import { PlayerList } from "./PlayerList";
import { ProfileForm } from "./ProfileForm";
import { Button, Field, inputClass } from "./ui";

type View = GameView & { code: string };

type Status =
  | { kind: "connecting" }
  | { kind: "join"; needsPassword: boolean }
  | { kind: "in" }
  | { kind: "gone"; message: string };

export function Room({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>({ kind: "connecting" });
  const [view, setView] = useState<View | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clockOffset = useRef(0);

  const resume = useCallback(async () => {
    const token = session.get(code);
    if (token) {
      const r = await call<JoinResult>("room:resume", { code, token });
      if (r.ok) return setStatus({ kind: "in" });
      session.clear(code);
      if (r.error === "BANNED") return setStatus({ kind: "gone", message: r.text });
    }
    const info = await call<{ exists: boolean; needsPassword: boolean }>("room:info", { code });
    if (!info.ok) return setStatus({ kind: "gone", message: info.text });
    if (!info.data.exists) return setStatus({ kind: "gone", message: "This room does not exist or has closed." });
    setStatus({ kind: "join", needsPassword: info.data.needsPassword });
  }, [code]);

  useEffect(() => {
    const socket = getSocket();
    const onState = (v: View) => {
      if (v.code !== code) return;
      clockOffset.current = v.serverNow - Date.now();
      setView(v);
    };
    const onRemoved = ({ reason }: { reason: string }) => {
      session.clear(code);
      setView(null);
      setStatus({
        kind: "gone",
        message:
          reason === "closed"
            ? "The room closed because nobody played for a long time."
            : reason === "banned"
              ? "The host removed you from this room and you can't join again."
              : "The host removed you from this room.",
      });
    };
    const onConnect = () => {
      setOffline(false);
      void resume();
    };
    const onDisconnect = () => setOffline(true);

    socket.on("state", onState);
    socket.on("removed", onRemoved);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) void resume();
    return () => {
      socket.off("state", onState);
      socket.off("removed", onRemoved);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [code, resume]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Sends an action and shows an error message if the server rejects it. */
  const act = useCallback(async (event: Parameters<typeof call>[0], payload?: unknown) => {
    const r = await call(event, payload);
    if (!r.ok) setToast(r.text);
    return r.ok;
  }, []);

  async function leave() {
    await call("room:leave");
    session.clear(code);
    window.location.href = "/";
  }

  if (status.kind === "connecting") return <Centered>Connecting…</Centered>;
  if (status.kind === "gone")
    return (
      <Centered>
        <p className="mb-4">{status.message}</p>
        <Link href="/" className="font-bold underline">
          Go to the home page
        </Link>
      </Centered>
    );
  if (status.kind === "join")
    return <JoinForm code={code} needsPassword={status.needsPassword} onJoined={() => setStatus({ kind: "in" })} />;
  if (!view) return <Centered>Loading the room…</Centered>;

  const me = view.players.find((p) => p.id === view.youId);
  const isHost = view.hostId === view.youId;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-4 lg:pb-8">
      <RoomHeader code={code} practice={view.practice} onLeave={leave} />

      {offline && (
        <Banner tone="accent">Connection lost. Trying to reconnect… Your seat is kept for 90 seconds.</Banner>
      )}
      {me?.status === "away" && (
        <Banner tone="accent">
          <span>You missed two rounds, so you are sitting out.</span>
          <Button className="ml-3 min-h-9" onClick={() => act("player:back")}>
            I&apos;m back
          </Button>
        </Banner>
      )}
      {view.youAreSpectator && (
        <Banner tone="accent">
          <span>You are watching this game as a spectator.</span>
          {canJoin(view) ? (
            <Button className="ml-3 min-h-9" onClick={() => act("player:play")}>
              Join the game
            </Button>
          ) : (
            <span className="ml-2 font-normal text-muted">
              {view.players.filter((p) => !p.isBot).length >= view.settings.maxPlayers
                ? "The game is full."
                : "The host does not allow joining during the game."}
            </span>
          )}
        </Banner>
      )}
      <Notice view={view} />

      <div className="mt-4 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="order-2 lg:order-1">
          <PlayerList view={view} isHost={isHost} act={act} />
        </aside>
        <main className="order-1 min-w-0 lg:order-2">
          {view.phase === "lobby" ? (
            <Lobby view={view} isHost={isHost} act={act} />
          ) : (
            <Board view={view} isHost={isHost} act={act} clockOffset={clockOffset.current} />
          )}
        </main>
      </div>

      {toast && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-lg bg-ink px-4 py-3 text-center text-sm text-paper shadow-lg lg:bottom-6"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** True when a spectator can become a player now. The server checks the same rules. */
function canJoin(view: View): boolean {
  const humans = view.players.filter((p) => !p.isBot).length;
  const between = view.phase === "lobby" || view.phase === "gameOver";
  return humans < view.settings.maxPlayers && (between || view.settings.allowLateJoin);
}

export type Act =(event: Parameters<typeof call>[0], payload?: unknown) => Promise<boolean>;

function RoomHeader({ code, practice, onLeave }: { code: string; practice: boolean; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", link);
    }
  }

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link href="/" className="text-lg font-black tracking-tight">
        Cards Against Decency
      </Link>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5">
        <span className="text-xs text-muted">Room</span>
        <span className="font-mono text-base font-bold tracking-[0.2em]">{code}</span>
      </div>
      <Button variant="ghost" className="min-h-9 px-3" onClick={copy}>
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
      {practice && (
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">Practice mode</span>
      )}
      <div className="ml-auto">
        {confirmLeave ? (
          <span className="flex items-center gap-2 text-sm">
            Leave the room?
            <Button variant="danger" className="min-h-9 px-3" onClick={onLeave}>
              Leave
            </Button>
            <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirmLeave(false)}>
              Stay
            </Button>
          </span>
        ) : (
          <Button variant="ghost" className="min-h-9 px-3" onClick={() => setConfirmLeave(true)}>
            Leave
          </Button>
        )}
      </div>
    </header>
  );
}

function Notice({ view }: { view: View }) {
  const [hidden, setHidden] = useState<number | null>(null);
  const n = view.notice;
  if (!n || hidden === n.id) return null;
  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm">
      <span>{n.text}</span>
      <button className="text-muted" aria-label="Dismiss" onClick={() => setHidden(n.id)}>
        ✕
      </button>
    </div>
  );
}

function Banner({ children, tone }: { children: React.ReactNode; tone: "accent" }) {
  return (
    <div
      className={`mt-3 flex flex-wrap items-center rounded-lg px-4 py-2.5 text-sm font-semibold ${
        tone === "accent" ? "bg-accent-soft text-ink" : ""
      }`}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-24 text-center">{children}</div>;
}

function JoinForm({ code, needsPassword, onJoined }: { code: string; needsPassword: boolean; onJoined: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(name: string, as: JoinAs = "player") {
    setBusy(true);
    setError(null);
    const r = await call<JoinResult>("room:join", {
      code,
      name,
      as,
      password: needsPassword ? password : undefined,
      termsVersion: TERMS_VERSION,
    });
    setBusy(false);
    if (!r.ok) return setError(r.text);
    session.set(code, r.data.token);
    onJoined();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Link href="/" className="text-lg font-black tracking-tight">
        Cards Against Decency
      </Link>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h1 className="mb-1 text-xl font-bold">
          Join room <span className="font-mono tracking-[0.2em]">{code}</span>
        </h1>
        <p className="mb-5 text-sm text-muted">
          You were invited to a game. Choose a username to play, or watch as a spectator.
        </p>
        <ProfileForm
          submitLabel="Join game"
          onSubmit={(name) => join(name, "player")}
          secondaryLabel="Watch as spectator"
          onSecondary={(name) => join(name, "spectator")}
          busy={busy}
          error={error}
        >
          {needsPassword && (
            <Field label="Room password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={64}
                required
              />
            </Field>
          )}
        </ProfileForm>
      </section>
    </main>
  );
}
