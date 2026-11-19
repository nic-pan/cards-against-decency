"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { call, getSocket, session } from "@/lib/socket";
import { TERMS_VERSION, type GameView, type JoinAs, type JoinResult } from "@/lib/protocol";
import { Board, verdictFor } from "./Board";
import { Lobby } from "./Lobby";
import { PlayerList } from "./PlayerList";
import { ProfileForm } from "./ProfileForm";
import { VoteBanner } from "./VoteBanner";
import { Button, Field, inputClass } from "./ui";
import {
  installActivityTracker,
  installAudioUnlock,
  isMuted,
  playEventSound,
  playTurnSound,
  preloadSounds,
  secondsSinceActivity,
  setMuted,
} from "@/lib/sounds";

/** The room view. bans is empty for everybody but the host. */
export type View = GameView & { code: string; bans: { id: string; name: string }[] };

type Status =
  | { kind: "connecting" }
  | { kind: "join"; needsPassword: boolean }
  | { kind: "in" }
  | { kind: "gone"; message: string; removed?: "idle" | "kicked" | "banned" | "voted"; timesRemoved?: number; cooldownMs?: number };

export function Room({ code }: { code: string }) {
  const [status, setStatus] = useState<Status>({ kind: "connecting" });
  const [view, setView] = useState<View | null>(null);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clockOffset = useRef(0);
  const lastView = useRef<View | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  useTurnAlert(view, clockOffset);
  useIdleWarningSound(view);
  useGameStoppedSound(view);
  useBotAddedSound(view);
  useLastPlaceSound(view);
  // Players removed in the last seconds. A Czar who was removed gets the thud, not the "Czar left" sound.
  const recentlyRemoved = useRef(new Set<string>());
  useCzarLeftSound(view, recentlyRemoved);
  useEffect(() => {
    installAudioUnlock();
    installActivityTracker();
    preloadSounds();
  }, []);
  const phone = useIsPhone();
  // On phones, keep the screen on during a game, so the connection and the turn reminders stay alive.
  useWakeLock(phone && !!view && view.phase !== "lobby" && view.phase !== "gameOver" && !view.youAreSpectator);

  const resume = useCallback(async () => {
    const token = session.get(code);
    if (token) {
      const r = await call<JoinResult>("room:resume", { code, token });
      if (r.ok) return setStatus({ kind: "in" });
      session.clear(code);
      if (r.error === "BANNED") return setStatus({ kind: "gone", message: r.text, removed: "banned" });
    }
    const info = await call<{ exists: boolean; needsPassword: boolean }>("room:info", { code });
    if (!info.ok) return setStatus({ kind: "gone", message: info.text });
    if (!info.data.exists) return setStatus({ kind: "gone", message: "This room does not exist or has closed." });
    setStatus({ kind: "join", needsPassword: info.data.needsPassword });
  }, [code]);

  useEffect(() => {
    const socket = getSocket();
    const onPlayerRemoved = ({ playerId, reason }: { playerId: string; name: string; reason: Ghost["reason"] }) => {
      const last = lastView.current;
      const index = last?.players.findIndex((p) => p.id === playerId) ?? -1;
      if (!last || index < 0) return;
      // When this removal stops the game, useGameStoppedSound plays the "faaah" instead.
      const inGame = last.phase === "submitting" || last.phase === "judging" || last.phase === "roundOver";
      const stopsGame = inGame && last.players.length - 1 < 3;
      // The banned player hears the long "fahhh"; everybody else hears the short "faaah".
      // A 3rd removal of the same connection gets the gunshot for everybody.
      if (!stopsGame) playEventSound(reason === "banned" ? "faaah" : reason === "kickedAgain" ? "gunshot" : "removed");
      recentlyRemoved.current.add(playerId);
      setTimeout(() => recentlyRemoved.current.delete(playerId), 5000);
      const ghost: Ghost = { player: last.players[index], index, reason };
      setGhosts((g) => [...g.filter((x) => x.player.id !== playerId), ghost]);
      setTimeout(() => setGhosts((g) => g.filter((x) => x !== ghost)), GHOST_MS);
    };
    const onState = (v: View) => {
      if (v.code !== code) return;
      clockOffset.current = v.serverNow - Date.now();
      lastView.current = v;
      setView(v);
    };
    const onRemoved = ({ reason, times, cooldownMs }: { reason: string; times?: number; cooldownMs?: number }) => {
      // The server counts removals for each connection. The browser's own count is the fallback.
      const timesRemoved = reason === "kicked" ? (times ?? countRemoval(code)) : undefined;
      if (reason === "banned") playEventSound("banned");
      // The third removal from the same room gets the gunshot instead of the thud.
      else if (reason === "kicked" && (timesRemoved ?? 0) >= 3) playEventSound("gunshot");
      else if (reason === "idle" || reason === "kicked" || reason === "voted") playEventSound("removed");
      session.clear(code);
      setView(null);
      if (reason === "idle" || reason === "kicked" || reason === "banned" || reason === "voted") {
        return setStatus({ kind: "gone", message: "", removed: reason, timesRemoved, cooldownMs });
      }
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
    socket.on("player:removed", onPlayerRemoved);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) void resume();
    return () => {
      socket.off("state", onState);
      socket.off("removed", onRemoved);
      socket.off("player:removed", onPlayerRemoved);
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
  if (status.kind === "gone" && status.removed === "idle") return <IdleRemoved />;
  if (status.kind === "gone" && status.removed === "banned") return <Banned />;
  if (status.kind === "gone" && status.removed === "voted") return <VotedOut cooldownMs={status.cooldownMs} />;
  if (status.kind === "gone" && status.removed) return <HostRemoved timesRemoved={status.timesRemoved ?? 1} cooldownMs={status.cooldownMs} />;
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
    return (
      <JoinForm
        code={code}
        needsPassword={status.needsPassword}
        onJoined={() => setStatus({ kind: "in" })}
        onBanned={() => setStatus({ kind: "gone", message: "", removed: "banned" })}
      />
    );
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
      {view.vote && <VoteBanner vote={view.vote} youId={view.youId} act={act} clockOffset={clockOffset.current} />}
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

      <div className="mt-4 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <aside className="order-2 lg:order-1">
          <PlayerList view={view} isHost={isHost} act={act} ghosts={ghosts} />
          <ActivityLog log={view.log} />
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

/** A removed player's row that stays visible while it fades out. */
export type Ghost = { player: GameView["players"][number]; index: number; reason: "kicked" | "kickedAgain" | "banned" | "idle" | "voted" };
/** A little longer than the fade, so the row is gone before React removes it. */
const GHOST_MS = 1900;

export type Act = (event: Parameters<typeof call>[0], payload?: unknown) => Promise<boolean>;

/** The horn plays in the last seconds of a turn, every 5 seconds, until the player acts. */
const REMIND_FROM_SECONDS = 15;
const REMIND_EVERY_SECONDS = 5;
/** A player who did something on the page this recently is not idle, so the horn stays quiet. */
const ACTIVE_WITHIN_SECONDS = 10;

/**
 * Reminds the player when it is their turn: to play a card, or to choose as Card Czar.
 * In the last 15 seconds, while the player has not acted, the horn plays every 5 seconds
 * (at 15, 10 and 5 seconds left), but only when the player seems idle: in another tab, or
 * no mouse, touch, scroll or key activity for 10 seconds. While in another tab, the title blinks.
 */
function useTurnAlert(view: View | null, clockOffset: React.MutableRefObject<number>) {
  // mustSubmit is false once the player has played; the Czar's turn ends when the Czar chooses.
  const myTurn =
    !!view && (view.mustSubmit || (view.phase === "judging" && view.round?.czarId === view.youId));
  const deadline = view?.round?.deadline ?? null;
  const key = view?.round ? `${view.round.number}:${view.phase}` : "";

  useEffect(() => {
    if (!myTurn) return;
    const played = new Set<number>();
    const title = document.title;
    let flip = false;
    const tick = setInterval(() => {
      if (deadline) {
        const left = Math.ceil((deadline - (Date.now() + clockOffset.current)) / 1000);
        // Play at 15, 10 and 5 seconds left, once each.
        const mark = Math.ceil(left / REMIND_EVERY_SECONDS) * REMIND_EVERY_SECONDS;
        const away = document.hidden || !document.hasFocus();
        const idle = away || secondsSinceActivity() > ACTIVE_WITHIN_SECONDS;
        if (left > 0 && left <= REMIND_FROM_SECONDS && !played.has(mark)) {
          played.add(mark);
          if (idle) playTurnSound();
        }
      }
      const away = document.hidden || !document.hasFocus();
      if (away) {
        flip = !flip;
        document.title = flip ? "🃏 Your turn!" : title;
      } else if (document.title !== title) {
        document.title = title;
      }
    }, 1000);
    return () => {
      clearInterval(tick);
      document.title = title;
    };
  }, [myTurn, key, deadline, clockOffset]);
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
      <p>
        <b>📱 Keep this page open.</b> Your phone may not remind you when it is your turn, and 2 missed rounds remove
        you. We keep the screen awake while you play.{" "}
        <button type="button" className="font-bold text-accent underline" onClick={dismiss}>
          Got it
        </button>
      </p>
    </div>
  );
}

/** Plays once for everybody when the Card Czar leaves during a round and the round is cancelled. */
function useCzarLeftSound(view: View | null, recentlyRemoved: React.MutableRefObject<Set<string>>) {
  const end = view?.round?.end;
  const czarId = view?.round?.czarId;
  const key = view?.round ? `${view.round.number}:${end}` : "";
  const announced = useRef("");
  useEffect(() => {
    if (end !== "czarLeft" || !czarId || announced.current === key) return;
    announced.current = key;
    if (!recentlyRemoved.current.has(czarId)) playEventSound("czarLeft");
  }, [end, czarId, key, recentlyRemoved]);
}

/**
 * Plays the short "faaah" when a running game stops at once and goes back to the lobby,
 * for example because fewer than 3 players are left. A normal game end shows the
 * scores (gameOver) and stays quiet.
 */
function useGameStoppedSound(view: View | null) {
  const phase = view?.phase;
  const before = useRef(phase);
  useEffect(() => {
    const wasPlaying = before.current === "submitting" || before.current === "judging" || before.current === "roundOver";
    if (wasPlaying && phase === "lobby") playEventSound("faaah");
    before.current = phase;
  }, [phase]);
}

/** When a game ends: the "fail" sound for last place and when nobody scored, the fading scream for the places between first and last. */
function useLastPlaceSound(view: View | null) {
  const phase = view?.phase;
  const before = useRef(phase);
  useEffect(() => {
    // Only when the game ends while the page is open, not when the page opens on the end screen.
    if (view && phase === "gameOver" && before.current && before.current !== "gameOver") {
      const ranked = [...view.players].sort((a, b) => b.score - a.score);
      const verdict = verdictFor(view.youId, ranked)?.title;
      // Nobody scored ("An Embarrassment to the Department"): everybody hears the fail sound.
      const nobodyScored = (ranked[0]?.score ?? 0) === 0;
      const watching = !view.players.some((p) => p.id === view.youId);
      if (nobodyScored && !watching) playEventSound("lastPlace");
      else if (verdict === "Clean Record") playEventSound("lastPlace");
      else if (verdict === "Within Acceptable Limits") playEventSound("middlePlace");
    }
    before.current = phase;
  }, [phase, view]);
}

/** Plays the duck toy once when one or more bots join the room. Bots already there when the page opens stay quiet. */
function useBotAddedSound(view: View | null) {
  const bots = view?.players.filter((p) => p.isBot).map((p) => p.id) ?? [];
  const key = bots.join(",");
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!view) return;
    const ids = key ? key.split(",") : [];
    if (known.current && ids.some((id) => !known.current!.has(id))) playEventSound("botAdded");
    known.current = new Set(ids);
  }, [key, view]);
}

/** Plays the "suspenseful boom" once, when the player gets the red idle warning. */
function useIdleWarningSound(view: View | null) {
  const idle = view?.yourIdleRounds ?? 0;
  const before = useRef(idle);
  useEffect(() => {
    if (idle === 1 && before.current === 0) playEventSound("idleWarning");
    before.current = idle;
  }, [idle]);
}

/** Turns all game sounds on or off for this browser. */
function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);
  return (
    <button
      type="button"
      aria-pressed={!muted}
      title={muted ? "Sounds are off. Click to turn them on." : "Sounds are on. Click to turn them off."}
      onClick={() => {
        const next = !muted;
        setMutedState(next);
        setMuted(next);
        if (!next) playTurnSound();
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface"
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
      <span className="hidden sm:inline">{muted ? "Sound off" : "Sound on"}</span>
      <span className="sr-only sm:hidden">{muted ? "Sound off" : "Sound on"}</span>
    </button>
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
    <header className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-4">
      {/* The logo asks before it leaves the game, like the Leave button. */}
      <Link
        href="/"
        className="hidden items-center gap-2 text-lg font-black tracking-tight sm:inline-flex"
        onClick={(e) => {
          e.preventDefault();
          setConfirmLeave(true);
        }}
      >
        <LogoMark />
        Cards Against Decency
      </Link>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 sm:px-3">
        <span className="hidden text-xs text-muted sm:inline">Room</span>
        <span className="font-mono text-base font-bold tracking-[0.2em]">{code}</span>
      </div>
      <Button variant="ghost" className="min-h-9 px-3" onClick={copy} aria-label="Copy invite link">
        <span className="sm:hidden">{copied ? "Copied" : "Invite"}</span>
        <span className="hidden sm:inline">{copied ? "Link copied" : "Copy invite link"}</span>
      </Button>
      <SoundToggle />
      {practice && (
        <span className="hidden rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent sm:inline">
          Practice mode
        </span>
      )}
      <div className="ml-auto">
        {confirmLeave ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="hidden sm:inline">Leave the room?</span>
            <span className="sm:hidden">Leave?</span>
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

/**
 * The room's activity log under the player list: joins, leaves, rounds, winners and
 * removals. Newest first, in a box that scrolls, so it never pushes the game down.
 */
function ActivityLog({ log }: { log: View["log"] }) {
  // Entries that arrive while the page is open light up for a moment.
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(log.map((n) => n.id));
      return;
    }
    const added = log.filter((n) => !seen.current!.has(n.id)).map((n) => n.id);
    if (added.length === 0) return;
    for (const id of added) seen.current.add(id);
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 2500);
    return () => clearTimeout(t);
  }, [log]);

  if (log.length === 0) return null;
  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="Activity">
      <h2 className="mb-2 font-bold">Activity</h2>
      <ol className="max-h-56 space-y-1 overflow-y-auto pr-1 text-xs" aria-live="polite">
        {[...log].reverse().map((n) => (
          <li
            key={n.id}
            className={`flex gap-2 rounded px-1.5 py-1 transition-colors duration-700 ${
              fresh.has(n.id) ? (n.tone === "danger" ? "bg-danger-soft" : "bg-accent-soft") : ""
            }`}
          >
            <time className="shrink-0 tabular-nums text-muted" dateTime={new Date(n.at).toISOString()}>
              {time(n.at)}
            </time>
            {n.tone === "bot" ? (
              // Bot arrivals look like a field report, so nobody takes them for a person.
              <span className="border-l-2 border-dashed border-muted pl-2 italic text-muted">
                <span aria-hidden>🕵️ </span>
                {n.text}
              </span>
            ) : (
              <span className={n.tone === "danger" ? "font-semibold text-danger" : ""}>{n.text}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
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

/** Counts how often the host removed this browser from a room. Only for the message text. */
function countRemoval(code: string): number {
  const key = `bs.removed.${code}`;
  try {
    const n = Number(localStorage.getItem(key) ?? 0) + 1;
    localStorage.setItem(key, String(n));
    return n;
  } catch {
    return 1;
  }
}

/** Shown to a player whom the host removed. In the page, not a browser pop-up. */
function HostRemoved({ timesRemoved, cooldownMs }: { timesRemoved: number; cooldownMs?: number }) {
  return (
    <RemovalCard icon="🚪" title="The host removed you from this room.">
      <p className="mt-3 text-sm leading-relaxed text-ink">
        {timesRemoved >= 3
          ? "The host has had enough. Understandably."
          : "Take it up with management. There is no management."}
      </p>
      {cooldownMs && (
        <p className="mt-3 text-sm font-semibold leading-relaxed text-danger">
          You can join this room again in {Math.round(cooldownMs / 60_000)} minutes.
        </p>
      )}
    </RemovalCard>
  );
}

/** Shown to a player whom the other players voted out. */
function VotedOut({ cooldownMs }: { cooldownMs?: number }) {
  return (
    <RemovalCard icon="🗳️" title="The players voted you out of this room.">
      <p className="mt-3 text-sm leading-relaxed text-ink">Democracy has spoken. It was not kind.</p>
      {cooldownMs && (
        <p className="mt-3 text-sm font-semibold leading-relaxed text-danger">
          You can join this room again in {Math.round(cooldownMs / 60_000)} minutes.
        </p>
      )}
    </RemovalCard>
  );
}

/** Shown to a player whom the host banned. */
function Banned() {
  return (
    <RemovalCard icon="⛔" title="You have been banned from this room.">
      <p className="mt-3 text-sm leading-relaxed text-ink">The host has exercised questionable authority.</p>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-danger">
        Your access to this room has been revoked. You will not be able to rejoin.
      </p>
    </RemovalCard>
  );
}

function RemovalCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <section role="alert" className="rounded-2xl border-2 border-danger bg-danger-soft p-6 text-center">
        <p className="text-4xl" aria-hidden>
          {icon}
        </p>
        <h1 className="mt-3 text-xl font-black text-danger">{title}</h1>
        {children}
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
          You missed 2 consecutive rounds, so the game removed you. Nobody signed up to watch an empty seat.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          If you&apos;re taking a break, use <b>Leave</b>. Don&apos;t just disappear and make everyone wait for you.
        </p>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-danger">
          There are eight billion people on this planet. The game doesn&apos;t need to wait for you.
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

/** The card stack logo, next to the name in headers. */
function LogoMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo/mark.webp" alt="" width={128} height={115} className="h-8 w-auto" />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-24 text-center">{children}</div>;
}

function JoinForm({
  code,
  needsPassword,
  onJoined,
  onBanned,
}: {
  code: string;
  needsPassword: boolean;
  onJoined: () => void;
  onBanned: () => void;
}) {
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
    if (!r.ok && r.error === "BANNED") return onBanned();
    if (!r.ok) return setError(r.text);
    session.set(code, r.data.token);
    onJoined();
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-lg font-black tracking-tight">
        <LogoMark />
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
