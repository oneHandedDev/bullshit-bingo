# Business Bullshit Bingo — Design

**Date:** 2026-09-08
**Status:** Approved

## Purpose

A web page colleagues open at the start of a meeting. Each person gets a randomized 5×5 bingo card of corporate buzzwords, taps squares as the phrases are actually said, and gets a BINGO when a row, column, or diagonal fills up. Winning is bragged about by pasting a Wordle-style emoji grid into Slack or Teams.

## Scope Decisions

These were settled during brainstorming and bound the design:

- **Play mode:** solo cards from a shared link. No backend, no accounts, no real-time sync. Everyone opens the same URL and gets an independently randomized card.
- **Deck:** one fixed, curated English deck shipped with the app. No editing, no custom decks, no deck switching.
- **Card:** 5×5, 25 phrases, no free space.
- **Win:** any full row, column, or diagonal.
- **State:** in memory only. No localStorage, no persistence.
- **Extras:** copy-result-to-clipboard only. No confetti, no sound, no resume, no stats.
- **Stack:** hand-written HTML/CSS/JS, no build step, no dependencies. Hosted on GitHub Pages.

### Accepted trade-off

Because there is no persistence, a page reload mid-meeting discards the card and all marks. This is deliberate. Adding `localStorage` later is a small, isolated change (serialize `card` + `marked` on mutation, hydrate on load) and does not affect any interface in this design.

## Architecture

Two-layer split so the game logic can be unit tested without a DOM:

```
index.html      markup, CSS, DOM wiring, event handlers
bingo.js        pure game logic — no DOM, no globals
deck.js         the phrase deck (array of strings)
bingo.test.js   tests for bingo.js, run with `node --test`
package.json    {"type": "module"} only — no dependencies
README.md       how to play, how to deploy
```

`package.json` exists solely so Node treats `.js` files as ES modules; without it `node --test` parses them as CommonJS and every `import` fails. It declares no dependencies and there is no lockfile.

`index.html` loads `bingo.js` and `deck.js` as ES modules (`<script type="module">`). Serving over `file://` is blocked by module CORS rules, so local development uses any static server; production is GitHub Pages, which serves over HTTP.

No bundler, no `node_modules`, no transpilation. `node --test` runs the test file directly against the same ES modules the browser loads.

## Module: `deck.js`

```js
export const DECK = [ /* ~100 strings */ ];
```

Approximately 100 English corporate phrases — enough that two colleagues drawing 25 each get visibly different cards, sharing roughly six phrases on average (25 × 25 ÷ 108). Content is curated buzzword-speak: "let's circle back", "low-hanging fruit", "move the needle", "boil the ocean", "align on this offline", "at the end of the day", "double-click on that", "take it away from here", and so on. Phrases are kept short enough to render in a grid cell on a phone (target: under 30 characters, hard ceiling 40).

## Module: `bingo.js`

All functions are pure. Randomness enters only through an injected `rng` so tests are deterministic. Exports: `CARD_SIZE`, `CELL_COUNT`, `LINES`, `TITLE`, `lineName`, `shuffle`, `buildCard`, `findWins`, `formatShare`.

### `CARD_SIZE = 5`, `CELL_COUNT = 25`

### `LINES`

A precomputed array of 12 lines, each an array of 5 cell indices into the flat 25-element card:

- 5 rows: `[0,1,2,3,4]`, `[5,6,7,8,9]`, `[10,11,12,13,14]`, `[15,16,17,18,19]`, `[20,21,22,23,24]`
- 5 columns: `[0,5,10,15,20]`, `[1,6,11,16,21]`, `[2,7,12,17,22]`, `[3,8,13,18,23]`, `[4,9,14,19,24]`
- 2 diagonals: `[0,6,12,18,24]`, `[4,8,12,16,20]`

Generated programmatically at module load rather than hand-written, so the derivation is visible and `CARD_SIZE` remains the single source of truth.

### `shuffle(items, rng = Math.random)`

Fisher-Yates. Returns a new array; does not mutate the input.

### `buildCard(deck, rng = Math.random)`

Shuffles `deck` and returns the first 25 entries as a flat array. Throws a `RangeError` if `deck.length < 25` — a deck too small to fill a card is a programming error, not a runtime condition to paper over.

### `findWins(marked)`

`marked` is a 25-element boolean array. Returns an array of indices into `LINES` for every line that is fully marked. Empty array means no bingo. Returning all winning lines rather than the first lets the UI highlight simultaneous wins and lets the share text name them.

### `formatShare(marked, wins)`

Returns the clipboard string:

```
Business Bullshit Bingo — BINGO 🎉
🟩🟩🟩🟩🟩
⬜🟩⬜⬜⬜
⬜⬜🟩⬜⬜
⬜⬜⬜🟩⬜
⬜⬜⬜⬜⬜
8/25 heard · row 1
```

Rules:

- Header ends with `— BINGO 🎉` when `wins` is non-empty, otherwise just the title.
- Five lines of five emoji: `🟩` for marked, `⬜` for unmarked.
- Footer: `<markedCount>/25 heard`, and when there are wins, ` · ` followed by the winning lines named human-readably (`row 1`, `column 3`, `diagonal ↘`, `diagonal ↙`), comma-separated.
- Phrases are deliberately omitted — the grid is the brag, and pasting 25 buzzwords into a work channel is worse.

## UI (`index.html`)

**Header:** title, a "New card" button, a "Copy result" button.

**Grid:** a CSS grid, `grid-template-columns: repeat(5, minmax(0, 1fr))`, square cells via `aspect-ratio: 1`. Each cell is a `<button>` so keyboard and screen-reader access come for free; `aria-pressed` reflects marked state. Phrase text is centered and scaled with `clamp()` so the longest phrases still fit at 5×5 on a narrow phone.

**Interaction:** clicking or tapping a cell toggles its mark. After each toggle the app recomputes `findWins` and re-renders.

**Marked cell:** filled background, strikethrough text.

**Winning line:** an accent outline on every cell belonging to a winning line, plus a banner above the grid reading "BINGO" (with the line name). The banner is `aria-live="polite"` so a win is announced rather than only shown.

**New card:** rebuilds `card` from the deck and clears all marks. Since a card in progress is not recoverable, the button confirms only when at least one cell is marked.

**Copy result:** writes `formatShare(...)` via `navigator.clipboard.writeText`. On success a short inline status line confirms it. On failure (older browser, insecure context) the status line says the copy failed and renders the share text itself, so it can be selected and copied by hand. The failure is never silent.

**Styling:** mobile-first, single column layout, no external fonts or assets. Light and dark palettes via `prefers-color-scheme`.

## Data Flow

```
load → buildCard(DECK) → card: string[25]
                       → marked: boolean[25] (all false)
                       → render()

tap cell i → marked[i] = !marked[i]
           → wins = findWins(marked)
           → render(card, marked, wins)

New card  → (confirm if any marked) → buildCard(DECK), marked reset → render()
Copy      → formatShare(marked, findWins(marked)) → clipboard
```

State lives in two module-scoped variables in `index.html`'s script. `render()` is a single function that redraws cell classes, `aria-pressed`, and the banner from state — there is no incremental DOM patching to get wrong.

## Error Handling

- `buildCard` with an undersized deck throws `RangeError`. This can only happen if `deck.js` is edited badly; the test suite covers it.
- Clipboard write rejection is caught and falls back to manual copy (above). It is never silent.
- No network requests, no storage, no user input parsing — so there is no other failure surface.

## Testing

TDD against `bingo.js` using the built-in `node --test` runner and `node:assert`. No test dependencies.

A seeded generator (small LCG in the test file) is passed as `rng` so shuffles are reproducible.

Cases:

1. `shuffle` returns a permutation — same length, same multiset, input unmutated.
2. `shuffle` with a seeded rng is deterministic across calls.
3. `buildCard` returns exactly 25 entries.
4. `buildCard` entries are unique and all come from the deck.
5. `buildCard` with a 15-phrase deck throws `RangeError`.
6. `buildCard` with exactly 25 phrases succeeds and uses all of them.
7. `LINES` has 12 entries, each of length 5, and every cell index 0–24 appears in at least one line.
8. `findWins` on an all-false array returns `[]`.
9. `findWins` detects each of the 12 lines individually — table-driven over `LINES`.
10. `findWins` returns both lines when two intersecting lines are complete.
11. `findWins` on an all-true array returns all 12 lines.
12. `formatShare` with no wins: title has no `BINGO`, grid matches marks, footer count correct.
13. `formatShare` with one win: header has `BINGO 🎉`, footer names the line.
14. `formatShare` with multiple wins: all lines named, comma-separated.

DOM behavior (tap toggling, banner, clipboard fallback, responsive layout) is verified manually in a browser at phone and desktop widths. Adding a headless-browser test rig is not justified for a page this size.

## Deployment

Push to `main`; enable GitHub Pages serving from the repository root. No workflow file, no build step — the committed files are the deployed files. The shared link is the Pages URL.

## Out of Scope

Explicitly not built, listed so it stays decided: live shared rooms, per-room phrase pools, custom or multiple decks, deck editing, localStorage resume, win history or stats, sound, confetti, i18n, and any server component.
