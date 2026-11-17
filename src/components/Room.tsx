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
import { getSoundStyle, playTurnSound, setSoundStyle, type SoundStyle } from "@/lib/sounds";

type View = GameView & { code: string };

type Status =
  | { kind: "connecting" }
  | { kind: "join"; needsPassword: boolean }
  | { kind: "in" }
  | { kind: "gone"; message: string; idle?: boolean };

export function Room({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>({ kind: "connecting" });
  const [view, setView] = useState<View | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clockOffset = useRef(0);
  useTurnAlert(view);
  const phone = useIsPhone();
  // On phones, keep the screen on during a game, so the connection and the turn reminders stay alive.
  useWakeLock(phone && !!view && view.phase !== "lobby" && view.phase !== "gameOver" && !view.youAreSpectator);

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
      if (reason === "idle") return setStatus({ kind: "gone", message: "", idle: true });
      setStatus({
        kind: "gone",
        message:
          reason === "closed"
            ? "The room closed because nobody played for a long time."
            : reason === "left"
              ? "You left this game."
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
  if (status.kind === "gone" && status.idle) return <IdleRemoved />;
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
      {view.yourIdleRounds === 1 && view.phase !== "lobby" && view.phase !== "gameOver" && (
        <Banner tone="danger">
          <span role="alert">
            You missed a round. If you miss the next one too, you will be removed from the game.
          </span>
        </Banner>
      )}
      {phone && !view.youAreSpectator && <PhoneNotice />}
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
      <Notices view={view} />

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

/**
 * Reminds the player when it is their turn: to play a card, or to choose as Card Czar.
 * One sound when the turn starts. While the player looks at another tab or app,
 * the sound repeats every 5 seconds and the tab title blinks.
 */
function useTurnAlert(view: View | null) {
  const myTurn =
    !!view && (view.mustSubmit || (view.phase === "judging" && view.round?.czarId === view.youId));
  const key = view?.round ? `${view.round.number}:${view.phase}` : "";
  const announced = useRef("");

  useEffect(() => {
    if (!myTurn) return;
    if (announced.current !== key) {
      announced.current = key;
      playTurnSound();
    }
    const away = () => document.hidden || !document.hasFocus();
    const title = document.title;
    let flip = false;
    const repeat = setInterval(() => {
      if (away()) playTurnSound();
    }, 5000);
    const blink = setInterval(() => {
      if (away()) {
        flip = !flip;
        document.title = flip ? "🃏 Your turn!" : title;
      } else if (document.title !== title) {
        document.title = title;
      }
    }, 1000);
    return () => {
      clearInterval(repeat);
      clearInterval(blink);
      document.title = title;
    };
  }, [myTurn, key]);
}

/** True on touch devices such as phones and tablets. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    try {
      setPhone(window.matchMedia("(pointer: coarse)").matches);
    } catch {}
  }, []);
  return phone;
}

/** Keeps the screen on while `enabled` is true. Browsers drop the lock when the tab is hidden, so take it again. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const take = async () => {
      if (document.hidden || stopped) return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // The browser can refuse, for example in battery saver mode. The game still works.
      }
    };
    void take();
    const onVisible = () => void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}

const PHONE_NOTICE_KEY = "bs.phoneNotice";

/** A one-time notice for phone players: their phone may not remind them when it is their turn. */
function PhoneNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(PHONE_NOTICE_KEY) !== "seen");
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(PHONE_NOTICE_KEY, "seen");
    } catch {}
    setShow(false);
  };
  return (
    <div className="mt-3 rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
      <p className="font-bold">📱 You are playing on a phone</p>
      <p className="mt-1">
        Phones often do not play sounds or show reminders when the game is not on the screen. When it is your turn,
        everybody waits for you, and after 2 missed rounds the game removes you. Keep this page open while you play.
      </p>
      <p className="mt-1 text-muted">We keep your screen awake during the game, if your phone allows it.</p>
      <button type="button" className="mt-2 text-sm font-bold text-accent underline" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}

const SOUND_LABELS: Record<SoundStyle, string> = { funny: "🤡 Funny", gentle: "🔔 Gentle", off: "🔇 Off" };

/** Turn sound choice for this browser. Changing it plays a sample. */
function SoundPicker() {
  const [style, setStyle] = useState<SoundStyle>("funny");
  useEffect(() => setStyle(getSoundStyle()), []);
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted" title="Sound when it is your turn">
      <span className="sr-only sm:not-sr-only">Turn sound</span>
      <select
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
        value={style}
        onChange={(e) => {
          const next = e.target.value as SoundStyle;
          setStyle(next);
          setSoundStyle(next);
          playTurnSound(next);
        }}
        aria-label="Turn sound"
      >
        {(Object.keys(SOUND_LABELS) as SoundStyle[]).map((k) => (
          <option key={k} value={k}>
            {SOUND_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

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
      {/* The logo asks before it leaves the game, like the Leave button. */}
      <Link
        href="/"
        className="text-lg font-black tracking-tight"
        onClick={(e) => {
          e.preventDefault();
          setConfirmLeave(true);
        }}
      >
        Cards Against Decency
      </Link>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5">
        <span className="text-xs text-muted">Room</span>
        <span className="font-mono text-base font-bold tracking-[0.2em]">{code}</span>
      </div>
      <Button variant="ghost" className="min-h-9 px-3" onClick={copy}>
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
      <SoundPicker />
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

/** Recent game events, newest last. Red ones are about idle players and missed rounds. */
function Notices({ view }: { view: View }) {
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const shown = view.notices.filter((n) => !hidden.has(n.id));
  if (shown.length === 0) return null;
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {shown.map((n) => (
        <div
          key={n.id}
          role={n.tone === "danger" ? "alert" : undefined}
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
            n.tone === "danger" ? "border-danger bg-danger-soft font-semibold text-danger" : "border-line bg-surface"
          }`}
        >
          <span>{n.text}</span>
          <button
            className={n.tone === "danger" ? "text-danger" : "text-muted"}
            aria-label="Dismiss"
            onClick={() => setHidden((h) => new Set(h).add(n.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function Banner({ children, tone }: { children: React.ReactNode; tone: "accent" | "danger" }) {
  return (
    <div
      className={`mt-3 flex flex-wrap items-center rounded-lg px-4 py-2.5 text-sm font-semibold ${
        tone === "danger" ? "border border-danger bg-danger-soft text-danger" : "bg-accent-soft text-ink"
      }`}
    >
      {children}
    </div>
  );
}

/** Shown to a player whom the game removed for missing rounds. In the page, not a browser pop-up. */
function IdleRemoved() {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <section role="alert" className="rounded-2xl border-2 border-danger bg-danger-soft p-6 text-center">
        <p className="text-4xl" aria-hidden>
          ⏰
        </p>
        <h1 className="mt-3 text-xl font-black text-danger">You were removed for being idle</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          You missed 2 consecutive rounds, so the game removed you to keep things moving for everyone else.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          If you need a break, please use Leave instead of leaving your game unattended. You can always join again later.
        </p>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-danger">
          Don&apos;t hold everyone hostage. The other players have a questionable sense of humour to attend to.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-ink px-5 text-sm font-bold text-paper"
        >
          Back to the game list
        </Link>
      </section>
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
      previous: session.current(),
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
