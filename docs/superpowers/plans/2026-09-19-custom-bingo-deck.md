# Custom Bingo Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the person starting a session bring their own phrase list — a prefilled, editable textarea on the start screen — instead of the fixed `DECK`, shared with every player via a new `?d=` URL parameter.

**Architecture:** One new pure module, `customDeck.js`, parses and validates pasted text. `session.js` gains one pure function (`sessionKey`) to fold deck identity into the marks-cookie tag. `index.html`'s existing two-screen flow gains a textarea on the start screen and a new failure state on the game screen; everything else — grid rendering, marks, copy buttons — is untouched.

**Tech Stack:** Same as the rest of the app: vanilla JS ES modules, `node --test`, cookies, no dependencies, no build step.

**Spec:** [docs/superpowers/specs/2026-09-19-custom-bingo-deck-design.md](../specs/2026-09-19-custom-bingo-deck-design.md)

## Global Constraints

- No dependencies, no build step, no framework, no backend (ADR 0001 decisions 1–4, unchanged; this feature needs none of them touched).
- `deck.js` stays data-only — no logic added to it (ADR 0001 decision 3). All deck-authoring logic lives in the new `customDeck.js`.
- Deck travels only in the URL (`?d=`), never in a cookie — cookies stay small and deck-size-independent (spec: "Marks-cookie tag uses a short fingerprint").
- `?d=` is present only when the parsed phrase set differs from `DECK` as a set (spec: "Untouched or merely reordered text produces no `?d=` at all").
- Minimum deck size is `CELL_COUNT` (25) valid, unique, ≤`MAX_PHRASE_LENGTH` (40)-character phrases (spec Scope Decisions and `parseDeckText`).
- Soft cap: more than 150 phrases triggers a non-blocking warning, never a rejection (spec Scope Decisions).
- Tests are `node --test` / `node:assert/strict` only (ADR 0001 decision 4); DOM-facing code is verified by hand.
- Cell content is rendered via `cell.textContent`, never `innerHTML` — already true, must not regress.

## Implementation Notes (deviate from the spec's literal wording, not its intent)

Four refinements surfaced while turning the spec into exact code. Each is stated here so it isn't rediscovered as a surprise mid-task.

1. **The card seed does not unconditionally include deck text.** The spec's Section 2 reads `hashSeed(sessionCode + ':' + id + ':' + deckText)` without qualification. Taken literally, this reseeds *every* session — including ones with no custom deck — the moment this feature ships, because the pre-existing formula was `hashSeed(sessionCode + ':' + id)`, two parts, not three. Worse: the spec's own backward-compatibility promise for the marks tag ("no custom deck: the tag stays bare `sessionCode`") would then be actively misleading — an in-flight default-deck session's marks-cookie would still look valid (same bare-code tag) while its card had silently reshuffled underneath it, so old marks would land on the wrong cells. Fix: the seed formula only gains the third segment when `?d=` is present. With no `?d=`, both the seed and the tag are byte-identical to the lobby-sessions design, full stop — not just the tag.
2. **The marks-tag fingerprint hashes the canonical, parsed deck text — not the raw `?d=` URL value.** This matches the spec's literal `hashSeed(deckText)` (where `deckText` is the resolved phrase list joined with `\n`, the same string the seed uses), and is what makes the fingerprint stable across incidental URL-encoding differences between two functionally identical decks.
3. **The game screen's "broken deck" gate checks `phrases.length < CELL_COUNT`, not `errors.length > 0`.** A single over-length phrase in an otherwise-fine 30-phrase link produces one error but still leaves 29 usable phrases — that link must still play. The start screen, where the author can immediately fix their own input, is stricter: it blocks on *any* error.
4. **The size warning is recomputed live, on every keystroke/paste (`input` event), not only at submit time.** A warning computed immediately before `location.search = ...` — which navigates away — would never be visible to anyone. Showing it live is what makes it "non-blocking but seen" rather than "technically implemented, practically invisible." It is not a dismiss-button-style notice; it simply reflects the textarea's current content and disappears if the user trims the list back down.
5. **The "seed changes with deck text" test lives in `bingo.test.js` (Task 2), not `session.test.js`.** The spec's Testing section lists it under `session.test.js` — but it exercises only `hashSeed`/`seededRng`/`buildCard`, all `bingo.js` exports, and touches nothing in `session.js`. It's placed next to the existing card-determinism test it extends, keeping each test file scoped to the module it actually validates. The genuinely `session.js`-specific test — the marks tag being bare vs. fingerprinted — is in `session.test.js` (Task 4), as the spec says.

## File Structure

```
customDeck.js       NEW — pure: parseDeckText, deckWarning, isDefaultDeck
customDeck.test.js  NEW
bingo.js             + MAX_PHRASE_LENGTH constant
bingo.test.js        DECK-shape test uses the constant; one new determinism test
session.js           + sessionKey
session.test.js      + sessionKey tests
index.html           textarea + validation (start screen); deck loading,
                      seed/tag fold-in, broken-deck state (game screen)
deck.js              unchanged
```

---

### Task 1: Promote `MAX_PHRASE_LENGTH` in `bingo.js`

**Files:**
- Modify: `bingo.js` (add after the `TITLE` export)
- Modify: `bingo.test.js` (import, and the DECK-shape test)

**Interfaces:**
- Produces: `MAX_PHRASE_LENGTH: number` (= 40), exported from `bingo.js`. Task 3 (`customDeck.js`) imports it.

- [ ] **Step 1: Run the existing suite to confirm the baseline is green**

Run: `npm test`
Expected: `# pass 48`, `# fail 0`

- [ ] **Step 2: Add the constant to `bingo.js`**

In `bingo.js`, after:

```js
export const TITLE = 'Business Bullshit Bingo';
```

add:

```js

/** A phrase longer than this doesn't fit a card cell on a phone. */
export const MAX_PHRASE_LENGTH = 40;
```

- [ ] **Step 3: Point the DECK-shape test at the shipped constant**

In `bingo.test.js`, find the import line (starts `import { CARD_SIZE, CELL_COUNT, ...`) and add `MAX_PHRASE_LENGTH` to the list of named imports from `./bingo.js`.

Then find:

```js
test('DECK phrases are trimmed, non-empty and at most 40 characters', () => {
  for (const phrase of DECK) {
    assert.equal(typeof phrase, 'string');
    assert.equal(phrase, phrase.trim(), `"${phrase}" has surrounding whitespace`);
    assert.ok(phrase.length > 0, 'DECK contains an empty phrase');
    assert.ok(phrase.length <= 40, `"${phrase}" is ${phrase.length} characters`);
  }
});
```

and change the last assertion to:

```js
    assert.ok(phrase.length <= MAX_PHRASE_LENGTH, `"${phrase}" is ${phrase.length} characters`);
```

- [ ] **Step 4: Run the suite — same 48 tests, now sharing one constant**

Run: `npm test`
Expected: `# pass 48`, `# fail 0` (identical count — this is a refactor, not a behavior change)

- [ ] **Step 5: Commit**

```bash
git add bingo.js bingo.test.js
git commit -m "refactor: promote MAX_PHRASE_LENGTH from a bingo.test.js literal

Custom decks (added in a later commit) need this cap for runtime
validation of pasted text, not just for testing the built-in DECK."
```

---

### Task 2: Extend card-determinism coverage to deck text

This proves the seed formula's deck-dependent branch (Implementation Note 1) actually changes the card, using only functions that already exist.

**Files:**
- Modify: `bingo.test.js` (add near the existing "a session card is fully determined by..." test)

**Interfaces:**
- Consumes: `buildCard`, `seededRng`, `hashSeed`, `DECK` (already imported in `bingo.test.js`).
- Produces: nothing new — test-only task.

- [ ] **Step 1: Write the failing test**

Find the existing test `'a session card is fully determined by session code and player id — same pair, same card; different pair, different card'` in `bingo.test.js` and add this test immediately after it:

```js
test('a session card also depends on deck text, when a custom deck is present', () => {
  const seedWithDeck = (code, id, deckText) => hashSeed(`${code}:${id}:${deckText}`);
  const cardWithDeck = (code, id, deckText) => buildCard(DECK, seededRng(seedWithDeck(code, id, deckText)));

  const first = cardWithDeck('k7m2', 'player-a', 'alpha\nbeta');
  const second = cardWithDeck('k7m2', 'player-a', 'alpha\nbeta');
  assert.deepEqual(first, second, 'same (code, id, deckText) must reproduce the same card');

  const differentDeckText = cardWithDeck('k7m2', 'player-a', 'gamma\ndelta');
  assert.notDeepEqual(first, differentDeckText, 'a different deckText must change the card');
});
```

(Note: this test draws from `DECK` regardless of the `deckText` string passed to the seed — it isolates the claim "changing the seed's third component changes the card," which is all `index.html`'s seed-formula branch needs to guarantee. Task 3's `customDeck.js` tests separately cover parsing a deck's *own* phrases.)

- [ ] **Step 2: Run to verify it passes immediately**

Run: `node --test bingo.test.js`
Expected: PASS, `# pass 37` (36 + 1). This composition already works from existing exports — the step confirms it, it doesn't drive new implementation. A failure here would mean a bug in `hashSeed` or `seededRng`, not something to "fix" by changing this test.

- [ ] **Step 3: Commit**

```bash
git add bingo.test.js
git commit -m "test: prove the seed's deck-text component changes the card"
```

---

### Task 3: `customDeck.js` — parse, validate, compare

**Files:**
- Create: `customDeck.js`
- Create: `customDeck.test.js`

**Interfaces:**
- Consumes: `CELL_COUNT`, `MAX_PHRASE_LENGTH` from `./bingo.js`; `DECK` from `./deck.js` (only as `isDefaultDeck`'s default parameter).
- Produces (all pure, tested here):
  - `parseDeckText(text: string): { phrases: string[], errors: string[] }`
  - `deckWarning(phrases: string[]): string | null`
  - `isDefaultDeck(phrases: string[], deck?: string[]): boolean`

  Task 5 (`index.html`) imports and calls all three.

- [ ] **Step 1: Write the failing tests**

Create `customDeck.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { CELL_COUNT, MAX_PHRASE_LENGTH } from './bingo.js';
import { parseDeckText, deckWarning, isDefaultDeck } from './customDeck.js';

function validPhrases(count) {
  return Array.from({ length: count }, (_, i) => `Phrase ${i}`);
}

test('parseDeckText strips blank lines and surrounding whitespace', () => {
  const text = `  Alpha  \n\nBeta\n   \nGamma\n${validPhrases(22).join('\n')}`;
  const { phrases, errors } = parseDeckText(text);

  assert.deepEqual(errors, []);
  assert.ok(phrases.includes('Alpha'));
  assert.ok(phrases.includes('Beta'));
  assert.ok(phrases.includes('Gamma'));
  assert.equal(phrases.length, 25);
});

test('parseDeckText dedupes exact repeats', () => {
  const text = ['Alpha', 'Alpha', 'Alpha', ...validPhrases(24)].join('\n');
  const { phrases, errors } = parseDeckText(text);

  assert.deepEqual(errors, []);
  assert.equal(phrases.filter((p) => p === 'Alpha').length, 1);
  assert.equal(phrases.length, 25);
});

test('parseDeckText accepts exactly CELL_COUNT phrases', () => {
  const { phrases, errors } = parseDeckText(validPhrases(CELL_COUNT).join('\n'));

  assert.deepEqual(errors, []);
  assert.equal(phrases.length, CELL_COUNT);
});

test('parseDeckText rejects one phrase short of CELL_COUNT with the correct message', () => {
  const { phrases, errors } = parseDeckText(validPhrases(CELL_COUNT - 1).join('\n'));

  assert.equal(phrases.length, CELL_COUNT - 1);
  assert.deepEqual(errors, [`need 1 more phrase (${CELL_COUNT} minimum, got ${CELL_COUNT - 1})`]);
});

test('parseDeckText rejects an over-length phrase, names it, and excludes it from phrases', () => {
  const longPhrase = 'x'.repeat(MAX_PHRASE_LENGTH + 1);
  const text = [longPhrase, ...validPhrases(CELL_COUNT)].join('\n');
  const { phrases, errors } = parseDeckText(text);

  assert.ok(!phrases.includes(longPhrase));
  assert.equal(errors.length, 1);
  assert.match(errors[0], new RegExp(`is ${MAX_PHRASE_LENGTH + 1} characters`));
});

test('parseDeckText reports every simultaneous error, not just the first', () => {
  const longPhrase = 'y'.repeat(MAX_PHRASE_LENGTH + 5);
  const text = [longPhrase, ...validPhrases(5)].join('\n'); // 5 valid + 1 rejected: short of CELL_COUNT too
  const { phrases, errors } = parseDeckText(text);

  assert.equal(phrases.length, 5);
  assert.equal(errors.length, 2, 'expected one length error and one count error');
  assert.match(errors[0], /characters/);
  assert.match(errors[1], /more phrase/);
});

test('deckWarning is null at and below the soft cap', () => {
  assert.equal(deckWarning(validPhrases(150)), null);
});

test('deckWarning warns above the soft cap', () => {
  const warning = deckWarning(validPhrases(151));
  assert.notEqual(warning, null);
  assert.match(warning, /151/);
});

const FIXTURE_DECK = ['Alpha', 'Beta', 'Gamma'];

test('isDefaultDeck is true for the deck itself', () => {
  assert.equal(isDefaultDeck(['Alpha', 'Beta', 'Gamma'], FIXTURE_DECK), true);
});

test('isDefaultDeck is true when the deck is merely reordered', () => {
  assert.equal(isDefaultDeck(['Gamma', 'Alpha', 'Beta'], FIXTURE_DECK), true);
});

test('isDefaultDeck is false when one phrase is changed', () => {
  assert.equal(isDefaultDeck(['Alpha', 'Beta', 'Delta'], FIXTURE_DECK), false);
});

test('isDefaultDeck is false when a phrase is added', () => {
  assert.equal(isDefaultDeck(['Alpha', 'Beta', 'Gamma', 'Delta'], FIXTURE_DECK), false);
});

test('isDefaultDeck is false when a phrase is removed', () => {
  assert.equal(isDefaultDeck(['Alpha', 'Beta'], FIXTURE_DECK), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test customDeck.test.js`
Expected: FAIL — `Cannot find module './customDeck.js'`

- [ ] **Step 3: Implement `customDeck.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test customDeck.test.js`
Expected: PASS, `# pass 13`

- [ ] **Step 5: Run the whole suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS, `# pass 62` (37 in `bingo.test.js` from Task 2 + 12 in `session.test.js` + 13 in `customDeck.test.js`, once `node --test`'s glob picks up the new file)

- [ ] **Step 6: Commit**

```bash
git add customDeck.js customDeck.test.js
git commit -m "feat: add customDeck.js (parse, validate, compare pasted decks)"
```

---

### Task 4: `session.js` — `sessionKey`

**Files:**
- Modify: `session.js` (add `hashSeed` to the import, add the function after `readCookie`, before the browser-coupled-edge divider comment)
- Modify: `session.test.js` (import and tests)

**Interfaces:**
- Consumes: `hashSeed` from `./bingo.js` (new import; `session.js` already imports `CELL_COUNT, packMarks, unpackMarks` from the same module).
- Produces: `sessionKey(code: string, customDeckText: string | null | undefined): string`. Task 5 (`index.html`) calls this for both `loadMarks`/`saveMarks`'s key argument.

- [ ] **Step 1: Write the failing tests**

In `session.test.js`, add `sessionKey` to the existing `from './session.js'` import, and add these tests after the `readCookie` tests:

```js
test('sessionKey is the bare code when there is no custom deck', () => {
  assert.equal(sessionKey('k7m2', null), 'k7m2');
  assert.equal(sessionKey('k7m2', undefined), 'k7m2');
});

test('sessionKey tags the code with a deck fingerprint when a custom deck is present', () => {
  const key = sessionKey('k7m2', 'Alpha\nBeta\nGamma');
  assert.match(key, /^k7m2#[0-9a-z]+$/);
});

test('sessionKey is deterministic for the same deck text and differs for a different one', () => {
  const first = sessionKey('k7m2', 'Alpha\nBeta');
  const second = sessionKey('k7m2', 'Alpha\nBeta');
  const third = sessionKey('k7m2', 'Alpha\nGamma');

  assert.equal(first, second);
  assert.notEqual(first, third);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test session.test.js`
Expected: FAIL — `sessionKey is not defined`

- [ ] **Step 3: Implement in `session.js`**

Change the import line at the top of `session.js` from:

```js
import { CELL_COUNT, packMarks, unpackMarks } from './bingo.js';
```

to:

```js
import { CELL_COUNT, packMarks, unpackMarks, hashSeed } from './bingo.js';
```

Then add this function after `readCookie` and before the `// --- Browser-coupled edge below this line...` comment:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test session.test.js`
Expected: PASS, `# pass 15` (12 + 3)

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, `# pass 65` (37 + 15 + 13 — through this task, `bingo.test.js` unaffected further, `session.test.js` at 15, `customDeck.test.js` at 13)

- [ ] **Step 6: Commit**

```bash
git add session.js session.test.js
git commit -m "feat: add session.js sessionKey for deck-aware marks tagging"
```

---

### Task 5: Wire custom decks into `index.html`

Per ADR 0001 decision 4 and the lobby-sessions precedent, this task's UI/DOM layer is not unit tested — it's verified by hand at the end.

**Files:**
- Modify: `index.html` (styles, both screens' markup, and the module script)

**Interfaces:**
- Consumes: `parseDeckText`, `deckWarning`, `isDefaultDeck` from `./customDeck.js`; `sessionKey` from `./session.js` (new import; `currentCode`, `mintCode`, `loadIdentity`, `loadMarks`, `saveMarks`, `cookiesEnabled` are already imported).

- [ ] **Step 1: Add styles**

In the `<style>` block, after the existing `#session-code` rule, add:

```css
      #deck-text-label {
        display: block;
        margin: 0.75rem 0 0.35rem;
      }

      #deck-text {
        display: block;
        width: 100%;
        min-height: 10rem;
        margin-bottom: 0.5rem;
        padding: 0.5rem;
        font: inherit;
        font-size: 0.85rem;
        color: inherit;
        background: var(--cell-bg);
        border: 1px solid var(--cell-border);
        border-radius: 0.5rem;
        resize: vertical;
      }

      #deck-errors {
        white-space: pre-wrap;
      }

      #deck-broken a {
        color: var(--accent);
      }
```

- [ ] **Step 2: Update the start-screen markup**

Replace:

```html
      <section id="start-screen" hidden>
        <p class="muted">
          Start a session and share the link. Everyone who opens it gets
          their own card, locked until someone starts a new session.
        </p>
        <div class="actions">
          <button id="start-session" type="button">Start a session</button>
        </div>
      </section>
```

with:

```html
      <section id="start-screen" hidden>
        <p class="muted">
          Start a session and share the link. Everyone who opens it gets
          their own card, locked until someone starts a new session.
        </p>

        <label id="deck-text-label" for="deck-text" class="muted">
          Bring your own words (optional, one per line)
        </label>
        <textarea id="deck-text" spellcheck="false"></textarea>
        <div id="deck-errors" class="warning" hidden></div>
        <p id="deck-warning" class="muted" hidden></p>

        <div class="actions">
          <button id="start-session" type="button">Start a session</button>
        </div>
      </section>
```

- [ ] **Step 3: Update the game-screen markup**

Replace:

```html
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
```

with:

```html
      <section id="game-screen" hidden>
        <p id="cookie-warning" class="warning" hidden>
          Cookies are blocked in this browser, so your card will reset if
          you reload this page.
        </p>

        <div id="deck-broken" hidden>
          <p id="deck-broken-message" class="warning"></p>
          <p><a id="deck-broken-back" href="?">Start a new session</a></p>
        </div>

        <div id="game-content">
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
        </div>
      </section>
```

- [ ] **Step 4: Replace the module script**

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
        sessionKey,
      } from './session.js';
      import { parseDeckText, deckWarning, isDefaultDeck } from './customDeck.js';

      const startScreen = document.getElementById('start-screen');
      const gameScreen = document.getElementById('game-screen');
      const startButton = document.getElementById('start-session');
      const deckTextArea = document.getElementById('deck-text');
      const deckErrors = document.getElementById('deck-errors');
      const deckWarningEl = document.getElementById('deck-warning');
      const cookieWarning = document.getElementById('cookie-warning');
      const deckBroken = document.getElementById('deck-broken');
      const deckBrokenMessage = document.getElementById('deck-broken-message');
      const deckBrokenBack = document.getElementById('deck-broken-back');
      const gameContent = document.getElementById('game-content');
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
        deckTextArea.value = DECK.join('\n');

        function updateDeckWarning() {
          const { phrases } = parseDeckText(deckTextArea.value);
          const warning = deckWarning(phrases);
          deckWarningEl.textContent = warning ?? '';
          deckWarningEl.hidden = warning === null;
        }
        deckTextArea.addEventListener('input', updateDeckWarning);
        updateDeckWarning();

        startButton.addEventListener('click', () => {
          const { phrases, errors } = parseDeckText(deckTextArea.value);
          if (errors.length > 0) {
            deckErrors.textContent = errors.join('\n');
            deckErrors.hidden = false;
            return;
          }
          deckErrors.hidden = true;

          const params = new URLSearchParams();
          params.set('s', mintCode());
          if (!isDefaultDeck(phrases)) {
            params.set('d', phrases.join('\n'));
          }
          location.search = params.toString();
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

        const urlParams = new URLSearchParams(location.search);
        const rawDeckParam = urlParams.get('d');

        let deck = DECK;
        if (rawDeckParam !== null) {
          const { phrases } = parseDeckText(rawDeckParam);
          if (phrases.length < CELL_COUNT) {
            deckBrokenMessage.textContent = `This session's word list looks broken (need ${CELL_COUNT} phrases, this link has ${phrases.length}).`;
            deckBrokenBack.href = location.pathname;
            deckBroken.hidden = false;
            gameContent.hidden = true;
            return;
          }
          deck = phrases;
        }

        // Backward compatibility (see the plan's Implementation Notes):
        // with no custom deck, the seed and the marks-cookie tag are
        // byte-identical to every session link from before this feature.
        const deckText = rawDeckParam !== null ? deck.join('\n') : null;
        const id = loadIdentity();
        const seedInput =
          deckText !== null ? `${sessionCode}:${id}:${deckText}` : `${sessionCode}:${id}`;
        const key = sessionKey(sessionCode, deckText);

        const card = buildCard(deck, seededRng(hashSeed(seedInput)));
        const marked = loadMarks(key);

        const cells = Array.from({ length: CELL_COUNT }, (_, index) => {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cell';
          cell.addEventListener('click', () => {
            marked[index] = !marked[index];
            saveMarks(key, marked);
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
          const newParams = new URLSearchParams();
          newParams.set('s', mintCode());
          if (rawDeckParam !== null) {
            newParams.set('d', rawDeckParam);
          }
          location.search = newParams.toString();
        });

        render();
      }
    </script>
```

- [ ] **Step 5: Confirm the automated suite is unaffected**

Run: `npm test`
Expected: PASS, `# pass 65` (this task only touches `index.html`, which no test imports)

- [ ] **Step 6: Manual browser verification**

Run: `npm run serve` (or use the existing `.claude/launch.json` preview), then in a browser:

1. Open the bare URL — start screen appears, and the textarea is prefilled with the full built-in deck (108 lines).
2. Click "Start a session" without touching the textarea — the resulting URL has `?s=` only, no `?d=`. Confirm via the browser's address bar or `location.href` in devtools.
3. Go back to the start screen, delete all but 10 lines, click "Start a session" — an inline error appears (`need 15 more phrases...`), and the page does not navigate.
4. Restore the textarea (reload the start screen fresh), change exactly one phrase's text, click "Start a session" — the resulting URL now has a `?d=` parameter, and the game screen shows the edited word list.
5. Reload that same URL — identical card, identical marks-tag behavior (mark a few cells first, then reload, and confirm marks persist — same check as the lobby-sessions manual pass, now with a custom deck in play).
6. Paste in 160 short unique lines (e.g. `Phrase 1` through `Phrase 160`) and watch the warning appear live, before clicking "Start a session" — it should be visible while still on the start screen, not just flash by. Starting should still succeed.
7. Manually edit a shared custom-deck link's `?d=` value in the address bar to `?d=onlyone` (single short phrase) and load it — the game screen shows "This session's word list looks broken (need 25 phrases, this link has 1)." with a working "Start a new session" link, and no grid is rendered.
8. From a game screen with a custom deck active, click "New session" and accept the confirm — the new URL keeps the same `?d=` value (same word list) with a freshly minted `?s=`.
9. Open a session with no custom deck (`?s=` only, from before this feature or freshly minted with an untouched textarea) — confirm this still behaves exactly as before: same card on reload, marks persist, "New session" produces a bare `?s=` link.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: wire custom decks into index.html

Adds a prefilled, editable word-list textarea to the start screen.
Untouched or merely-reordered text produces no ?d= parameter, keeping
every pre-existing session link byte-identical in both its card seed
and its marks-cookie tag. An edited deck travels in ?d=, folds into
both the seed and a short marks-tag fingerprint, and a hand-broken
?d= value shows a recoverable error on the game screen instead of a
missing grid."
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: PASS, `# pass 65`, `# fail 0`

- [ ] **Step 2: Re-run the manual browser pass from Task 5, Step 6, start to finish**

All nine checks must hold.

- [ ] **Step 3: Confirm `deck.js` is untouched**

Run: `git diff main --stat -- deck.js`
Expected: no output — `deck.js` stays data-only, per ADR 0001 decision 3 and this plan's Global Constraints.

- [ ] **Step 4: Review the full diff against the spec one more time**

Run: `git log --oneline 3dbb9c3..HEAD`
Expected: five commits (Tasks 1–5 above, in order; this task has none). `3dbb9c3` is the lobby-sessions merge commit on `main` — the tip before this feature's work begins.
