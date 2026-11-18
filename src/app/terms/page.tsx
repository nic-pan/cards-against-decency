import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Terms of Use · Cards Against Decency" };

// When this text changes in a way that matters, change TERMS_VERSION in src/lib/protocol.ts
// and the date below, so every player accepts the new text.
// Read it again when chat or player-made cards come to the game.

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-black">Terms of Use</h1>
      <p className="mt-2 text-sm text-muted">Last updated 18 November 2026.</p>

      <p className="mt-6">
        Cards Against Decency is a free, non-commercial party card game that you play in your browser. When you tick
        the box and play, you agree to these terms. If you do not agree, do not use the game.
      </p>

      <Section title="1. Who runs the game">
        <p>
          A private person runs this game as a hobby project. It is not a company. Contact:{" "}
          <a className="font-semibold underline" href="mailto:iridescentburst@gmail.com">
            iridescentburst@gmail.com
          </a>
          .
        </p>
      </Section>

      <Section title="2. Age">
        <p>
          The cards contain adult humour about sex, drugs, violence, religion, politics and other sensitive topics. You
          must be 18 or older to play.
        </p>
      </Section>

      <Section title="3. The cards are offensive on purpose">
        <p>
          The game is satire. The cards say things that are rude, crude and in bad taste. They do not show the opinions
          of the people who run the game. If you do not want to see such content, do not play.
        </p>
      </Section>

      <Section title="4. Your username">
        <p>
          You choose your username. Other players and visitors to the public game list can see it. Edgy names are part
          of the game. Names that can hurt real people are not. Do not use a username that:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>contains a real person&apos;s full name, contact details or address, including your own,</li>
          <li>targets a specific person, for example another player,</li>
          <li>threatens violence, or calls for violence against people or groups,</li>
          <li>is clearly illegal, for example anything sexual involving minors,</li>
          <li>pretends to be the game&apos;s staff or one of the bots,</li>
          <li>advertises something or contains a link.</li>
        </ul>
        <p className="mt-2">
          No list can cover everything. We can remove a username, a game or a player that crosses the line, without
          warning.
        </p>
      </Section>

      <Section title="5. How to behave">
        <p>The cards may be offensive. You may not be. Do not:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>harass, threaten or bully other players,</li>
          <li>try to find out who other players are in real life,</li>
          <li>use scripts or automated programs to play, join or create games,</li>
          <li>flood the game with requests, attack it, or try to get around a ban or a wait,</li>
          <li>try to see other players&apos; cards, or who played an answer, before the game shows it.</li>
        </ul>
      </Section>

      <Section title="6. Blocking">
        <p>
          You can block another person from the online list or from the players list. You then do not see each
          other&apos;s games, and you cannot join the same game. The other person is not told. A block covers the
          username and the browser. It is not perfect: a new username in a new browser gets around it. If someone
          harasses you, block them and report them (section 15).
        </p>
      </Section>

      <Section title="7. Hosts">
        <p>The person who creates a game is its host. The host can:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>change the settings and the decks, start and end the game,</li>
          <li>add and remove bots,</li>
          <li>remove a player or a spectator, and ban them from that game,</li>
          <li>import card decks that other people made (see section 8).</li>
        </ul>
        <p className="mt-2">
          When a host removes the same connection from a game 3 times, that connection must wait 5 minutes before it can
          join that game again. A ban lasts until the host lifts it or the game closes. Hosts decide for themselves; we
          do not review their decisions. A host who misuses these tools is breaking section 5.
        </p>
      </Section>

      <Section title="8. Imported decks">
        <p>
          A host can import decks from Many Decks, a separate website. Other people write these decks, and nobody checks
          them. Public games that use them show a &quot;Custom decks&quot; label. The host who imports a deck is
          responsible for choosing it. We are not responsible for the content of imported decks. An imported deck stays
          only in that game and is gone when the game closes.
        </p>
      </Section>

      <Section title="9. Card content and licences">
        <p>
          The base cards come from Cards Against Humanity, under the Creative Commons BY-NC-SA 2.0 licence, through JSON
          Against Humanity. The same licence applies when you share them. Cards Against Decency is not affiliated with,
          endorsed by or sponsored by Cards Against Humanity LLC.
        </p>
        <p className="mt-2">
          The game&apos;s name, logo, bots and other original content belong to the people who run the game. Do not copy
          them to make a similar product.
        </p>
      </Section>

      <Section title="10. No guarantees">
        <p>
          The game is free and comes &quot;as is&quot;. We do not promise that it is always available, that it has no
          errors, or that it keeps your game. Games exist only in the server&apos;s memory: an update or a restart ends
          all games, and scores are not saved. We can change the game, or stop it, at any time.
        </p>
      </Section>

      <Section title="11. Liability">
        <p>
          As far as the law permits, we are not liable for damage that comes from using the game, from other players or
          hosts, or from imported decks. Nothing in these terms limits liability that the law does not let us limit, for
          example for intent or gross negligence, or your rights as a consumer.
        </p>
      </Section>

      <Section title="12. Privacy">
        <p>
          The{" "}
          <Link href="/privacy" className="font-semibold underline">
            Privacy Notice
          </Link>{" "}
          tells you what data the game uses and why.
        </p>
      </Section>

      <Section title="13. Changes to these terms">
        <p>
          We can change these terms. When we do, we change the date at the top, and the game asks you to accept the new
          version before you play again.
        </p>
      </Section>

      <Section title="14. Law">
        <p>
          These terms follow the law of the European Union country where the person who runs the game lives. If you are
          a consumer, you keep the protection of the law of the country where you live.
        </p>
      </Section>

      <Section title="15. Questions and reports">
        <p>
          To report a player, a username or a game, or to ask about these terms, write to{" "}
          <a className="font-semibold underline" href="mailto:iridescentburst@gmail.com">
            iridescentburst@gmail.com
          </a>
          . Tell us the room code and the username if you can.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
