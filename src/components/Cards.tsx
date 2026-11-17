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

export function BlackCardView({ card, answers, size = "lg" }: { card: Black; answers?: string[]; size?: "lg" | "sm" }) {
  const segments = fillPrompt(card.text, answers);
  return (
    <div
      className={`relative flex flex-col justify-between rounded-2xl bg-card-black text-white shadow-lg ring-1 ring-line ${
        size === "lg" ? "min-h-48 p-5 sm:min-h-56 sm:p-6" : "min-h-32 p-4"
      }`}
    >
      <p className={`font-bold leading-snug ${size === "lg" ? "text-xl sm:text-2xl" : "text-base"}`}>
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
      <div className="mt-4 flex items-center justify-between text-xs font-semibold opacity-70">
        <span>Cards Against Decency</span>
        {card.pick > 1 && <span className="rounded-full bg-white px-2 py-0.5 text-card-black">Pick {card.pick}</span>}
      </div>
    </div>
  );
}

export function WhiteCardView({
  card,
  selected,
  order,
  disabled,
  onClick,
}: {
  card: White;
  selected?: boolean;
  order?: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-pressed={selected}
      className={`relative flex min-h-28 w-full flex-col rounded-xl border bg-card-white p-3 text-left text-[15px] font-bold leading-snug text-[#171717] shadow-sm transition sm:min-h-36 ${
        selected ? "-translate-y-1 border-accent ring-2 ring-accent" : "border-[#d9d3c6]"
      } ${interactive ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""} ${
        disabled && !selected ? "opacity-60" : ""
      }`}
    >
      {card.text}
      {order !== undefined && (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-white">
          {order}
        </span>
      )}
    </button>
  );
}
