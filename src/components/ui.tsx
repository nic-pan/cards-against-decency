"use client";

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110",
  secondary: "bg-ink text-paper hover:opacity-90",
  ghost: "border border-line bg-transparent hover:bg-surface",
  danger: "border border-accent text-accent hover:bg-accent-soft",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "ok" }) {
  const tones = {
    neutral: "border-line text-muted",
    accent: "border-accent text-accent",
    ok: "border-ok text-ok",
  };
  return (
    <span className={`rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** On/off switch with a label and an optional hint. A disabled parent fieldset also disables it. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? "border-accent bg-accent" : "border-line bg-paper"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

/**
 * A "?" icon that explains a setting. The text shows on hover and on keyboard focus.
 * On touch screens, a tap opens and closes it.
 */
export function InfoTip({ text, label }: { text: React.ReactNode; label: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted text-[10px] font-bold leading-none text-muted hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
      >
        ?
      </button>
      <span
        role="tooltip"
        id={id}
        className={`absolute bottom-full left-0 z-30 mb-2 w-64 max-w-[75vw] rounded-lg bg-ink px-3 py-2 text-xs font-normal leading-snug text-paper shadow-lg ${
          open ? "block" : "hidden"
        } group-hover:block group-focus-within:block`}
      >
        {text}
      </span>
    </span>
  );
}
