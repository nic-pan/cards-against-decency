import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Privacy Notice · Cards Against Decency" };

// DRAFT. Before a public launch, check the text against the code again.
// Log retention: Render keeps service logs for 7 days on the Hobby plan (checked 18 November 2026).
// If the plan changes, or logs go to a Log Stream, update "How long we keep it" and "Who can see your data".

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-black">Privacy Notice</h1>
      <p className="mt-2 text-sm text-muted">Draft. Last updated 18 November 2026.</p>

      <p className="mt-6">
        Cards Against Decency is a free, non-commercial party game. You do not need an account. We collect as little as
        possible, and most of it disappears when your game ends.
      </p>

      <Section title="Who is responsible">
        <p>
          The person who runs this game is responsible for your data under the EU General Data Protection Regulation
          (GDPR). Contact:{" "}
          <a className="font-semibold underline" href="mailto:iridescentburst@gmail.com">
            iridescentburst@gmail.com
          </a>
          .
        </p>
      </Section>

      <Section title="What we collect, and why">
        <Table
          rows={[
            [
              "Your username",
              "You type it. It does not have to be your real name. Other players see it.",
              "To run the game",
            ],
            [
              "A random session token",
              "It keeps your seat when your connection drops or you reload the page.",
              "To run the game",
            ],
            [
              "What you do in the game",
              "The cards you play, your Offences (points), and whether you are the host, a player or a spectator.",
              "To run the game",
            ],
            [
              "Your IP address",
              "See the next section. We never store it in plain text in a log.",
              "To stop abuse",
            ],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Legal basis: running the game you asked to play (GDPR Art. 6(1)(b)), and our legitimate interest in keeping the
          game safe from abuse (Art. 6(1)(f)).
        </p>
      </Section>

      <Section title="How we use your IP address">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Rate limits.</b> The server counts requests from each IP address for a few minutes, so one person cannot
            flood the game. These counts exist only in the server&apos;s memory.
          </li>
          <li>
            <b>Bans and removals in a room.</b> When the host bans someone, or removes the same connection 3 times, the
            server keeps a one-way hash of the IP address. The hash uses a secret key that belongs to that room only. It
            blocks the ban, or a 5-minute wait before rejoining. Everything is deleted when the room closes.
          </li>
          <li>
            <b>Security logs.</b> Events such as wrong room passwords, bans and blocked requests go to the server log.
            The log contains a one-way hash of the IP address with a key that changes every day, never the address itself.
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          People who share a network, for example the same Wi-Fi, usually share an IP address. A ban or a wait can
          then affect all of them in that room.
        </p>
      </Section>

      <Section title="Who can see your data">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Players in your room</b> see your username, your Offences and the cards you play. The Card Czar does not
            see who played an answer until they choose.
          </li>
          <li>
            <b>Everyone who opens the game list</b> sees public games: the host&apos;s username, the usernames of the
            players and spectators, and the settings. Private games do not show in the list.
          </li>
          <li>
            <b>Only the host of a room</b> sees the usernames of people banned from that room.
          </li>
          <li>
            <b>Our hosting providers</b> run the server for us: Render (servers in Frankfurt, Germany) and Cloudflare,
            which carries the traffic to Render. They process your IP address to deliver the website, under their own
            privacy terms.
          </li>
        </ul>
        <p className="mt-3">We do not sell your data, and we do not share it with anyone else.</p>
      </Section>

      <Section title="What your browser stores">
        <p>
          The game saves a few small values in your browser&apos;s local storage. They stay on your device. We do not
          use cookies.
        </p>
        <Table
          rows={[
            ["Your username", "So you do not have to type it again."],
            ["That you accepted the terms", "Which version you accepted."],
            ["Your current game and session token", "So you can return to your seat."],
            ["Sound on or off", "Your sound setting."],
            ["Phone notice seen", "So the phone tip shows only once."],
            ["How often a host removed you from a room", "For the message on the removal screen."],
          ]}
        />
        <p className="mt-3">
          <b>Log out</b> on the game list deletes all of these values from your browser. You can also delete them in your
          browser settings.
        </p>
      </Section>

      <Section title="What we do not collect">
        <p>
          No account, email address, phone number, real name, location, contacts or payment details. No advertising, no
          analytics, no tracking cookies, and no fonts or scripts from other websites. No generative AI processes your
          data.
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Rooms</b> exist only in the server&apos;s memory. The server deletes a room when the last person leaves, or
            after 2 hours without activity. A restart of the server deletes all rooms.
          </li>
          <li>
            <b>Your seat</b> stays for 90 seconds after your connection drops. Then the game removes you.
          </li>
          <li>
            <b>Security logs</b> stay for 7 days. Then our hosting provider deletes them.
          </li>
          <li>
            <b>Your browser&apos;s storage</b> stays until you log out or clear it.
          </li>
        </ul>
      </Section>

      <Section title="Age">
        <p>The game contains adult humour. It is for people aged 18 or older.</p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the GDPR you can ask for a copy of your data, ask us to correct or delete it, and object to how we use
          it. Most data disappears on its own when you leave a room. To use your rights, write to the contact address
          above.
        </p>
        <p className="mt-2">
          You can also complain to a data protection authority, for example the Commission for Personal Data Protection
          in Bulgaria, or the authority in your own country.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When this notice changes, we update the date at the top. When the change matters, the game asks you to accept
          the terms again.
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

function Table({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <tbody>
          {rows.map((cells) => (
            <tr key={cells[0]} className="border-b border-line align-top last:border-0">
              {cells.map((c, i) => (
                <td key={i} className={`px-3 py-2 ${i === 0 ? "font-semibold" : i === 2 ? "text-muted" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
