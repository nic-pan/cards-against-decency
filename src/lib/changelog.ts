// The "What's new" page and the note on the home page read this file.
// Write only changes that players notice. The newest release comes first.
// Set the date on the day of the release (YYYY-MM-DD). A release without a date shows no date.

export interface ChangeItem {
  title: string;
  text: string;
}

export interface Release {
  version: number;
  date: string | null;
  /** One line for the note on the home page. */
  summary: string;
  items: ChangeItem[];
}

export const RELEASES: Release[] = [
  {
    version: 2,
    date: null,
    summary: "Take back a card, see the last round, vote for the winner when the Card Czar is gone, and more.",
    items: [
      {
        title: "Vote to remove a player",
        text: "Players can vote to remove someone who spoils the game. Each network gets one vote, so one person with several seats cannot win the vote alone.",
      },
      {
        title: "Take back a card",
        text: "Played the wrong card? Take it back once in each round, before the Card Czar starts to judge.",
      },
      {
        title: "See the last round",
        text: "Missed the result? Select \"Last round\" to see the last black card, every answer, and who played it.",
      },
      {
        title: "The audience saves the round",
        text: "When the Card Czar leaves or does not choose in time, the round is not lost. The other players and the spectators vote for the best answer.",
      },
      {
        title: "Switch between playing and watching",
        text: "Players can watch instead, and spectators can join, with one button. During a game, the switch happens when the round ends. A host who watches stays the host.",
      },
      {
        title: "Easier Pick 2 and Pick 3",
        text: "Each answer shows as one card with the full sentence: the black card with the answers filled in. While players choose, each answer is one stack of cards, not 2 or 3 separate cards.",
      },
      {
        title: "Empty rooms close",
        text: "A room closes after 30 minutes without a game. Before it closes, everyone gets a warning and can keep the room open.",
      },
    ],
  },
  {
    version: 1,
    date: "2026-11-19",
    summary: "The first public release.",
    items: [{ title: "The first public release", text: "Cards Against Decency is live. Thank you for playing." }],
  },
];

export const CURRENT_RELEASE = RELEASES[0];

/** "19 November 2026". */
export function formatReleaseDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
