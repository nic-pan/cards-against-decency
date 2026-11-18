// The bots: agents of the CAD intelligence division.
// The engine gives each new bot a free name from this list. The page shows
// the full title and the tagline next to the name.

export type BotProfile = {
  /** The bot's name in the game. */
  name: string;
  /** What the letters stand for. */
  title: string;
  tagline: string;
  /** The activity log line when the bot joins a room. */
  arrival: string;
};

export const BOT_DIVISION = "The CAD intelligence division";

export const BOT_PROFILES: readonly BotProfile[] = [
  { name: "FBI", title: "Federal Bureau of Indecency", tagline: "The obvious one.", arrival: "The FBI has entered the room. Nobody panic. Yet." },
  { name: "CIA", title: "Card Intelligence Agency", tagline: "Knows exactly which card to submit. Allegedly.", arrival: "The CIA is now monitoring this room. Your cards have been noted." },
  { name: "MI6", title: "Misconduct Intelligence, Section 6", tagline: "Internationally questionable.", arrival: "MI6 has arrived. This operation is already questionable." },
  { name: "NSA", title: "National Shame Agency", tagline: "Has been monitoring your submissions.", arrival: "The NSA has joined the room. Nothing you submit is beyond scrutiny." },
  { name: "KGB", title: "Keep Getting Banned", tagline: "A questionable history.", arrival: "The KGB has entered the room. This may not end well." },
  { name: "D.O.J.", title: "Department of Jokes", tagline: "No comment at this time.", arrival: "The Department of Jokes is now in session. Standards are expected to be low." },
  { name: "I.R.S.", title: "Institute of Rude Submissions", tagline: "Your offences have been recorded.", arrival: "The I.R.S. has arrived. Your questionable contributions may be subject to review." },
  { name: "S.W.A.T.", title: "Special Weapons And Tactics", tagline: "Here to deal with an especially bad answer.", arrival: "S.W.A.T. has entered the room. Please remain seated. Especially you." },
];

/** "S.W.A.T.", "swat" and "S W A T" are the same name. */
function key(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const PROFILE_KEYS = new Map(BOT_PROFILES.map((p) => [key(p.name), p]));

/** The profile of a bot name, or undefined for other names. */
export function botProfile(name: string): BotProfile | undefined {
  return PROFILE_KEYS.get(key(name));
}

/** True for a bot name ("FBI", "s.w.a.t.") or a fallback name ("Bot 3"). People cannot use them. */
export function isBotName(name: string): boolean {
  return PROFILE_KEYS.has(key(name)) || /^bot\s*\d*$/i.test(name.trim());
}
