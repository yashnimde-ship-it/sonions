// Player names: trimmed, no control characters, and nothing offensive (the judges and other
// players see every name in the lobby). Shared by the game and the server; the server's word
// is final. A blocked name becomes "Bandit" plus a number.

export const NAME_MAX = 14;

// Matched anywhere in the name once it's lower-cased, de-spaced and de-leeted ("n1 gg@" too).
// Only roots that don't turn up inside real names (so no "shit": Kshitij; no "nazi": Nazia).
const ANYWHERE = ['nigg', 'nigr', 'fagg', 'fagot', 'kike', 'chink', 'wetback', 'tranny', 'retard', 'cunt', 'fuck', 'phuck', 'motherf', 'bitch', 'whore', 'slut', 'pussy', 'penis', 'vagina', 'rapist', 'hitler', 'kkk', 'porn', 'dildo', 'jizz', 'wank', 'twat', 'bastard', 'madarc', 'bhenc', 'bhosd', 'gaand'];
// Matched as whole words only, so "grape", "Dickens" and "Essex" are fine.
const WORDS = ['fag', 'fuk', 'dick', 'rape', 'raping', 'sex', 'cum', 'tits', 'ass', 'arse', 'spic', 'coon', 'gook', 'paki', 'dyke', 'homo', 'nig', 'niga', 'kys', 'shit', 'shitty', 'cock', 'nazi', 'chut', 'chutiya', 'lund', 'randi'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '6': 'g' };

/** A blocked word as a pattern where each letter may repeat: "fuck" also catches "fuuuck". */
const pattern = (word: string) => word.replace(/(.)\1*/g, (run, ch: string) => (run.length > 1 ? `${ch}{${run.length},}` : `${ch}+`));
const ANYWHERE_RE = new RegExp(ANYWHERE.map(pattern).join('|'));
const WORDS_RE = new RegExp(`^(?:${WORDS.map(pattern).join('|')})$`);

/** Is this name offensive? */
export function isBlockedName(name: string) {
  const s = name.toLowerCase().replace(/[0-9!|@$+]/g, (c) => LEET[c] ?? c);
  if (ANYWHERE_RE.test(s.replace(/[^a-z]/g, ''))) return true;
  return s.split(/[^a-z]+/).some((w) => w && WORDS_RE.test(w));
}

/** A name safe to show: trimmed to NAME_MAX, printable, not offensive. */
export function cleanName(raw: unknown, fallback: string) {
  const name = String(raw ?? '')
    // No control or invisible formatting characters (zero-width, bidi overrides).
    .split('')
    .filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 && !(c >= 0x7f && c <= 0x9f) && !(c >= 0x200b && c <= 0x200f) && !(c >= 0x2028 && c <= 0x202e) && !(c >= 0x2066 && c <= 0x2069); })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  if (!name || isBlockedName(name)) return fallback;
  return name;
}
