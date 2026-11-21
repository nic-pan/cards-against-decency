import Link from "next/link";
import type { Metadata } from "next";
import { RELEASES, formatReleaseDate } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "What's new · Cards Against Decency",
  description: "New features and changes in Cards Against Decency, the free online party card game.",
  alternates: { canonical: "/whats-new" },
};

export default function WhatsNewPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-black">What&apos;s new</h1>
      <p className="mt-2 text-muted">New features and changes, newest first.</p>

      {RELEASES.map((r) => (
        <section key={r.version} className="mt-8">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-lg font-bold">
            Version {r.version}
            {r.date && (
              <time dateTime={r.date} className="text-sm font-normal text-muted">
                {formatReleaseDate(r.date)}
              </time>
            )}
          </h2>
          <ul className="mt-3 space-y-2">
            {r.items.map((item) => (
              <li key={item.title} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <b>{item.title}.</b> {item.text}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-10 text-sm text-muted">
        Questions about a feature? Read the{" "}
        <Link href="/faq" className="font-semibold underline">
          FAQ
        </Link>
        .
      </p>
    </main>
  );
}
