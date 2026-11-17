import type { CSSProperties } from "react";
import type { BlackCard as Black, WhiteCard as White } from "@/lib/protocol";

/** Splits a prompt at its blanks and puts answers into them. */
export function fillPrompt(text: string, answers: string[] = []) {
  const parts = text.split("_");
  const blanks = parts.length - 1;
  const strip = (a: string) => a.replace(/[.!]$/, "");
  const out: { text: string; answer: boolean }[] = [];
  parts.forEach((part, i) => {
    if (part) out.push({ text: part, answer: false });
    if (i < blanks) out.push({ text: answers[i] !== undefined ? strip(answers[i]) : "______", answer: true });
  });
  // A prompt with no blank takes its answers at the end.
  if (blanks === 0) answers.forEach((a) => out.push({ text: ` ${a}`, answer: true }));
  return out;
}

/**
 * Card grid. Cards are squares with a minimum size, so words do not break.
 * The grid fits as many cards in a row as the width allows (3 on a phone),
 * and wraps to more rows when there are more cards.
 */
export const CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:gap-3";

/** The small mark at the bottom of every card. */
function CardMark({ dark = false, size = "sm" }: { dark?: boolean; size?: "sm" | "lg" }) {
  const small = size === "sm";
  return (
    <span className={`flex items-center gap-1.5 font-semibold ${small ? "text-[8px] sm:text-[9px]" : "text-xs"} ${dark ? "text-white/80" : "text-[#555]"}`}>
      <span aria-hidden className={`relative inline-block shrink-0 ${small ? "h-3 w-2.5" : "h-5 w-4"}`}>
        <span className="absolute inset-0 -rotate-[8deg] rounded-[2px] border border-[#777] bg-[#171717]" />
        <span className="absolute inset-0 translate-x-[30%] rotate-[6deg] rounded-[2px] border border-[#999] bg-white" />
      </span>
      {/* Small cards on phones show only the logo; the name does not fit. */}
      <span className={`truncate ${small ? "hidden sm:inline" : ""}`}>Cards Against Decency</span>
    </span>
  );
}

/** The deck id is the first part of a card id, for example "cah-base" in "cah-base:b:5". */
export function deckIdOf(cardId: string): string {
  return cardId.split(":")[0];
}

/** The black prompt card. Answers fill the blanks when you preview or reveal them. */
export function BlackCardView({ card, answers, deckName }: { card: Black; answers?: string[]; deckName?: string }) {
  const segments = fillPrompt(card.text, answers);
  const long = card.text.length + (answers?.join(" ").length ?? 0) > 110;
  return (
    // aspect-square is a minimum: a very long prompt makes the card taller, not cut off.
    <div className="flex aspect-square w-full flex-col justify-between rounded-xl bg-card-black p-4 text-white shadow-lg ring-1 ring-[#333] sm:p-5">
      <p className={`hyphens-auto font-bold leading-snug ${long ? "text-base sm:text-lg" : "text-lg sm:text-xl"}`}>
        {segments.map((s, i) =>
          s.answer ? (
            <span key={i} className={answers ? "text-[#fb9a6a]" : "tracking-tighter opacity-80"}>
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
      <div className="mt-3">
        {deckName && (
          <p className="mb-1.5 truncate text-[11px] font-medium text-white/55" title={`This card comes from ${deckName}`}>
            From {deckName}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
        <CardMark dark size="lg" />
        {card.pick > 1 && (
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-card-black">Pick {card.pick}</span>
        )}
        </div>
      </div>
    </div>
  );
}

/** A square white answer card. */
export function WhiteCardView({
  card,
  selected,
  order,
  disabled,
  onClick,
  deckName,
}: {
  card: White;
  selected?: boolean;
  order?: number;
  disabled?: boolean;
  onClick?: () => void;
  /** Shown on hover. White cards are too small to show it all the time. */
  deckName?: string;
}) {
  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      title={deckName ? `From ${deckName}` : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-pressed={selected}
      className={`relative flex aspect-square w-full flex-col justify-between rounded-lg border bg-card-white p-2 text-left text-[13px] font-bold leading-snug text-[#171717] shadow-sm transition sm:p-2.5 sm:text-sm ${
        selected ? "-translate-y-1 border-accent ring-2 ring-accent" : "border-[#d9d3c6]"
      } ${interactive ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""} ${
        disabled && !selected ? "opacity-85" : ""
      }`}
    >
      <span className={`hyphens-auto break-words ${order !== undefined ? "pr-5" : ""}`}>{card.text}</span>
      <CardMark />
      {order !== undefined && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-white">
          {order}
        </span>
      )}
    </button>
  );
}

/** A face-down card: somebody played it, but it is not revealed yet. */
export function CardBack({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={style}
      className="flex aspect-square w-full items-center justify-center rounded-lg border border-[#d9d3c6] bg-card-white shadow-sm"
      aria-label="A played card, face down"
    >
      <span className="text-center text-[10px] font-black uppercase leading-tight tracking-wide text-[#171717] sm:text-xs">
        Cards
        <br />
        Against
        <br />
        Decency
      </span>
    </div>
  );
}

/** An empty place for a card that a player has not played yet. */
export function CardSlot() {
  return <div className="aspect-square w-full rounded-lg border-2 border-dashed border-line" aria-hidden />;
}
