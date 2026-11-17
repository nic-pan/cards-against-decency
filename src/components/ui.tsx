import type { ButtonHTMLAttributes, ReactNode } from "react";

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
