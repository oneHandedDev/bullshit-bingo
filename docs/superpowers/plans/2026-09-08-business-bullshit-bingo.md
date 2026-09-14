# Business Bullshit Bingo Implementation Plan

> **Status: executed and historical — do not implement from this document.**
> All seven tasks were completed on 2026-09-08. The card was **later grown from
> 4×4 to 5×5** (commit `40bdbba`, 2026-09-14), so every `4`, `16` and `10` in the
> task text below — card size, cell count, line count, test expectations, the
> emoji grids — describes the shipped-then code, not the current code. The
> geometry that is true today lives in the
> [spec](../specs/2026-09-08-business-bullshit-bingo-design.md) and in
> `bingo.js`'s `CARD_SIZE`. This plan is kept as the record of what was built and
> reviewed, which is why it was not rewritten in place.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dependency-free static page where each colleague gets their own randomized 4×4 corporate-buzzword bingo card, marks squares during a meeting, and can copy a Wordle-style emoji result into Slack or Teams.

**Architecture:** Pure game logic lives in `bingo.js` as ES-module functions with no DOM access and injectable randomness, so it is unit tested with Node's built-in test runner. `index.html` owns all markup, CSS, state, and event wiring and imports that module in the browser. No build step, no dependencies, no server.

**Tech Stack:** Hand-written HTML/CSS/JavaScript (ES modules), `node --test` with `node:assert`, GitHub Pages. Node v20.19.5 verified on the dev machine.

**Spec:** [docs/superpowers/specs/2026-09-08-business-bullshit-bingo-design.md](../specs/2026-09-08-business-bullshit-bingo-design.md)

**ADR:** [docs/adr/0001-dependency-free-static-app-with-pure-logic-module.md](../../adr/0001-dependency-free-static-app-with-pure-logic-module.md)

## Global Constraints

- **Zero runtime and dev dependencies.** No `npm install` at any point. No lockfile. `package.json` exists only to set `"type": "module"`.
- **No build step.** The committed files are the deployed files.
- **`bingo.js` must never touch the DOM**, `window`, `document`, or `Math.random` implicitly — randomness is always an injected `rng` parameter defaulting to `Math.random`.
- **Card geometry:** `CARD_SIZE = 4`, `CELL_COUNT = 16`, 10 winning lines (4 rows, 4 columns, 2 diagonals). No free space.
- **Card state is in memory only.** No `localStorage`, no cookies, no query parameters. A reload starts a new card. This is deliberate — do not add persistence.
- **UI language is English.** App title is exactly `Business Bullshit Bingo`.
- **Deck phrases:** unique, trimmed, non-empty, at most 40 characters each.
- **Share text never contains the phrases** — emoji grid, count, and line names only.
- **Node version floor:** Node 20 (for `node --test` with ES modules).
- **Tests are run with `node --test`** from the repository root and must all pass before each commit.
- Every task ends with a commit. Commit messages use Conventional Commits and end with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Declares `"type": "module"` so Node parses `.js` as ES modules. Nothing else. |
| `bingo.js` | Pure game logic: geometry constants, line table, line naming, shuffle, card building, win detection, share formatting. |
| `deck.js` | The phrase deck — a single exported array of strings. Data only, no logic. |
| `bingo.test.js` | All automated tests. Imports `bingo.js` and `deck.js`. Contains its own seeded RNG helper. |
| `index.html` | Markup, CSS, state, rendering, and event handlers. The only file that touches the DOM. |
| `README.md` | How to play, how to run tests, how to serve locally, how to deploy. |

---

### Task 1: Project scaffold and card geometry

Creates the module setup and the geometry layer everything else builds on: the constants, the 10-line table derived from `CARD_SIZE`, and human-readable line names used later by the share text and the BINGO banner.

**Files:**
- Create: `package.json`
- Create: `bingo.js`
- Test: `bingo.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `CARD_SIZE: number` — `4`
  - `CELL_COUNT: number` — `16`
  - `TITLE: string` — `"Business Bullshit Bingo"`
  - `LINES: number[][]` — 10 lines of 4 flat cell indices, ordered: 4 rows, then 4 columns, then main diagonal (`↘`), then anti-diagonal (`↙`)
  - `lineName(lineIndex: number): string` — `"row 1"`…`"row 4"`, `"column 1"`…`"column 4"`, `"diagonal ↘"`, `"diagonal ↙"`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "business-bullshit-bingo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Corporate buzzword bingo for meetings. No dependencies, no build step.",
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 8000"
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `bingo.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_SIZE, CELL_COUNT, LINES, TITLE, lineName } from './bingo.js';

test('card geometry is 4x4 with 16 cells', () => {
  assert.equal(CARD_SIZE, 4);
  assert.equal(CELL_COUNT, 16);
});

test('TITLE is the app name', () => {
  assert.equal(TITLE, 'Business Bullshit Bingo');
});

test('LINES has 10 lines of 4 cells each', () => {
  assert.equal(LINES.length, 10);
  for (const line of LINES) {
    assert.equal(line.length, CARD_SIZE);
  }
});

test('LINES contains the expected rows, columns and diagonals', () => {
  assert.deepEqual(LINES, [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
    [0, 5, 10, 15],
    [3, 6, 9, 12],
  ]);
});

test('every cell index appears in at least one line', () => {
  const covered = new Set(LINES.flat());
  for (let i = 0; i < CELL_COUNT; i += 1) {
    assert.ok(covered.has(i), `cell ${i} is in no line`);
  }
});

test('lineName describes rows, columns and diagonals', () => {
  assert.equal(lineName(0), 'row 1');
  assert.equal(lineName(3), 'row 4');
  assert.equal(lineName(4), 'column 1');
  assert.equal(lineName(7), 'column 4');
  assert.equal(lineName(8), 'diagonal ↘');
  assert.equal(lineName(9), 'diagonal ↙');
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
node --test
```

Expected: FAIL — `Cannot find module` for `./bingo.js`.

- [ ] **Step 4: Write the minimal implementation**

Create `bingo.js`:

```js
export const CARD_SIZE = 4;
export const CELL_COUNT = CARD_SIZE * CARD_SIZE;
export const TITLE = 'Business Bullshit Bingo';

function buildLines(size) {
  const lines = [];
  for (let row = 0; row < size; row += 1) {
    lines.push(Array.from({ length: size }, (_, col) => row * size + col));
  }
  for (let col = 0; col < size; col += 1) {
    lines.push(Array.from({ length: size }, (_, row) => row * size + col));
  }
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return lines;
}

/** 10 winning lines: 4 rows, 4 columns, main diagonal, anti-diagonal. */
export const LINES = buildLines(CARD_SIZE);

/** Human-readable name for a line index, e.g. "row 1" or "diagonal ↘". */
export function lineName(lineIndex) {
  if (lineIndex < CARD_SIZE) {
    return `row ${lineIndex + 1}`;
  }
  if (lineIndex < CARD_SIZE * 2) {
    return `column ${lineIndex - CARD_SIZE + 1}`;
  }
  return lineIndex === CARD_SIZE * 2 ? 'diagonal ↘' : 'diagonal ↙';
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test
```

Expected: PASS — 6 tests passing, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add package.json bingo.js bingo.test.js
git commit -m "feat: add card geometry and line table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Shuffle and card building

Adds the randomization layer. `shuffle` is a plain Fisher-Yates that takes its randomness as a parameter, which is what makes every later test deterministic. `buildCard` draws 16 phrases and refuses to run on a deck too small to fill a card.

**Files:**
- Modify: `bingo.js` (append)
- Test: `bingo.test.js` (append)

**Interfaces:**
- Consumes: `CELL_COUNT` from Task 1.
- Produces:
  - `shuffle(items: T[], rng?: () => number): T[]` — returns a new array, does not mutate `items`
  - `buildCard(deck: string[], rng?: () => number): string[]` — exactly `CELL_COUNT` entries; throws `RangeError` when `deck.length < CELL_COUNT`

- [ ] **Step 1: Write the failing tests**

Append to `bingo.test.js` — and add `shuffle, buildCard` to the existing import from `./bingo.js`:

```js
/**
 * Deterministic linear congruential generator, so shuffles are reproducible.
 * Same numeric constants as Numerical Recipes; quality is irrelevant here,
 * repeatability is the whole point.
 */
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const NUMBERS = Array.from({ length: 20 }, (_, i) => `phrase ${i}`);

test('shuffle returns a permutation without mutating the input', () => {
  const input = [...NUMBERS];
  const result = shuffle(input, seededRng(1));

  assert.equal(result.length, input.length);
  assert.deepEqual([...result].sort(), [...input].sort());
  assert.deepEqual(input, NUMBERS, 'input array was mutated');
  assert.notStrictEqual(result, input, 'shuffle returned the same array reference');
});

test('shuffle with the same seed produces the same order', () => {
  assert.deepEqual(shuffle(NUMBERS, seededRng(42)), shuffle(NUMBERS, seededRng(42)));
});

test('shuffle with different seeds produces different orders', () => {
  assert.notDeepEqual(shuffle(NUMBERS, seededRng(1)), shuffle(NUMBERS, seededRng(9)));
});

test('buildCard returns 16 unique phrases drawn from the deck', () => {
  const card = buildCard(NUMBERS, seededRng(7));

  assert.equal(card.length, 16);
  assert.equal(new Set(card).size, 16, 'card contains duplicates');
  for (const phrase of card) {
    assert.ok(NUMBERS.includes(phrase), `"${phrase}" is not in the deck`);
  }
});

test('buildCard works with a deck of exactly 16 phrases', () => {
  const exact = NUMBERS.slice(0, 16);
  const card = buildCard(exact, seededRng(3));

  assert.deepEqual([...card].sort(), [...exact].sort());
});

test('buildCard throws RangeError on a deck too small to fill a card', () => {
  assert.throws(() => buildCard(NUMBERS.slice(0, 15), seededRng(3)), RangeError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test
```

Expected: FAIL — `shuffle is not a function` / `buildCard is not a function` (the Task 1 tests still pass).

- [ ] **Step 3: Write the minimal implementation**

Append to `bingo.js`:

```js
/** Fisher-Yates shuffle. Returns a new array; `rng` is injectable for tests. */
export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Draws CELL_COUNT distinct phrases from `deck` as a flat card. */
export function buildCard(deck, rng = Math.random) {
  if (deck.length < CELL_COUNT) {
    throw new RangeError(
      `deck needs at least ${CELL_COUNT} phrases, got ${deck.length}`,
    );
  }
  return shuffle(deck, rng).slice(0, CELL_COUNT);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test
```

Expected: PASS — 12 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add bingo.js bingo.test.js
git commit -m "feat: add seeded shuffle and card building

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Win detection

Adds `findWins`, which reports *every* completed line rather than the first. The UI needs all of them to outline simultaneous wins, and the share text needs all of them to name the lines.

**Files:**
- Modify: `bingo.js` (append)
- Test: `bingo.test.js` (append)

**Interfaces:**
- Consumes: `LINES`, `CELL_COUNT` from Task 1.
- Produces:
  - `findWins(marked: boolean[]): number[]` — indices into `LINES` for every fully-marked line, in `LINES` order; `[]` when there is no bingo

- [ ] **Step 1: Write the failing tests**

Append to `bingo.test.js` — and add `findWins` to the existing import from `./bingo.js`:

```js
/** Builds a 16-element boolean array with the given cell indices marked. */
function markCells(...cells) {
  const marked = new Array(CELL_COUNT).fill(false);
  for (const cell of cells) {
    marked[cell] = true;
  }
  return marked;
}

test('findWins returns no wins for an empty card', () => {
  assert.deepEqual(findWins(new Array(CELL_COUNT).fill(false)), []);
});

test('findWins returns no wins for a partially marked line', () => {
  assert.deepEqual(findWins(markCells(0, 1, 2)), []);
});

test('findWins detects each line on its own', () => {
  LINES.forEach((line, index) => {
    assert.deepEqual(
      findWins(markCells(...line)),
      [index],
      `line ${index} (${lineName(index)}) was not detected`,
    );
  });
});

test('findWins reports both lines when two intersecting lines are complete', () => {
  // Top row [0,1,2,3] plus first column [0,4,8,12], sharing cell 0.
  const wins = findWins(markCells(0, 1, 2, 3, 4, 8, 12));

  assert.deepEqual(wins, [0, 4]);
});

test('findWins reports all 10 lines for a full card', () => {
  const wins = findWins(new Array(CELL_COUNT).fill(true));

  assert.deepEqual(wins, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test
```

Expected: FAIL — `findWins is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `bingo.js`:

```js
/** Indices into LINES for every fully marked line. Empty means no bingo. */
export function findWins(marked) {
  const wins = [];
  LINES.forEach((line, index) => {
    if (line.every((cell) => marked[cell])) {
      wins.push(index);
    }
  });
  return wins;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test
```

Expected: PASS — 17 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add bingo.js bingo.test.js
git commit -m "feat: add win detection across rows, columns and diagonals

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Share text formatting

Adds the clipboard string. Deliberately excludes the phrases — the emoji grid is the brag, and pasting 16 buzzwords into a work channel is worse.

Target output with a completed top row and three scattered marks:

```
Business Bullshit Bingo — BINGO 🎉
🟩🟩🟩🟩
⬜🟩⬜⬜
⬜⬜🟩⬜
🟩⬜⬜⬜
7/16 heard · row 1
```

**Files:**
- Modify: `bingo.js` (append)
- Test: `bingo.test.js` (append)

**Interfaces:**
- Consumes: `CARD_SIZE`, `CELL_COUNT`, `TITLE`, `lineName` from Task 1.
- Produces:
  - `formatShare(marked: boolean[], wins: number[]): string` — header line, `CARD_SIZE` emoji rows, footer line, joined with `\n`. Takes no card argument by design.

- [ ] **Step 1: Write the failing tests**

Append to `bingo.test.js` — and add `formatShare` to the existing import from `./bingo.js`:

```js
test('formatShare without wins omits BINGO and reports the count', () => {
  const marked = markCells(0, 5);
  const text = formatShare(marked, []);

  assert.deepEqual(text.split('\n'), [
    'Business Bullshit Bingo',
    '🟩⬜⬜⬜',
    '⬜🟩⬜⬜',
    '⬜⬜⬜⬜',
    '⬜⬜⬜⬜',
    '2/16 heard',
  ]);
});

test('formatShare with an empty card reports 0 of 16', () => {
  const text = formatShare(new Array(CELL_COUNT).fill(false), []);

  assert.match(text, /^Business Bullshit Bingo\n/);
  assert.ok(text.endsWith('0/16 heard'));
  assert.ok(!text.includes('🟩'));
});

test('formatShare with one win announces BINGO and names the line', () => {
  const marked = markCells(0, 1, 2, 3, 5, 10, 12);
  const text = formatShare(marked, findWins(marked));

  assert.deepEqual(text.split('\n'), [
    'Business Bullshit Bingo — BINGO 🎉',
    '🟩🟩🟩🟩',
    '⬜🟩⬜⬜',
    '⬜⬜🟩⬜',
    '🟩⬜⬜⬜',
    '7/16 heard · row 1',
  ]);
});

test('formatShare names every winning line, comma separated', () => {
  const marked = markCells(0, 1, 2, 3, 4, 8, 12);
  const text = formatShare(marked, findWins(marked));

  assert.ok(text.endsWith('7/16 heard · row 1, column 1'), text);
});

test('formatShare never leaks phrases', () => {
  const marked = markCells(0, 1, 2, 3);
  const text = formatShare(marked, findWins(marked));

  assert.ok(!text.includes('phrase'), text);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test
```

Expected: FAIL — `formatShare is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `bingo.js`:

```js
const MARKED_EMOJI = '🟩';
const UNMARKED_EMOJI = '⬜';

/**
 * Clipboard summary: title, an emoji grid, and a count. Phrases are
 * intentionally left out — the grid is the brag.
 */
export function formatShare(marked, wins) {
  const header = wins.length > 0 ? `${TITLE} — BINGO 🎉` : TITLE;

  const rows = [];
  for (let row = 0; row < CARD_SIZE; row += 1) {
    const start = row * CARD_SIZE;
    rows.push(
      marked
        .slice(start, start + CARD_SIZE)
        .map((isMarked) => (isMarked ? MARKED_EMOJI : UNMARKED_EMOJI))
        .join(''),
    );
  }

  const heard = marked.filter(Boolean).length;
  const footer =
    wins.length > 0
      ? `${heard}/${CELL_COUNT} heard · ${wins.map(lineName).join(', ')}`
      : `${heard}/${CELL_COUNT} heard`;

  return [header, ...rows, footer].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test
```

Expected: PASS — 22 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add bingo.js bingo.test.js
git commit -m "feat: add emoji share summary for clipboard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The phrase deck

Adds the content. 108 phrases means two colleagues drawing 16 each overlap barely, so cards feel individual. The integrity test guards the constraints that keep the grid renderable and the game fair.

**Files:**
- Create: `deck.js`
- Test: `bingo.test.js` (append)

**Interfaces:**
- Consumes: `buildCard`, `CELL_COUNT` from Tasks 1–2.
- Produces:
  - `DECK: string[]` — 108 unique, trimmed phrases, each at most 40 characters

- [ ] **Step 1: Write the failing tests**

Append to `bingo.test.js`, and add this import at the top of the file next to the existing one:

```js
import { DECK } from './deck.js';
```

Then the tests:

```js
test('DECK has 108 phrases', () => {
  assert.equal(DECK.length, 108);
});

test('DECK phrases are unique', () => {
  assert.equal(new Set(DECK).size, DECK.length);
});

test('DECK phrases are trimmed, non-empty and at most 40 characters', () => {
  for (const phrase of DECK) {
    assert.equal(typeof phrase, 'string');
    assert.equal(phrase, phrase.trim(), `"${phrase}" has surrounding whitespace`);
    assert.ok(phrase.length > 0, 'DECK contains an empty phrase');
    assert.ok(phrase.length <= 40, `"${phrase}" is ${phrase.length} characters`);
  }
});

test('DECK is large enough that consecutive cards differ', () => {
  const first = buildCard(DECK, seededRng(11));
  const second = buildCard(DECK, seededRng(12));

  assert.equal(first.length, CELL_COUNT);
  assert.notDeepEqual(first, second);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test
```

Expected: FAIL — `Cannot find module` for `./deck.js`.

- [ ] **Step 3: Create `deck.js`**

```js
/**
 * The phrase deck. Data only — no logic lives here.
 * Constraints enforced by bingo.test.js: unique, trimmed, non-empty,
 * at most 40 characters so a phrase still fits a 4x4 cell on a phone.
 */
export const DECK = [
  "Let's circle back",
  'Low-hanging fruit',
  'Move the needle',
  'Synergy',
  'Boil the ocean',
  'Take this offline',
  'At the end of the day',
  'Double-click on that',
  'Ping me',
  'Touch base',
  'Deep dive',
  'Drill down',
  'Bandwidth',
  'Peel the onion',
  'Boots on the ground',
  'Run it up the flagpole',
  'Park that for now',
  'Table stakes',
  'Best practice',
  'Paradigm shift',
  'Think outside the box',
  'Push the envelope',
  'Level set',
  'Socialize the idea',
  'On the same page',
  'Close the loop',
  'Loop me in',
  'Action items',
  'Actionable insights',
  'Key takeaways',
  'Quick win',
  'Value add',
  'Win-win',
  'Core competency',
  'Secret sauce',
  'Game changer',
  'Disruptive',
  'Holistic approach',
  'End-to-end',
  '360-degree view',
  'Helicopter view',
  'Big picture',
  'Granular',
  'Bleeding edge',
  'Best-of-breed',
  'Turnkey solution',
  'Scalable',
  'Future-proof',
  'Mission critical',
  'High-level',
  'Subject matter expert',
  'Stakeholder buy-in',
  'Sign-off',
  'Cross-functional',
  'Break down silos',
  'Dotted line',
  'Escalate',
  'All hands on deck',
  'Backlog grooming',
  'Story points',
  'Velocity',
  'Definition of done',
  'Blocker',
  'Parking lot',
  'MVP',
  'North star',
  'OKRs',
  'KPI',
  'Data-driven decision',
  'Single source of truth',
  'Guardrails',
  'Roadmap',
  'Headwinds',
  'Sunset that',
  'Do more with less',
  'Wear many hats',
  'Rockstar',
  'Culture fit',
  'The journey, not the destination',
  'Learnings',
  'Operationalize',
  'Bring to the table',
  'Streamline',
  'Optimize',
  'Fail fast',
  'Pivot',
  'Lean in',
  'Take ownership',
  'Empower the team',
  'Customer-centric',
  'Voice of the customer',
  'Value proposition',
  'Technical debt',
  'Unpack that',
  'Elephant in the room',
  'Swim lane',
  'Eat our own dog food',
  'Above my pay grade',
  "Let's take a step back",
  'Hard stop',
  "You're on mute",
  'Can everyone see my screen?',
  'This could have been an email',
  'Per my last email',
  "Let's find time",
  "I'll send an invite",
  'Keep me posted',
  'Circling back on this',
];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test
```

Expected: PASS — 26 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add deck.js bingo.test.js
git commit -m "feat: add the corporate buzzword deck

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The playable page

Wires the tested logic to a DOM. Cells are `<button>` elements so keyboard and screen-reader access come for free. `render()` redraws everything from state — there is no incremental patching to get wrong.

This task has no automated tests; its verification steps are browser checks. Do not skip them, and do not add a headless-browser rig.

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `DECK` from Task 5; `CELL_COUNT`, `LINES`, `buildCard`, `findWins`, `formatShare`, `lineName` from Tasks 1–4.
- Produces: nothing importable — this is the top of the dependency graph.

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Business Bullshit Bingo</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f4f4f1;
        --fg: #16181d;
        --muted: #5d626d;
        --cell-bg: #ffffff;
        --cell-border: #d2d5dc;
        --marked-bg: #2f6f4f;
        --marked-fg: #ffffff;
        --accent: #c4691b;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #14161a;
          --fg: #e8e9ec;
          --muted: #9ba1ad;
          --cell-bg: #1e2127;
          --cell-border: #33373f;
          --marked-bg: #3f8f66;
          --marked-fg: #0c0f12;
          --accent: #f0a94c;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 1rem;
        background: var(--bg);
        color: var(--fg);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        display: flex;
        justify-content: center;
      }

      main {
        width: 100%;
        max-width: 34rem;
      }

      h1 {
        font-size: clamp(1.1rem, 5vw, 1.6rem);
        margin: 0 0 0.75rem;
      }

      .actions {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }

      .actions button {
        flex: 1;
        padding: 0.6rem 0.5rem;
        font: inherit;
        font-size: 0.9rem;
        color: inherit;
        background: var(--cell-bg);
        border: 1px solid var(--cell-border);
        border-radius: 0.5rem;
        cursor: pointer;
      }

      .actions button:hover {
        border-color: var(--accent);
      }

      .banner {
        margin: 0 0 0.75rem;
        min-height: 1.4em;
        font-weight: 700;
        color: var(--accent);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.5rem;
      }

      .cell {
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        padding: 0.35rem;
        font: inherit;
        font-size: clamp(0.6rem, 2.7vw, 1rem);
        line-height: 1.15;
        text-align: center;
        overflow-wrap: anywhere;
        hyphens: auto;
        color: inherit;
        background: var(--cell-bg);
        border: 1px solid var(--cell-border);
        border-radius: 0.6rem;
        cursor: pointer;
      }

      .cell.marked {
        background: var(--marked-bg);
        color: var(--marked-fg);
        text-decoration: line-through;
      }

      .cell.winning {
        outline: 3px solid var(--accent);
        outline-offset: -3px;
      }

      .status {
        margin: 0.75rem 0 0;
        min-height: 1.4em;
        font-size: 0.85rem;
        color: var(--muted);
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Business Bullshit Bingo</h1>

      <div class="actions">
        <button id="new-card" type="button">New card</button>
        <button id="copy-result" type="button">Copy result</button>
      </div>

      <p id="banner" class="banner" aria-live="polite"></p>

      <div id="grid" class="grid" role="group" aria-label="Bingo card"></div>

      <p id="status" class="status" aria-live="polite"></p>
    </main>

    <script type="module">
      import { DECK } from './deck.js';
      import {
        CELL_COUNT,
        LINES,
        buildCard,
        findWins,
        formatShare,
        lineName,
      } from './bingo.js';

      const grid = document.getElementById('grid');
      const banner = document.getElementById('banner');
      const status = document.getElementById('status');

      let card = buildCard(DECK);
      let marked = new Array(CELL_COUNT).fill(false);

      const cells = Array.from({ length: CELL_COUNT }, (_, index) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.addEventListener('click', () => {
          marked[index] = !marked[index];
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

        banner.textContent =
          wins.length > 0 ? `BINGO — ${wins.map(lineName).join(', ')}` : '';
      }

      document.getElementById('new-card').addEventListener('click', () => {
        const inProgress = marked.some(Boolean);
        if (inProgress && !confirm('Start a new card? Current marks are lost.')) {
          return;
        }
        card = buildCard(DECK);
        marked = new Array(CELL_COUNT).fill(false);
        status.textContent = '';
        render();
      });

      document.getElementById('copy-result').addEventListener('click', async () => {
        const text = formatShare(marked, findWins(marked));
        try {
          await navigator.clipboard.writeText(text);
          status.textContent = 'Copied to clipboard.';
        } catch {
          status.textContent = `Copy failed — select and copy this:\n${text}`;
        }
      });

      render();
    </script>
  </body>
</html>
```

- [ ] **Step 2: Confirm the automated tests still pass**

```bash
node --test
```

Expected: PASS — 26 tests, unchanged. `index.html` must not have altered any module behavior.

- [ ] **Step 3: Serve the page locally**

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`. ES modules are blocked over `file://`, so opening the file directly will show an empty grid and a CORS error — use the server.

- [ ] **Step 4: Verify in the browser**

Check each, and open the devtools console to confirm it stays clean:

- 16 cells render, each with a different phrase from the deck.
- Clicking a cell fills it green and strikes the text through; clicking again unmarks it.
- Completing a top row shows `BINGO — row 1` in the banner and outlines all 4 cells in the accent color.
- Completing a diagonal shows `BINGO — diagonal ↘`.
- Completing a row and a column shows both names, comma-separated.
- Unmarking one cell of a winning line clears the banner and the outlines.
- "Copy result" reports `Copied to clipboard.`, and pasting into a text editor gives the emoji grid with the right count.
- "New card" on an untouched card rerolls immediately with no prompt; on a card with marks it asks first, and cancelling keeps the card intact.
- Tab moves focus between cells and Enter/Space toggles the focused one.
- At a 375px-wide viewport the grid fits without horizontal scrolling and the longest phrase (`The journey, not the destination`) stays inside its cell.
- Switching the OS to dark mode repaints the page with the dark palette.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add playable 4x4 bingo card page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: README and deployment

Documents the app for colleagues and for the next person to touch the code, then ships it.

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing importable.

- [ ] **Step 1: Create `README.md`**

```markdown
# Business Bullshit Bingo

Corporate buzzword bingo for meetings. Open the link, get your own random
4×4 card, tap a square whenever someone actually says the phrase.

**Play:** <https://REPLACE_WITH_PAGES_URL>

Everyone who opens the link gets an independently randomized card from the
same 108-phrase deck, so no two colleagues get the same board. First to fill
a row, column, or diagonal wins. Hit **Copy result** and paste the emoji grid
into the team chat to prove it.

There is no server and no sync — the app never sends anything anywhere, and
nothing is stored. Reloading the page starts a fresh card, so don't reload
mid-meeting.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole UI: markup, CSS, state, event handlers. |
| `bingo.js` | Pure game logic — shuffle, card building, win detection, share text. No DOM. |
| `deck.js` | The 108 phrases. |
| `bingo.test.js` | Tests for `bingo.js` and the deck. |
| `package.json` | Sets `"type": "module"`. No dependencies. |

## Development

No dependencies, no build step. Requires Node 20+ for the test runner.

Run the tests:

    node --test

Serve locally (ES modules do not load over `file://`):

    python3 -m http.server 8000

then open <http://localhost:8000/>.

To add a phrase, append it to the array in `deck.js`, bump the expected count
in the `DECK has 108 phrases` test, and run `node --test`. Phrases must be
unique, trimmed, and at most 40 characters so they still fit a cell on a phone.

## Deploy

The committed files are the deployed files. Push to `main`, then in the
repository's **Settings → Pages** set the source to `main` / `/ (root)`.

## Design docs

- [Design spec](docs/superpowers/specs/2026-09-08-business-bullshit-bingo-design.md)
- [ADR 0001 — dependency-free static app with a pure logic module](docs/adr/0001-dependency-free-static-app-with-pure-logic-module.md)
```

- [ ] **Step 2: Run the full test suite one last time**

```bash
node --test
```

Expected: PASS — 26 tests passing, 0 failing.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with play, dev and deploy instructions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and enable Pages**

This step needs the user — it publishes the app and requires their GitHub account.

Confirm with the user, then:

```bash
git remote add origin git@github.com:USER/business-bullshit-bingo.git
git push -u origin main
```

Then ask the user to set **Settings → Pages → Source** to `main` / `/ (root)`, and once the URL is live, replace `REPLACE_WITH_PAGES_URL` in `README.md` with it and commit.

---

## Verification Summary

After Task 7, all of the following must hold:

- `node --test` reports 26 passing tests, 0 failing.
- The repository contains exactly six source files plus `docs/`, and no `node_modules` or lockfile.
- `grep -rn "localStorage\|sessionStorage\|fetch(\|XMLHttpRequest" index.html bingo.js deck.js` returns nothing — no persistence, no network.
- `grep -n "document\|window\|Math.random()" bingo.js` shows only the `rng = Math.random` default parameters and no DOM access.
- The browser checks in Task 6 Step 4 have all been performed by hand.
