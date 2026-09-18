/**
 * Session code, identity, and cookie parsing for the lobby feature.
 * The functions in this half of the file are pure — no `document`, no
 * `location` — and are unit tested directly. The browser-coupled edge
 * lives further down and is verified by hand (see the design spec).
 */
import { CELL_COUNT, packMarks, unpackMarks, hashSeed } from './bingo.js';

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

/**
 * The identity used to tag stored marks. `customDeckText` is the
 * canonical (parsed, newline-joined) deck text currently in play, or
 * null/undefined when there is no custom deck. No custom deck means
 * the bare session code — byte-identical to every session link from
 * before custom decks existed.
 */
export function sessionKey(code, customDeckText) {
  if (customDeckText === null || customDeckText === undefined) {
    return code;
  }
  return `${code}#${hashSeed(customDeckText).toString(36)}`;
}

// --- Browser-coupled edge below this line. No automated tests: `document`
// and `location` don't exist under `node --test`. Verified by hand — see
// the manual pass in the design spec and in this plan's final task.

const ID_COOKIE = 'bb_id';
const MARKS_COOKIE = 'bb_marks';
const ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MARKS_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

/**
 * The directory the page itself is served from, e.g. "/bullshit-bingo/"
 * on GitHub Pages or "/" under `python3 -m http.server`. Scoping the
 * cookie path here — rather than a hardcoded "/bullshit-bingo" — keeps
 * it out of the way of every other project on the same github.io
 * origin while still working during local development, where the app
 * isn't served from that path at all.
 */
function basePath() {
  const path = location.pathname.replace(/[^/]*$/, '');
  return path === '' ? '/' : path;
}

function setCookie(name, value, maxAgeSeconds) {
  // `Secure` cookies are refused outright over plain HTTP, which is
  // exactly the protocol of the local dev server — so it's added only
  // when the page is actually served over HTTPS.
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; path=${basePath()}; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** The normalized session code from the current URL, or '' if absent. */
export function currentCode() {
  const params = new URLSearchParams(location.search);
  return normalizeCode(params.get('s'));
}

/** Reads bb_id, minting and persisting one on first visit. */
export function loadIdentity() {
  const existing = readCookie(document.cookie, ID_COOKIE);
  if (existing) {
    return existing;
  }
  const id = randomId();
  setCookie(ID_COOKIE, id, ID_MAX_AGE_SECONDS);
  return id;
}

/** Reads and parses bb_marks for `code`; blank if absent or stale. */
export function loadMarks(code) {
  return parseMarks(readCookie(document.cookie, MARKS_COOKIE), code);
}

/** Persists `marked` for `code` in bb_marks. */
export function saveMarks(code, marked) {
  setCookie(MARKS_COOKIE, formatMarks(code, marked), MARKS_MAX_AGE_SECONDS);
}

/** Writes and reads back a throwaway cookie to detect blocked cookies. */
export function cookiesEnabled() {
  const probeName = '__bb_probe__';
  setCookie(probeName, '1', 60);
  const ok = readCookie(document.cookie, probeName) === '1';
  document.cookie = `${probeName}=; path=${basePath()}; max-age=0`;
  return ok;
}
