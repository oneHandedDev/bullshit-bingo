/**
 * Session code, identity, and cookie parsing for the lobby feature.
 * The functions in this half of the file are pure — no `document`, no
 * `location` — and are unit tested directly. The browser-coupled edge
 * lives further down and is verified by hand (see the design spec).
 */
import { CELL_COUNT, packMarks, unpackMarks } from './bingo.js';

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const CODE_MAX_LENGTH = 16;
const MINTED_CODE_LENGTH = 4;

/** Lowercases, strips everything but a-z0-9, caps length. Never throws. */
export function normalizeCode(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, CODE_MAX_LENGTH);
}

/**
 * A short code for a new session, e.g. "k7m2". `rng` is injectable for
 * tests, mirroring the convention `shuffle`/`buildCard` use in bingo.js.
 * Four characters (36^4 ≈ 1.68M) is short enough to read aloud; per the
 * design spec, collisions are harmless because the player id is also
 * part of the seed.
 */
export function mintCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < MINTED_CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

/** "<code>.<packed marks>" — the value stored in the bb_marks cookie. */
export function formatMarks(code, marked) {
  return `${code}.${packMarks(marked)}`;
}

/**
 * Reverses formatMarks. If the stored code doesn't match currentCode —
 * or the value is missing or malformed — returns a blank card. This
 * mismatch is what makes starting a new session actually reset marks.
 */
export function parseMarks(value, currentCode) {
  const blank = new Array(CELL_COUNT).fill(false);
  if (typeof value !== 'string') {
    return blank;
  }
  const separatorIndex = value.indexOf('.');
  if (separatorIndex === -1) {
    return blank;
  }
  const code = value.slice(0, separatorIndex);
  if (code !== currentCode) {
    return blank;
  }
  return unpackMarks(value.slice(separatorIndex + 1));
}

/** Finds `name=value` in a raw `document.cookie`-style header string. */
export function readCookie(cookieString, name) {
  if (typeof cookieString !== 'string' || cookieString === '') {
    return null;
  }
  for (const part of cookieString.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    if (key === name) {
      return part.slice(separatorIndex + 1).trim();
    }
  }
  return null;
}
