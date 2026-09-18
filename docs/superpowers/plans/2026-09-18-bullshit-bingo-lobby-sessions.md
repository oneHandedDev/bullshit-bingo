# Bullshit Bingo Lobby Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the solo-card page into a lobby game — players join a session via a URL code, each derives their own locked card, and the card plus marks survive a reload until someone starts a new session.

**Architecture:** Two pure additions to `bingo.js` (a seeded hash and a marks bitmask codec) plus a new `session.js` module (pure code/cookie parsing + a thin browser-coupled edge) let `index.html` derive a player's card from `hash(sessionCode + playerId)` on every load instead of drawing a fresh random one. No server, no new dependency.

**Tech Stack:** Vanilla JS (ES modules), `node --test`, cookies via `document.cookie`. No frameworks, no bundler, no dependencies — unchanged from the existing app.

**Spec:** [docs/superpowers/specs/2026-09-18-bullshit-bingo-lobby-design.md](../specs/2026-09-18-bullshit-bingo-lobby-design.md)

## Global Constraints

- No dependencies, no build step, no bundler, no framework (ADR 0001 decisions 2–4, unchanged).
- No backend, no real-time service, no accounts, no player-typed identity (spec: "No backend", "Invisible lobby", identity is an anonymous per-browser id).
- No `localStorage` anywhere; storage is cookies only (spec: "Storage is cookies, not localStorage").
- `bb_id` cookie: `max-age` 30 days. `bb_marks` cookie: `max-age` 8 hours. Both `SameSite=Lax` (spec Storage table).
- Session code: `normalizeCode` lowercases, strips non-alphanumerics, caps at 16 characters. `mintCode` produces exactly 4 lowercase-alphanumeric characters (spec `session.js` section).
- Marks bitmask: base36, at most 5 characters (`2**25 - 1` is `jz6rj`), bit `i` = cell `i`, least-significant first (spec `packMarks`/`unpackMarks`).
- `session.js` must not touch `document` or `location` at module top level — only inside function bodies — or `node --test` fails to import it (spec Architecture).
- Tests use `node --test` / `node:assert/strict` only, no test framework dependency (ADR 0001 decision 4).
- A refresh must reproduce a bit-identical card and the same marks from the same URL and cookies — this is the feature's one hard correctness requirement (spec Data Flow).

## Implementation Note (deviates from spec text, not from spec intent)

Two details below refine the spec's literal wording to keep the app testable with the existing `npm run serve` local workflow. Both preserve the spec's stated rationale exactly; neither changes any interface.

1. **Cookie path is computed from `location.pathname`, not hardcoded `/bullshit-bingo`.** The spec's goal is "narrower than the shared `github.io` origin." A hardcoded literal only achieves that on GitHub Pages; it silently breaks `python3 -m http.server` (which serves the repo at `/`, where the cookie would never be sent back). Deriving the path from the page's own directory achieves the same scoping goal on both hosts.
2. **`Secure` is added to the cookie only when `location.protocol === 'https:'`.** A `Secure` cookie is refused by the browser entirely over plain HTTP, which is exactly the local dev server's protocol. Adding it unconditionally would make every cookie silently fail to persist during local manual verification.

Task 6 below implements both. This will be called out again when ADR 0002 is written (Task 8), so the record reflects what shipped.

---

### Task 1: Promote `seededRng` from the test file into `bingo.js`

**Files:**
- Modify: `bingo.js` (add after line 4, before `buildLines`)
- Modify: `bingo.test.js:4` (import), `bingo.test.js:56-67` (delete local definition)

**Interfaces:**
- Produces: `seededRng(seed: number): () => number` — a `() => number` in `[0, 1)`, exported from `bingo.js`. Later tasks and `index.html` import this.

- [ ] **Step 1: Run the existing suite to confirm the baseline is green**

Run: `npm test`
Expected: `# pass 27`, `# fail 0`

- [ ] **Step 2: Add `seededRng` to `bingo.js`**

Insert immediately after the `TITLE` export (after line 4):

```js
/**
 * Deterministic linear congruential generator, so shuffles — and, later,
 * session cards — are reproducible from a seed. Same numeric constants as
 * Numerical Recipes; quality is irrelevant here, repeatability is the point.
 */
export function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
```

- [ ] **Step 3: Point the test file at the shipped version**

In `bingo.test.js:4`, change:

```js
import { CARD_SIZE, CELL_COUNT, LINES, TITLE, lineName, shuffle, buildCard, findWins, formatShare } from './bingo.js';
```

to:

```js
import { CARD_SIZE, CELL_COUNT, LINES, TITLE, lineName, shuffle, buildCard, findWins, formatShare, seededRng } from './bingo.js';
```

Then delete the local `seededRng` function at `bingo.test.js:56-67` (the block with the doc comment starting `/** * Deterministic linear congruential generator...`).

- [ ] **Step 4: Run the suite — same 27 tests, now exercising the shipped function**

Run: `npm test`
Expected: `# pass 27`, `# fail 0` (identical count and names to Step 1 — this step is a refactor, not a behavior change)

- [ ] **Step 5: Commit**

```bash
git add bingo.js bingo.test.js
git commit -m "refactor: promote seededRng from bingo.test.js into bingo.js

Session cards (added in a later commit) need the same deterministic
RNG the shuffle tests already use. The test file now imports the
shipped function instead of keeping its own copy."
```

---

### Task 2: Add `hashSeed` to `bingo.js`

**Files:**
- Modify: `bingo.js` (add after `seededRng`, before `buildLines`)
- Modify: `bingo.test.js` (add tests near the `shuffle`/seed tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `hashSeed(text: string): number` — an unsigned 32-bit integer. Task 4 and `index.html` (Task 7) call `seededRng(hashSeed(sessionCode + ':' + playerId))`.

- [ ] **Step 1: Write the failing tests**

Add to `bingo.test.js`, after the existing shuffle/seed tests (near line 87, after `'shuffle with different seeds produces different orders'`):

```js
test('hashSeed is deterministic', () => {
  assert.equal(hashSeed('k7m2:some-id'), hashSeed('k7m2:some-id'));
});

test('hashSeed returns an unsigned 32-bit integer', () => {
  const value = hashSeed('anything');
  assert.ok(Number.isInteger(value));
  assert.ok(value >= 0 && value <= 2 ** 32 - 1);
});

test('hashSeed avalanches on a one-character input change', () => {
  // Fixed pair, computed once: a one-character change in the session code
  // must not leave the hash close to its neighbor, or seededRng (an LCG,
  // whose early output correlates across adjacent seeds) would produce
  // visibly similar cards for visibly similar session codes.
  const a = hashSeed('k7m2:11111111-1111-1111-1111-111111111111');
  const b = hashSeed('k7m3:11111111-1111-1111-1111-111111111111');
  const differingBits = (a ^ b).toString(2).split('').filter((bit) => bit === '1').length;
  assert.ok(differingBits >= 8, `only ${differingBits}/32 bits differ`);
});

test('hashSeed handles the empty string without throwing', () => {
  assert.doesNotThrow(() => hashSeed(''));
});
```

Add `hashSeed` to the import at `bingo.test.js:4`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bingo.test.js`
Expected: FAIL — `hashSeed is not defined` (or a `SyntaxError` from the import naming an export that doesn't exist yet)

- [ ] **Step 3: Implement `hashSeed` in `bingo.js`**

Add after `seededRng`:

```js
/**
 * FNV-1a over `text`, then a murmur3-style avalanche finalizer. FNV-1a
 * alone leaves a small input change visible mostly in the low bits;
 * since `seededRng` is a linear congruential generator whose early
 * output is most sensitive to exactly those bits, two similar session
 * codes would otherwise draw suspiciously similar cards. The finalizer
 * mixes high and low bits together so that doesn't happen.
 */
export function hashSeed(text) {
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0; // FNV-1a 32-bit prime
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bingo.test.js`
Expected: PASS, `# pass 31` (27 + 4 new)

- [ ] **Step 5: Commit**

```bash
git add bingo.js bingo.test.js
git commit -m "feat: add hashSeed for deriving session-card seeds"
```

---

### Task 3: Add `packMarks` / `unpackMarks` to `bingo.js`

**Files:**
- Modify: `bingo.js` (add after `findWins`, before the `formatShare` section)
- Modify: `bingo.test.js` (add tests near the `findWins` tests)

**Interfaces:**
- Consumes: `CELL_COUNT` (already in scope in `bingo.js`).
- Produces: `packMarks(marked: boolean[25]): string`, `unpackMarks(text: string): boolean[25]`. Task 5 (`session.js`) imports both.

- [ ] **Step 1: Write the failing tests**

Add to `bingo.test.js`, after the `findWins` tests (search for the last `test('findWins` block and insert after it):

```js
test('packMarks/unpackMarks round-trip arbitrary boolean arrays', () => {
  const rng = seededRng(99);
  for (let trial = 0; trial < 20; trial += 1) {
    const marked = Array.from({ length: CELL_COUNT }, () => rng() < 0.5);
    assert.deepEqual(unpackMarks(packMarks(marked)), marked);
  }
});

test('packMarks/unpackMarks round-trip all-false and all-true', () => {
  const allFalse = new Array(CELL_COUNT).fill(false);
  const allTrue = new Array(CELL_COUNT).fill(true);

  assert.equal(packMarks(allFalse), '0');
  assert.deepEqual(unpackMarks(packMarks(allFalse)), allFalse);
  assert.deepEqual(unpackMarks(packMarks(allTrue)), allTrue);
});

test('unpackMarks tolerates garbage input without throwing', () => {
  const blank = new Array(CELL_COUNT).fill(false);

  assert.deepEqual(unpackMarks('!!!'), blank, 'non-base36 characters');
  assert.deepEqual(unpackMarks(''), blank, 'empty string');
  assert.deepEqual(unpackMarks(null), blank, 'null');
  assert.deepEqual(unpackMarks(undefined), blank, 'undefined');
  assert.deepEqual(unpackMarks('abcdef'), blank, 'longer than 5 characters');
});

test('unpackMarks always returns exactly CELL_COUNT entries', () => {
  assert.equal(unpackMarks('jz6rj').length, CELL_COUNT);
  assert.equal(unpackMarks('bogus!!!').length, CELL_COUNT);
  assert.equal(unpackMarks('').length, CELL_COUNT);
});
```

Add `packMarks, unpackMarks` to the import at `bingo.test.js:4`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bingo.test.js`
Expected: FAIL — `packMarks is not defined`

- [ ] **Step 3: Implement in `bingo.js`**

Add after `findWins` (before the `MARKED_EMOJI` constant):

```js
const MARKS_PATTERN = /^[0-9a-z]{1,5}$/;

/** boolean[CELL_COUNT] -> base36 string. Bit `i` is cell `i`, LSB first. */
export function packMarks(marked) {
  let bits = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (marked[i]) {
      bits |= 1 << i;
    }
  }
  return bits.toString(36);
}

/**
 * base36 string -> boolean[CELL_COUNT]. Every bitmask is a legal game
 * state, so this never throws: anything that isn't a clean, in-range
 * base36 string of the right length is treated as "no marks yet."
 */
export function unpackMarks(text) {
  const blank = new Array(CELL_COUNT).fill(false);
  if (typeof text !== 'string' || !MARKS_PATTERN.test(text)) {
    return blank;
  }
  const bits = parseInt(text, 36);
  if (!Number.isFinite(bits) || bits < 0 || bits >= 2 ** CELL_COUNT) {
    return blank;
  }
  return blank.map((_, i) => Boolean(bits & (1 << i)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bingo.test.js`
Expected: PASS, `# pass 35` (31 + 4 new)

- [ ] **Step 5: Commit**

```bash
git add bingo.js bingo.test.js
git commit -m "feat: add packMarks/unpackMarks for cookie-stored marks"
```

---

### Task 4: Prove the card-determinism requirement

This is the feature's one hard correctness requirement, stated as its own test now that all three pieces (`buildCard`, `seededRng`, `hashSeed`) exist together.

**Files:**
- Modify: `bingo.test.js` (add near the other `buildCard` tests, after `'buildCard draws a different card for a different seed'`)

**Interfaces:**
- Consumes: `buildCard`, `seededRng`, `hashSeed`, `DECK` (all already imported/available in `bingo.test.js`).
- Produces: nothing new — this is a test-only task.

- [ ] **Step 1: Write the failing test**

```js
test('a session card is fully determined by session code and player id — same pair, same card; different pair, different card', () => {
  const seedFor = (code, id) => hashSeed(`${code}:${id}`);
  const cardFor = (code, id) => buildCard(DECK, seededRng(seedFor(code, id)));

  const first = cardFor('k7m2', 'player-a');
  const second = cardFor('k7m2', 'player-a');
  assert.deepEqual(first, second, 'same session code + same player id must reproduce the same card');

  const differentCode = cardFor('k7m3', 'player-a');
  assert.notDeepEqual(first, differentCode, 'a different session code must change the card');

  const differentId = cardFor('k7m2', 'player-b');
  assert.notDeepEqual(first, differentId, 'a different player id must change the card');
});
```

- [ ] **Step 2: Run to verify it fails or passes for the right reason**

Run: `node --test bingo.test.js`
Expected: PASS immediately — every piece already exists from Tasks 1–2. This step exists to confirm the composition works end to end, not to drive new implementation. If it fails, the bug is in `hashSeed` or `seededRng`, not in this test.

- [ ] **Step 3: Commit**

```bash
git add bingo.test.js
git commit -m "test: prove session cards are deterministic from (code, id)"
```

---

### Task 5: `session.js` pure core

**Files:**
- Create: `session.js`
- Create: `session.test.js`

**Interfaces:**
- Consumes: `CELL_COUNT`, `packMarks`, `unpackMarks` from `./bingo.js`.
- Produces (pure, tested here):
  - `normalizeCode(raw: string | null | undefined): string`
  - `mintCode(rng?: () => number): string` (4 chars, lowercase alphanumeric; `rng` defaults to `Math.random`, matching the convention `shuffle`/`buildCard` already use in `bingo.js`)
  - `formatMarks(code: string, marked: boolean[25]): string`
  - `parseMarks(value: string | null | undefined, currentCode: string): boolean[25]`
  - `readCookie(cookieString: string | null | undefined, name: string): string | null`

  Task 6 (same file, impure edge) and `index.html` (Task 7) consume all five.

- [ ] **Step 1: Write the failing tests**

Create `session.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { CELL_COUNT, seededRng } from './bingo.js';
import { normalizeCode, mintCode, formatMarks, parseMarks, readCookie } from './session.js';

test('normalizeCode lowercases and strips non-alphanumerics', () => {
  assert.equal(normalizeCode('K7-M2!'), 'k7m2');
});

test('normalizeCode caps at 16 characters', () => {
  assert.equal(normalizeCode('a'.repeat(20)), 'a'.repeat(16));
});

test('normalizeCode treats absent input as no code', () => {
  assert.equal(normalizeCode(null), '');
  assert.equal(normalizeCode(undefined), '');
  assert.equal(normalizeCode(''), '');
  assert.equal(normalizeCode('   '), '');
});

test('mintCode is deterministic under injected randomness', () => {
  assert.equal(mintCode(seededRng(1)), mintCode(seededRng(1)));
});

test('mintCode returns a 4-character lowercase alphanumeric code', () => {
  const code = mintCode(seededRng(5));
  assert.equal(code.length, 4);
  assert.match(code, /^[a-z0-9]{4}$/);
});

test('formatMarks/parseMarks round-trip when the code matches', () => {
  const marked = new Array(CELL_COUNT).fill(false);
  marked[0] = true;
  marked[24] = true;

  const stored = formatMarks('k7m2', marked);
  assert.deepEqual(parseMarks(stored, 'k7m2'), marked);
});

test('parseMarks discards marks from a different session code', () => {
  const marked = new Array(CELL_COUNT).fill(true);
  const stored = formatMarks('k7m2', marked);

  assert.deepEqual(parseMarks(stored, 'k7m3'), new Array(CELL_COUNT).fill(false));
});

test('parseMarks tolerates malformed or absent stored values', () => {
  const blank = new Array(CELL_COUNT).fill(false);

  assert.deepEqual(parseMarks(null, 'k7m2'), blank);
  assert.deepEqual(parseMarks(undefined, 'k7m2'), blank);
  assert.deepEqual(parseMarks('no-separator-here', 'k7m2'), blank);
  assert.deepEqual(parseMarks('', 'k7m2'), blank);
});

test('readCookie finds a name among several', () => {
  assert.equal(readCookie('bb_id=abc123; other=xyz', 'bb_id'), 'abc123');
  assert.equal(readCookie('other=xyz; bb_id=abc123', 'bb_id'), 'abc123');
});

test('readCookie tolerates surrounding whitespace', () => {
  assert.equal(readCookie(' bb_id=abc123 ; other=1', 'bb_id'), 'abc123');
});

test('readCookie does not match on a name prefix', () => {
  assert.equal(readCookie('bb_ident=xyz; bb_id=abc123', 'bb_id'), 'abc123');
});

test('readCookie returns null for a missing name or empty header', () => {
  assert.equal(readCookie('a=1; b=2', 'bb_id'), null);
  assert.equal(readCookie('', 'bb_id'), null);
  assert.equal(readCookie(null, 'bb_id'), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test session.test.js`
Expected: FAIL — `Cannot find module './session.js'`

- [ ] **Step 3: Implement the pure core in `session.js`**

Create `session.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test session.test.js`
Expected: PASS, `# pass 13`

- [ ] **Step 5: Run the whole suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS, `# pass 48` (35 from bingo.test.js + 13 from session.test.js)

- [ ] **Step 6: Commit**

```bash
git add session.js session.test.js
git commit -m "feat: add session.js pure core (code, marks, cookie parsing)"
```

---

### Task 6: `session.js` browser-coupled edge

Per ADR 0001 decision 4 and this feature's design spec, DOM/browser-coupled code is not unit tested — it's verified by hand. This task has no `node --test` steps; verification is a manual browser pass at the end.

**Files:**
- Modify: `session.js` (append after `readCookie`)

**Interfaces:**
- Consumes: `normalizeCode`, `formatMarks`, `parseMarks`, `readCookie` (same file, Task 5).
- Produces: `currentCode()`, `loadIdentity()`, `loadMarks(code)`, `saveMarks(code, marked)`, `cookiesEnabled()`. `index.html` (Task 7) imports all five.

- [ ] **Step 1: Append the impure edge to `session.js`**

```js
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
```

- [ ] **Step 2: Confirm the pure-layer tests still pass (this task adds no automated tests, but must not break existing ones)**

Run: `npm test`
Expected: PASS, `# pass 48` (unchanged from Task 5 — this step only appended new exports, it didn't touch anything imported by a test)

- [ ] **Step 3: Commit**

```bash
git add session.js
git commit -m "feat: add session.js browser-coupled edge (identity, marks, cookies)"
```

---

### Task 7: Wire the lobby into `index.html`

This removes the existing "New card" button. Keeping a manual re-roll button on the game screen would let a player bypass the entire feature by clicking it — the whole point is that a card only changes when the session changes. Starting a new session (which now needs a fresh URL) is the only way to get a new card.

**Files:**
- Modify: `index.html` (styles, markup, and the module script)

**Interfaces:**
- Consumes: `seededRng`, `hashSeed`, `packMarks`/`unpackMarks` (transitively) from `./bingo.js`; `currentCode`, `mintCode`, `loadIdentity`, `loadMarks`, `saveMarks`, `cookiesEnabled` from `./session.js`.

- [ ] **Step 1: Add styles for the two new screens**

In the `<style>` block, after the existing `.status` rule (currently ending around line 137), add:

```css
      .muted {
        color: var(--muted);
        font-size: 0.9rem;
      }

      .warning {
        margin: 0 0 0.75rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.85rem;
        color: var(--marked-fg);
        background: var(--accent);
        border-radius: 0.5rem;
      }

      .session-footer {
        margin-top: 1rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--cell-border);
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
        font-size: 0.8rem;
        color: var(--muted);
      }

      .session-footer button,
      .session-footer a {
        font: inherit;
        color: var(--accent);
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        text-decoration: underline;
      }

      #session-code {
        font-family: ui-monospace, SFMono-Regular, monospace;
        color: var(--fg);
      }
```

- [ ] **Step 2: Replace the `<body>` markup**

Replace everything from `<body>` through the closing `</main>` (currently lines 140–154) with:

```html
  <body>
    <main>
      <h1>Business Bullshit Bingo</h1>

      <section id="start-screen" hidden>
        <p class="muted">
          Start a session and share the link. Everyone who opens it gets
          their own card, locked until someone starts a new session.
        </p>
        <div class="actions">
          <button id="start-session" type="button">Start a session</button>
        </div>
      </section>

      <section id="game-screen" hidden>
        <p id="cookie-warning" class="warning" hidden>
          Cookies are blocked in this browser, so your card will reset if
          you reload this page.
        </p>

        <div class="actions">
          <button id="copy-result" type="button">Copy result</button>
        </div>

        <p id="banner" class="banner" aria-live="polite"></p>

        <div id="grid" class="grid" role="group" aria-label="Bingo card"></div>

        <p id="status" class="status" aria-live="polite"></p>

        <footer class="session-footer">
          Session <code id="session-code"></code>
          <button id="copy-invite" type="button">Copy invite link</button>
          <a id="new-session" href="#">New session</a>
        </footer>
      </section>
    </main>
```

(Leave the `<script type="module">` block and the closing `</body></html>` below it in place for now — the next step replaces the script's contents.)

- [ ] **Step 3: Replace the module script**

Replace the entire contents of the `<script type="module">...</script>` block with:

```html
    <script type="module">
      import { DECK } from './deck.js';
      import {
        CELL_COUNT,
        LINES,
        buildCard,
        findWins,
        formatShare,
        lineName,
        seededRng,
        hashSeed,
      } from './bingo.js';
      import {
        currentCode,
        mintCode,
        loadIdentity,
        loadMarks,
        saveMarks,
        cookiesEnabled,
      } from './session.js';

      const startScreen = document.getElementById('start-screen');
      const gameScreen = document.getElementById('game-screen');
      const startButton = document.getElementById('start-session');
      const cookieWarning = document.getElementById('cookie-warning');
      const sessionCodeEl = document.getElementById('session-code');
      const copyInviteButton = document.getElementById('copy-invite');
      const newSessionLink = document.getElementById('new-session');
      const grid = document.getElementById('grid');
      const banner = document.getElementById('banner');
      const status = document.getElementById('status');
      const copyResultButton = document.getElementById('copy-result');

      const code = currentCode();

      if (!code) {
        startScreen.hidden = false;
        startButton.addEventListener('click', () => {
          location.search = `?s=${mintCode()}`;
        });
      } else {
        startGame(code);
      }

      function startGame(sessionCode) {
        gameScreen.hidden = false;
        sessionCodeEl.textContent = sessionCode;

        if (!cookiesEnabled()) {
          cookieWarning.hidden = false;
        }

        const id = loadIdentity();
        const card = buildCard(DECK, seededRng(hashSeed(`${sessionCode}:${id}`)));
        const marked = loadMarks(sessionCode);

        const cells = Array.from({ length: CELL_COUNT }, (_, index) => {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cell';
          cell.addEventListener('click', () => {
            marked[index] = !marked[index];
            saveMarks(sessionCode, marked);
            status.textContent = '';
            render();
          });
          grid.append(cell);
          return cell;
        });

        function render() {
          const wins = findWins(marked);
          const winningCells = new Set(wins.flatMap((win) => LINES[win]));

          cells.forEach((cell, index) => {
            cell.textContent = card[index];
            cell.classList.toggle('marked', marked[index]);
            cell.classList.toggle('winning', winningCells.has(index));
            cell.setAttribute('aria-pressed', String(marked[index]));
          });

          const nextBanner =
            wins.length > 0 ? `BINGO — ${wins.map(lineName).join(', ')}` : '';
          if (banner.textContent !== nextBanner) {
            banner.textContent = nextBanner;
          }
        }

        copyResultButton.addEventListener('click', async () => {
          const text = formatShare(marked, findWins(marked));
          try {
            await navigator.clipboard.writeText(text);
            status.textContent = 'Copied to clipboard.';
          } catch {
            status.textContent = `Copy failed — select and copy this:\n${text}`;
          }
        });

        copyInviteButton.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(location.href);
            status.textContent = 'Invite link copied.';
          } catch {
            status.textContent = `Copy failed — select and copy this:\n${location.href}`;
          }
        });

        newSessionLink.addEventListener('click', (event) => {
          event.preventDefault();
          const inProgress = marked.some(Boolean);
          if (
            inProgress &&
            !confirm('Start a new session? Your current card and marks are left behind.')
          ) {
            return;
          }
          location.search = `?s=${mintCode()}`;
        });

        render();
      }
    </script>
```

- [ ] **Step 4: Confirm the automated suite is unaffected**

Run: `npm test`
Expected: PASS, `# pass 48` (this task only touches `index.html`, which no test imports)

- [ ] **Step 5: Manual browser verification**

Run: `npm run serve`, then in a browser:

1. Open `http://localhost:8000/` — the start screen appears (title, explainer, "Start a session" button), no grid.
2. Click "Start a session" — URL gains `?s=xxxx`, the grid appears with 25 phrases, footer shows `Session xxxx`.
3. Mark a few cells, then reload the page — the same 25 phrases appear in the same positions, and the same cells are still marked.
4. Copy the URL, open it in a private/incognito window — a *different* card appears (different browser id), starting unmarked.
5. Back in the original window, click "New session" with marks present — a confirm dialog appears; cancel it, confirm nothing changed; accept it, confirm the URL's `?s=` value changed and the grid is a fresh, unmarked card.
6. Click "Copy invite link" and "Copy result" — both report success and the clipboard contains the expected text.
7. In the browser's dev tools, disable cookies for `localhost`, then reload with a `?s=` URL already in the address bar — the game still renders, and the "Cookies are blocked" warning is visible.
8. Re-enable cookies before continuing to the next task.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: wire lobby sessions into index.html

Replaces the free-standing 'New card' re-roll with session-scoped
identity: opening a session link derives a locked card from the
session code and an anonymous per-browser id, and both the card and
its marks survive a reload. A new card now requires a new session."
```

---

### Task 8: ADR 0002 — cookie-backed lobby sessions

**Files:**
- Create: `docs/adr/0002-cookie-backed-lobby-sessions.md`
- Modify: `docs/adr/0001-dependency-free-static-app-with-pure-logic-module.md` (append to "Changes since acceptance")

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0002-cookie-backed-lobby-sessions.md`:

```markdown
# ADR 0002 — Cookie-backed lobby sessions

- **Status:** Accepted
- **Date:** 2026-09-18
- **Deciders:** Stefan Haupt
- **Spec:** [2026-09-18-bullshit-bingo-lobby-design.md](../superpowers/specs/2026-09-18-bullshit-bingo-lobby-design.md)
- **Amends:** ADR 0001, decision 5

## Context

ADR 0001 decision 5 states: "No `localStorage`, no cookies, no query
parameters." That was correct for a page with no persistence. It stopped
being correct once the goal became "a player's card must survive a
reload and only change when someone starts a new session" — a
requirement that has no answer without storing something, somewhere,
across page loads.

## Decision

### The session code lives in the URL (`?s=<code>`)

Opening a link is joining a session; there is no host role and no
server to register with. A new session is a new code and a re-share of
the link.

### Identity is an anonymous id in a cookie, not a typed name

Nothing is typed. A per-browser id is minted on first visit and stored
in a cookie. A player's card is derived, never stored, as
`buildCard(DECK, seededRng(hashSeed(sessionCode + ':' + id)))`.

Accepted trade-off: losing the cookie — a cleared browser, incognito, a
different device — loses that card permanently, and is also how a
player can deliberately re-roll. This was chosen knowingly over the
alternative (a typed name), which would have made re-rolling a visible,
social act instead of a silent one, at the cost of a name field that
becomes load-bearing the moment someone fat-fingers it.

### Marks are a session-tagged bitmask in a second cookie

25 booleans pack into a base36 string of at most 5 characters. The
cookie also stores the session code it was written for; if that code
doesn't match the URL's, the marks are discarded. This one comparison
is the entire mechanism behind "cards stay locked until the session
restarts."

### Cookies, not `localStorage`

The site is served from `onehandeddev.github.io`, an origin shared by
every GitHub Pages repository on the account. `localStorage` cannot be
scoped narrower than that origin, so every project sharing it risks
colliding on key names. A cookie's `path` attribute can be scoped to
the app's own directory.

That path is computed at runtime from `location.pathname` rather than
hardcoded, so the same code scopes correctly on GitHub Pages and still
works when served locally from a different path during development.
Similarly, the `Secure` attribute is added only when the page is served
over HTTPS — added unconditionally, it would silently prevent any
cookie from being set on the plain-HTTP local dev server.

### What did not change

ADR 0001 decisions 1–4 stand: still no backend, no build step, no
dependencies, and the pure-logic-module split — game rules and now
session/cookie parsing are pure and unit tested; only the DOM-facing
edges are verified by hand.

## Consequences

### Good

- The sharpest documented flaw in ADR 0001 ("a page reload mid-meeting
  discards the card and all marks") is fixed.
- No new dependency, no server, no build step.
- The card is derived, not stored — the cookie payload stays a fixed,
  tiny size regardless of session count.

### Bad

- A cleared cookie is an unrecoverable card, by design (see above).
- Two tabs on the same session diverge on marks — cookies have no
  change event, so there's no cheap way to keep them in sync.
- Session codes can collide across unrelated meetings. This is
  harmless: each player's id is also part of the seed, so cards still
  differ. This is why a 4-character code is sufficient.

### Reversibility

Reverting to ADR 0001's original stance (no persistence) means deleting
`session.js`, the `bb_id`/`bb_marks` cookie calls in `index.html`, and
the two `bingo.js` additions (`hashSeed`, `packMarks`/`unpackMarks`) —
`bingo.js`'s original exports are untouched by this change. Moving from
cookies to a real backend (visible rosters, live marks) is, as ADR 0001
already noted, a new project rather than a refactor of this one.
```

- [ ] **Step 2: Append to ADR 0001's changes log**

In `docs/adr/0001-dependency-free-static-app-with-pure-logic-module.md`, after the existing `**2026-09-14 — the card grew...` paragraph under "## Changes since acceptance", add:

```markdown

**2026-09-18 — decision 5 (no cookies, no query parameters) was
amended.** Lobby sessions need both to survive a reload without a
server: the session code lives in the URL and player identity plus
marks live in cookies. `localStorage` is still unused. See
[ADR 0002](0002-cookie-backed-lobby-sessions.md) for the full
reasoning.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0002-cookie-backed-lobby-sessions.md docs/adr/0001-dependency-free-static-app-with-pure-logic-module.md
git commit -m "docs: add ADR 0002 for cookie-backed lobby sessions"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: PASS, `# pass 48`, `# fail 0`

- [ ] **Step 2: Re-run the manual browser pass from Task 7, Step 5, start to finish**

All eight checks from Task 7 Step 5 must still hold after the ADR-only commits in Task 8 (which touch no code).

- [ ] **Step 3: Confirm the deployed-app entry points are consistent**

Run: `grep -n "New card" index.html`
Expected: no output — the removed button and its old event listener must not still be referenced anywhere.

- [ ] **Step 4: Review the full diff against the spec one more time**

Run: `git log --oneline d13f644..HEAD`
Expected: nine commits (Tasks 1–8 plus this task has none), each corresponding to one task above, in order.
