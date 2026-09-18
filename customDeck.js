/**
 * Parsing and validating a player-supplied phrase list. Pure, no DOM —
 * the start screen's textarea and the game screen's ?d= handling both
 * go through this module. deck.js stays data-only, per ADR 0001
 * decision 3, so deck-authoring logic lives here instead.
 */
import { CELL_COUNT, MAX_PHRASE_LENGTH } from './bingo.js';
import { DECK } from './deck.js';

const DECK_SIZE_WARNING_THRESHOLD = 150;

/**
 * Splits `text` into phrases (one per line), trims, drops blanks,
 * dedupes exact repeats, and excludes anything over MAX_PHRASE_LENGTH.
 * `phrases` holds only what survives all of that — an over-length
 * phrase never counts toward the minimum-count check below.
 */
export function parseDeckText(text) {
  const errors = [];
  const seen = new Set();
  const phrases = [];

  const lines = typeof text === 'string' ? text.split('\n') : [];
  for (const rawLine of lines) {
    const phrase = rawLine.trim();
    if (phrase === '') {
      continue;
    }
    if (phrase.length > MAX_PHRASE_LENGTH) {
      errors.push(`"${phrase}" is ${phrase.length} characters (max ${MAX_PHRASE_LENGTH})`);
      continue;
    }
    if (seen.has(phrase)) {
      continue;
    }
    seen.add(phrase);
    phrases.push(phrase);
  }

  if (phrases.length < CELL_COUNT) {
    const short = CELL_COUNT - phrases.length;
    errors.push(`need ${short} more phrase${short === 1 ? '' : 's'} (${CELL_COUNT} minimum, got ${phrases.length})`);
  }

  return { phrases, errors };
}

/** Non-blocking: a long deck makes a long invite link. Null if it's fine. */
export function deckWarning(phrases) {
  if (phrases.length > DECK_SIZE_WARNING_THRESHOLD) {
    return `This word list has ${phrases.length} phrases — the invite link will be long, and some chat apps may mangle very long links.`;
  }
  return null;
}

/**
 * True when `phrases` is the same set as `deck` (order doesn't matter —
 * buildCard shuffles regardless). Used to decide whether a session
 * needs a ?d= parameter at all.
 */
export function isDefaultDeck(phrases, deck = DECK) {
  const phraseSet = new Set(phrases);
  const deckSet = new Set(deck);
  if (phraseSet.size !== deckSet.size) {
    return false;
  }
  for (const phrase of phraseSet) {
    if (!deckSet.has(phrase)) {
      return false;
    }
  }
  return true;
}
