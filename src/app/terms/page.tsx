import Link from "next/link";

export const metadata = { title: "Terms of Use · Blank Slate" };

// Placeholder. Write the real Terms of Use before a public launch, and then
// change TERMS_VERSION in src/lib/protocol.ts so players accept the new text.
export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-black">Terms of Use</h1>
      <p className="mt-4 rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
        <b>Draft.</b> The full Terms of Use are not written yet. This page will change before the public launch.
        When it changes, we will ask you to accept the new version.
      </p>

      <h2 className="mt-8 text-lg font-bold">Sections to write</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li>Who runs the service, and how to contact them.</li>
        <li>Minimum age. The cards contain adult humour.</li>
        <li>Rules of conduct: names, chat and player-made cards.</li>
        <li>What hosts can do: remove and ban players, and approve cards.</li>
        <li>Card content and licences (CC BY-NC-SA), and no affiliation with Cards Against Humanity LLC.</li>
        <li>No warranty. The service is free and can change or stop.</li>
        <li>Governing law (Bulgaria and the EU).</li>
      </ul>

      <p className="mt-8 text-sm">
        See also the{" "}
        <Link href="/privacy" className="underline">
          Privacy Notice
        </Link>
        .
      </p>
    </main>
  );
}
