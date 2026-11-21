import { DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, pattern } from "obscenity";

// Usernames show in the public game list and in "Online now", so strangers see them.
// This filter blocks names that can hurt people. It does not block crude humour:
// swear words and sex jokes are part of the game.
//
// Blocked: slurs and hate symbols, sexual content involving minors, links and contact
// details, and names that pretend to be the game's staff.
//
// To add a word: add it to the right list below and add a test in nameFilter.test.ts.
// The player only sees "Choose a different name". The message never says which word matched.

type Meta = { originalWord: string };

/** Words from the library's English list that we keep. Plain swear words and sex words are left out on purpose. */
const ENGLISH_KEEP = new Set([
  "abeed",
  "abo",
  "africoon",
  "arabush",
  "boonga",
  "chingchong",
  "chink",
  "dyke",
  "fag",
  "kike",
  "negro",
  "nigger",
  "rape",
  "retard",
  "spastic",
  "tranny",
]);

/**
 * Our own Latin-alphabet words: hate symbols, minors, impersonation, and slurs in other languages.
 * "|word|" matches only the whole word. The library also catches tricks like "h1tl3r".
 * Accents are removed before the check, so "maricón" matches "maricon".
 *
 * The library collapses repeated letters before the check, except b, e, o, l, s and g.
 * So write "oficial", not "official", and "suport", not "support".
 */
const CUSTOM: { word: string; patterns: ReturnType<typeof pattern>[]; allow?: string[] }[] = [
  // Hate symbols and hate groups.
  { word: "hitler", patterns: [pattern`hitler`] },
  { word: "heil", patterns: [pattern`|heil|`, pattern`siegheil`] },
  { word: "white power", patterns: [pattern`whitepower`] },
  { word: "auschwitz", patterns: [pattern`auschwitz`] },
  { word: "holocaust", patterns: [pattern`holocaust`] },
  // Sexual content involving minors.
  { word: "pedo", patterns: [pattern`pedo`, pattern`paedo`], allow: ["torpedo", "pedometer"] },
  { word: "loli", patterns: [pattern`|loli|`, pattern`|lolis|`, pattern`lolita`, pattern`lolicon`] },
  { word: "jailbait", patterns: [pattern`jailbait`] },
  { word: "underage", patterns: [pattern`underage`] },
  { word: "preteen", patterns: [pattern`preteen`] },
  { word: "childporn", patterns: [pattern`childporn`, pattern`kidieporn`, pattern`kidyporn`] },
  // Impersonation of the game's staff.
  { word: "admin", patterns: [pattern`admin`], allow: ["badminton"] },
  { word: "moderator", patterns: [pattern`moderator`, pattern`|mod|`, pattern`|mods|`] },
  { word: "staff", patterns: [pattern`|staf|`] },
  { word: "official", patterns: [pattern`|oficial|`] },
  { word: "support", patterns: [pattern`|suport|`] },
  { word: "cards against decency", patterns: [pattern`cardsagainstdecency`] },
  // Slurs in other languages.
  { word: "maricon", patterns: [pattern`maricon`, pattern`|marica|`] }, // Spanish
  { word: "sudaca", patterns: [pattern`sudaca`] }, // Spanish
  { word: "negrata", patterns: [pattern`negrata`] }, // Spanish
  { word: "pede", patterns: [pattern`|pede|`] }, // French
  { word: "bougnoule", patterns: [pattern`bougnoul`] }, // French
  { word: "youpin", patterns: [pattern`youpin`] }, // French
  { word: "negre", patterns: [pattern`|negre|`, pattern`|negres|`] }, // French
  { word: "bicot", patterns: [pattern`|bicot|`] }, // French
  { word: "neger", patterns: [pattern`neger`] }, // German, Dutch
  { word: "kanake", patterns: [pattern`kanake`, pattern`kanacke`] }, // German
  { word: "schwuchtel", patterns: [pattern`schwuchtel`] }, // German
  { word: "zigeuner", patterns: [pattern`zigeuner`] }, // German
  { word: "judensau", patterns: [pattern`judensau`] }, // German
  { word: "frocio", patterns: [pattern`frocio`, pattern`|froci|`] }, // Italian
  { word: "ricchione", patterns: [pattern`richion`] }, // Italian
  { word: "viado", patterns: [pattern`|viado|`] }, // Portuguese
  { word: "ciapaty", patterns: [pattern`ciapat`] }, // Polish
  { word: "pidor", patterns: [pattern`pidor`, pattern`pidar`, pattern`pederast`] }, // Russian, Bulgarian (Latin letters)
];

const dataset = new DataSet<Meta>()
  .addAll(englishDataset as DataSet<Meta>)
  .removePhrasesIf((p) => !ENGLISH_KEEP.has(p.metadata?.originalWord ?? ""));
for (const entry of CUSTOM) {
  dataset.addPhrase((phrase) => {
    phrase.setMetadata({ originalWord: entry.word });
    for (const p of entry.patterns) phrase.addPattern(p);
    for (const w of entry.allow ?? []) phrase.addWhitelistedTerm(w);
    return phrase;
  });
}
const built = dataset.build();
const latin = new RegExpMatcher({ ...built, ...englishRecommendedTransformers });

/**
 * Words that also count when the name has spaces or dots inside them: "White Power", "n.i.g.g.e.r".
 * Only long words that are not parts of normal phrases. "Sir Ape" without the space contains "rape",
 * so "rape" is not in this list.
 */
const JOINED_OK = new Set([
  "nigger", "chingchong", "africoon", "arabush", "retard", "spastic", "tranny",
  "hitler", "heil", "white power", "auschwitz", "holocaust",
  "loli", "jailbait", "underage", "preteen", "childporn",
  "moderator", "official", "cards against decency",
  "maricon", "sudaca", "negrata", "bougnoule", "youpin", "kanake", "schwuchtel", "zigeuner", "judensau",
  "frocio", "ricchione", "ciapaty",
]);

function latinHit(clean: string): boolean {
  if (latin.hasMatch(clean)) return true;
  const joined = clean.replace(/[^\p{L}\p{N}]+/gu, "");
  if (joined === clean) return false;
  return latin
    .getAllMatches(joined)
    .some((m) => JOINED_OK.has(dataset.getPayloadWithPhraseMetadata(m).phraseMetadata?.originalWord ?? ""));
}

// ---------------------------------------------------------------------------
// Cyrillic (Russian, Bulgarian). The library's transformers turn Cyrillic letters into
// Latin ones, so Cyrillic words get their own simple check.

/** Found anywhere in the name, after the clean-up below. */
const CYRILLIC_ANYWHERE = ["пидор", "пидар", "педераст", "ниггер", "хитлер", "гитлер"];
/** Only a whole word: shorter words that are also parts of normal words ("нигер" is in "Нигерия"). */
const CYRILLIC_WORDS = new Set(["жид", "жиди", "жидов", "чурка", "чурки", "педал", "педали", "негър", "негри", "негр", "нигер"]);

/** Latin letters and digits that look like Cyrillic letters, as people use them to hide a word. */
const TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "в", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у",
  "0": "о", "3": "з", "4": "ч", "6": "б",
};

function cyrillicHit(clean: string): boolean {
  if (!/[Ѐ-ӿ]/.test(clean)) return false;
  const mapped = [...clean].map((ch) => TO_CYRILLIC[ch] ?? ch).join("");
  const words = mapped.split(/[^Ѐ-ӿ]+/).filter(Boolean);
  if (words.some((w) => CYRILLIC_WORDS.has(w) || CYRILLIC_WORDS.has(collapse(w)))) return true;
  // Join the words: "п.и.д.о.р" becomes "пидор". Repeated letters count only for words that have none:
  // "пиидоор" becomes "пидор", but "ниггер" must not turn into "нигер", which is part of "Нигерия".
  const joined = words.join("");
  return CYRILLIC_ANYWHERE.some((w) => joined.includes(w) || (collapse(w) === w && collapse(joined).includes(w)));
}

function collapse(word: string): string {
  return word.replace(/(.)\1+/g, "$1");
}

// ---------------------------------------------------------------------------
// Links and contact details.

const DOMAIN_ENDINGS = "com|net|org|gg|io|me|tv|ru|bg|xyz|co|ly|link|app|info|biz|site|online|shop|live|uk|de|fr|eu|us";
const LINK = new RegExp(
  [
    String.raw`https?:`,
    String.raw`www\.`,
    String.raw`[a-z0-9]\s*(\.|\(dot\)|\[dot\]|\sdot\s)\s*(${DOMAIN_ENDINGS})(\b|$)`,
    String.raw`(^|\s)@[a-z0-9_]`,
    String.raw`\S@\S+\.\S`,
    String.raw`onlyfans`,
  ].join("|"),
);

function contactHit(clean: string): boolean {
  if (LINK.test(clean)) return true;
  // A phone number: 7 or more digits in the name.
  return (clean.match(/\d/g)?.length ?? 0) >= 7;
}

/** "14/88" and "1488" (neo-Nazi codes), and "KKK" with or without dots. */
const HATE_CODES = /14\W*88|(^|[^a-z])k\W*k\W*k([^a-z]|$)/;

/** Lower case, without accents. "Maricón" becomes "maricon". Cyrillic letters stay. */
function simplify(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** True when the name must not be used. */
export function isBlockedName(name: string): boolean {
  const clean = simplify(name);
  if (HATE_CODES.test(clean) || contactHit(clean)) return true;
  if (cyrillicHit(clean)) return true;
  return latinHit(clean);
}
