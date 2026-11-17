import Link from "next/link";

export const metadata = { title: "Privacy · Cards Against Decency" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-black">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Draft for the first version. Last updated 16 November 2026.</p>

      <h2 className="mt-8 text-lg font-bold">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>The display name that you type. You choose it, and it does not have to be your real name.</li>
        <li>A random session token. It keeps your seat if your connection drops or you reload the page.</li>
        <li>Your game actions in the current room, such as the cards you play and your Offences (your score).</li>
        <li>
          Your IP address, for a short time, to stop abuse. We do not store it in plain text. Security logs contain a
          one-way hash with a key that changes every day.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-bold">What we do not collect</h2>
      <p className="mt-2">
        No account, email, phone number, location, advertising identifiers, or tracking cookies. There are no
        advertisements and no analytics services.
      </p>

      <h2 className="mt-8 text-lg font-bold">How long we keep it</h2>
      <p className="mt-2">
        Rooms and everything in them exist only in the server&apos;s memory. The server deletes a room when the last
        player leaves, or after two hours with no activity. Your browser keeps your name and the session token in local
        storage. You can clear them in your browser settings.
      </p>

      <h2 className="mt-8 text-lg font-bold">Who can see it</h2>
      <p className="mt-2">
        Other players in your room see your name, your Offences (your score) and the cards you play. The Card Czar does not see who
        played which answer until they choose. Only the people who run this service can read the security logs.
      </p>

      <h2 className="mt-8 text-lg font-bold">Your rights</h2>
      <p className="mt-2">
        Under the GDPR you can ask what data we hold about you and ask us to delete it. Because rooms are temporary,
        leaving the room removes your data from the game. [Contact address: to be added before launch.]
      </p>
    </main>
  );
}
