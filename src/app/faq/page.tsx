import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ · Cards Against Decency",
  description:
    "Questions about Cards Against Decency, the free online party card game: age, players, bots, phones, private games, custom decks and more.",
  alternates: { canonical: "/faq" },
};

// Keep the answers true to the game. When a rule changes in the code, change it here too.
// Search engines read FAQS as structured data (FAQPage), so the answers are plain text.

interface Faq {
  q: string;
  a: string[];
}

interface Group {
  title: string;
  items: Faq[];
}

const GROUPS: Group[] = [
  {
    title: "The basics",
    items: [
      {
        q: "What is Cards Against Decency?",
        a: [
          "A free party card game that you play in your browser with friends. Each round, one player is the Card Czar and reads a black card with a blank. Everyone else plays their funniest white card. The Card Czar chooses the best answer, and its player gets an Offence. Offences are the points in this game.",
        ],
      },
      {
        q: "Is it suitable for kids?",
        a: [
          "No. The cards contain adult humour about sex, drugs, violence, religion, politics and other sensitive topics. The game is for people aged 18 or older.",
          "We do not check ages. If you play with others, make sure everyone at the table is an adult and knows what kind of game this is.",
        ],
      },
      {
        q: "Is it free?",
        a: ["Yes. There are no payments, no ads and no premium features."],
      },
      {
        q: "Do I need an account or an app?",
        a: [
          "No. Choose a username, accept the terms, and play in your browser. There is nothing to download and no account to create.",
        ],
      },
      {
        q: "Can I play on my phone?",
        a: [
          "Yes. The game works in a phone browser. Keep the game page open while you play: your phone may not remind you when it is your turn, and the game removes players who miss 2 rounds in a row. The game keeps your screen awake while you play.",
        ],
      },
      {
        q: "Is this Pretend You're Xyzzy?",
        a: [
          "No, but it is inspired by it. Pretend You're Xyzzy was a popular online version of this kind of game. Cards Against Decency is a new game, built from scratch, for people who miss it.",
        ],
      },
      {
        q: "Is it affiliated with Cards Against Humanity?",
        a: [
          "No. Cards Against Decency is a free, non-commercial fan project. It is not affiliated with, endorsed by or sponsored by Cards Against Humanity LLC. \"Cards Against Humanity\" is a trademark of Cards Against Humanity LLC.",
        ],
      },
    ],
  },
  {
    title: "Playing a game",
    items: [
      {
        q: "How many people can play?",
        a: [
          "A game needs at least 3 players: one Card Czar and two players who play cards. The host can allow up to 20 players. The default is 10. Up to 20 more people can watch as spectators.",
        ],
      },
      {
        q: "I only have one or two friends. Can we still play?",
        a: [
          "Yes. The host can add up to 6 bots. The bots are agents of the CAD intelligence division: the FBI, CIA, MI6 and others. They play random cards from the deck. They never act as the Card Czar, so a human always chooses the winner.",
        ],
      },
      {
        q: "How do I invite my friends?",
        a: [
          "Create a game, then use \"Copy invite link\" in the room and send the link to your friends. They can also find a public game on the game list, or join with the room code.",
        ],
      },
      {
        q: "Can I make a private game?",
        a: [
          "Yes. Turn off the public setting, and the game does not show on the game list. Only people with the invite link or the room code can find it. You can also set a room password when you create the game.",
        ],
      },
      {
        q: "How do you win?",
        a: [
          "The first player to reach the goal wins. The default goal is 8 Offences, and the host can set it from 1 to 50. When the host ends the game early, the player with the most Offences wins. When two or more players share the top score, the game is a draw.",
        ],
      },
      {
        q: "Does the Card Czar know who played which card?",
        a: [
          "No. The answers are shown without names. The game shows who played the winning card only after the Card Czar chooses.",
        ],
      },
      {
        q: "How long do I have to play a card?",
        a: [
          "By default, 75 seconds to play a card and 75 seconds for the Card Czar to choose. The host can set each time from 20 seconds to 5 minutes.",
        ],
      },
      {
        q: "What happens if the Card Czar leaves or does not choose?",
        a: [
          "The other players and the spectators vote for the best answer. The vote takes up to 30 seconds and ends early when everybody has voted. You cannot vote for your own answer. The answer with the most votes wins the Offence. If two answers have the same number of votes, the game chooses one at random.",
          "Each network gets one vote, so a second seat or a spectator tab does not give you more votes. The votes are anonymous: the room sees only the number of votes for each answer. If nobody votes, nobody gets an Offence, and the cards go back to the players' hands.",
          "The host can turn the vote off in the room settings. Then the round is cancelled.",
        ],
      },
      {
        q: "Can I see the last round again?",
        a: [
          "Yes. Select \"Last round\" at the top of the game. A window shows the last black card, every answer, the winner, and who played each answer. The current round continues behind the window.",
        ],
      },
      {
        q: "Can I change the card I played?",
        a: [
          "Yes, once in each round. Select \"Take back my card\" before the Card Czar starts to judge. The card goes back to your hand, and you can play a different card.",
          "When everyone has played, judging starts after 3 seconds. You can still take back your card in those seconds. The round timer does not restart. If you do not play again in time, you miss the round.",
        ],
      },
      {
        q: "Can I join a game that has already started?",
        a: [
          "Yes, if the host allows late joining. You get a hand of cards and play from the next round. You can also watch as a spectator and start to play later.",
        ],
      },
      {
        q: "What happens if I stop playing?",
        a: [
          "When you miss a round, you get a warning. When you miss 2 rounds in a row, the game removes you, so the others do not have to wait. If you need a break, use Leave.",
        ],
      },
      {
        q: "What happens if my connection drops?",
        a: [
          "Your seat stays for 90 seconds. Open the game again in the same browser within that time, and you are back in your seat with your cards and your Offences.",
        ],
      },
      {
        q: "What happens if the host leaves?",
        a: [
          "The human player who joined the game earliest becomes the new host. The game goes on.",
        ],
      },
    ],
  },
  {
    title: "Cards and decks",
    items: [
      {
        q: "Where do the cards come from?",
        a: [
          "The base deck has 278 black cards and 1,269 white cards from the Cards Against Humanity base game. Cards Against Humanity publishes them under the Creative Commons BY-NC-SA 2.0 licence. We use the collection from JSON Against Humanity.",
        ],
      },
      {
        q: "Can we use our own cards?",
        a: [
          "Yes. The host can import decks from Many Decks, a separate website where people make and share card decks. Make a deck there, then enter its 5-character code in the game. A game can have up to 10 imported decks. Public games with imported decks show a \"Custom decks\" label, because nobody checks what other people write.",
        ],
      },
      {
        q: "Can the host add a deck during a game?",
        a: ["No. The host chooses the decks in the lobby, before the game starts."],
      },
    ],
  },
  {
    title: "Safety and privacy",
    items: [
      {
        q: "Someone in my game is being awful. What can I do?",
        a: [
          "The host can remove a player, or remove and ban them from that game. Any player can block another person. You then do not see each other's games, and you cannot join the same game. The other person is not told.",
          "Players can also vote to remove someone, the host included. Open the ⋯ menu next to the name and choose Vote to remove. The game counts one vote for each network, so friends on the same Wi-Fi share one vote, and a vote needs players from at least 3 networks. The vote passes when more than half of the networks say yes.",
          "To report a player, a username or a game, write to iridescentburst@gmail.com. Tell us the room code and the username if you can.",
        ],
      },
      {
        q: "What data do you keep about me?",
        a: [
          "Very little. You do not need an account, an email address or your real name. Games exist only in the server's memory and disappear when they end. There are no ads, no analytics and no tracking cookies. The Privacy Notice has the details.",
        ],
      },
      {
        q: "Why did my game disappear?",
        a: [
          "Games exist only in the server's memory. An update or a restart of the server ends all games, and a game closes after 2 hours without activity. A room that waits 30 minutes without a game also closes, unless someone in it chooses Keep the room open. Scores are not saved.",
        ],
      },
    ],
  },
];

/** FAQPage structured data, so search engines can show the answers. */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: GROUPS.flatMap((g) =>
      g.items.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a.join(" ") },
      })),
    ),
  };
}

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <script
        type="application/ld+json"
        // The data is our own constant text, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }}
      />
      <Link href="/" className="text-sm text-muted underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-black">Frequently asked questions</h1>
      <p className="mt-2 text-muted">Everything you wanted to know, and a few things you didn&apos;t.</p>

      {GROUPS.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{g.title}</h2>
          <div className="space-y-2">
            {g.items.map((f) => (
              <details key={f.q} className="group rounded-xl border border-line bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  <h3>{f.q}</h3>
                  <span aria-hidden className="text-muted transition group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="space-y-2 border-t border-line px-4 pb-4 pt-3 text-sm">
                  {f.a.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 text-sm text-muted">
        More questions? Read the{" "}
        <Link href="/terms" className="font-semibold underline">
          Terms of Use
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="font-semibold underline">
          Privacy Notice
        </Link>
        , or write to{" "}
        <a className="font-semibold underline" href="mailto:iridescentburst@gmail.com">
          iridescentburst@gmail.com
        </a>
        .
      </p>
    </main>
  );
}
