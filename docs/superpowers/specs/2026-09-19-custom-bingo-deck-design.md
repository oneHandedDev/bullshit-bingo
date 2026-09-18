# Business Bullshit Bingo — Custom Decks — Design

**Date:** 2026-09-19
**Status:** Draft — awaiting review
**Depends on:** [2026-09-18-bullshit-bingo-lobby-design.md](2026-09-18-bullshit-bingo-lobby-design.md) (session codes, URL/cookie protocol)

## Purpose

Let the person starting a session bring their own phrase list instead of the fixed 108-phrase deck in `deck.js` — a standup team, a sales org, or a different company's meeting culture can all play with their own words, without a fork or a commit.

## Scope Decisions

Settled during brainstorming; these bound the design:

- **Deck scope is per-session, not per-player.** One deck per session, chosen by whoever starts it, shared with everyone who opens that link — matching how the session code itself already works.
- **Authoring is a prefilled textarea**, not a file upload and not a preset picker. The start screen's textarea is prefilled with the built-in `DECK`, one phrase per line, editable before starting.
- **The deck travels in the URL**, in a `?d=` parameter alongside the existing `?s=` session code. No backend, no third-party paste service — consistent with ADR 0001 decision 1.
- **Untouched or merely reordered text produces no `?d=` at all.** The parsed phrase set is compared against `DECK` as a set; an exact match means "no custom deck," keeping today's short link and cookie tag for the common case where nobody edits anything.
- **Validation is inline, before navigating.** A paste that doesn't parse into at least `CELL_COUNT` (25) valid, unique, ≤40-character phrases blocks "Start a session" with an inline message — it does not silently fail after the link has already been shared.
- **A large deck gets a warning, not a rejection.** Past a soft cap (150 phrases), a non-blocking notice mentions that the invite link is getting long. No hard limit.
- **A deck is fixed for the session's lifetime**, exactly like the session code — no mid-session editing, no per-player override.

### Rejected alternatives

- **Out-of-band text** (host pastes the list in chat, each player types it into their own textarea): rejected because a single typo silently gives one player a different phrase universe than everyone else, with no error and no way to detect it. Worse than a link that already works.
- **A paste-bin or URL-shortener service** for the deck content: rejected outright — it's a backend, or a dependency on a third party neither this app nor its deploy target controls. Same reasoning as ADR 0001 decision 1.
- **Compressing the URL payload** (gzip, a hand-rolled codec): rejected as real code to maintain for a joke app, when the actual pain point — an unwieldy link — is already addressed by the soft-cap warning, not by shaving bytes.

## Architecture

One new pure module, alongside the existing split:

```
index.html       prefilled textarea, inline validation, game-screen failure state
   |
   +-- customDeck.js   NEW — pure: parse, validate, set-compare a pasted deck
   +-- bingo.js         + MAX_PHRASE_LENGTH promoted from a test literal
   +-- session.js       seed and marks-tag now fold in deck content
   +-- deck.js          unchanged — still data only
```

`customDeck.js` is its own module rather than living in `deck.js` (data only, per ADR 0001 decision 3) or `session.js` (code/identity/cookies, not phrase content). It has no DOM dependency and is fully unit tested, matching the pure-core convention `session.js` already established.

## The URL Parameter

`?d=<phrases>`, phrases newline-joined, handed to `URLSearchParams` for encoding — the same mechanism `?s=` already uses, so newlines and any other characters are percent-encoded and decoded automatically with no new escaping code.

`?d=` is present only when the parsed phrase set differs from `DECK`. Its absence means "use the built-in deck," identical to every session link that predates this feature.

## Seed and Marks-Tag Fold-In

This is the one correctness-sensitive change to existing code, and it is deliberately asymmetric:

- **Card seed** uses the full deck text: `hashSeed(sessionCode + ':' + id + ':' + deckText)`. `deckText` here is the newline-joined phrase list actually in play (the built-in deck's own joined text when there is no `?d=`). Computed once in memory per page load; never stored, so its size is irrelevant.
- **Marks-cookie tag** uses a short fingerprint instead of the full text, to keep `bb_marks` small regardless of deck size: `sessionCode + '#' + hashSeed(deckText).toString(36)` when a custom deck is present.
- **No custom deck**: the tag stays the bare `sessionCode`, byte-identical to the lobby-sessions design. This is what keeps every session link shared before this feature ships working exactly as it does today — verified by a dedicated test, not just asserted.

Consequence: hand-editing `?d=` while keeping the same `?s=` changes both the seed and the marks tag, so it behaves exactly like editing `?s=` itself already does — a new card, marks discarded. No special-casing needed; it falls out of using the same comparison that `parseMarks` already performs.

## Module: `bingo.js` — one promotion

`MAX_PHRASE_LENGTH = 40` is exported, replacing the bare `40` literal in `bingo.test.js`'s DECK-shape assertion. Same pattern as promoting `seededRng` in the lobby-sessions work: one canonical value instead of two numbers that could silently drift apart. `customDeck.js` imports it for runtime validation of pasted text.

## Module: `customDeck.js` — new

All pure, no DOM. Imports `CELL_COUNT` and `MAX_PHRASE_LENGTH` from `./bingo.js`, and `DECK` from `./deck.js` (only as `isDefaultDeck`'s default parameter — see below).

### `parseDeckText(text)`

Splits `text` on newlines, trims each line, drops blank lines, and deduplicates (exact string match, case-sensitive — matching `DECK`'s own uniqueness rule). An over-length phrase (after trimming) is excluded from the result entirely, not merely flagged — it never counts toward the minimum. Returns:

```js
{ phrases: string[], errors: string[] }
```

`phrases` contains only the valid, deduped, in-length-limit lines — this is what the minimum-count check below operates on, and what a caller renders as a live count while the user types.

`errors` is a list of user-facing strings, generated in this order:

1. Any phrase over `MAX_PHRASE_LENGTH` characters (after trimming): one error per offending phrase, quoting it and its length. These phrases are excluded from `phrases` (above), which is why an input with several over-length lines can also trigger the next error even if the raw line count looked sufficient.
2. If `phrases.length` is less than `CELL_COUNT`: one error stating how many more are needed (`"need 6 more phrases (25 minimum, got 19)"`).

An empty `errors` array means the deck is usable as-is.

### `deckWarning(phrases)`

Returns a warning string, or `null`, based on the soft cap: `phrases.length > 150` produces a message about the invite link getting long; otherwise `null`. Separate from `errors` because a warning never blocks starting a session.

### `isDefaultDeck(phrases, deck = DECK)`

Set-equality check (order-independent, exact string match) between `phrases` and the built-in `DECK`. `true` means the caller should omit `?d=` entirely. Takes `deck` as a parameter (defaulting to the imported `DECK`) so the comparison itself is testable without importing 108 fixed strings into every test case.

## UI (`index.html`)

### Start screen

The textarea is prefilled with `DECK.join('\n')` on load. Clicking "Start a session":

1. Runs `parseDeckText` on the textarea's current value.
2. If `errors` is non-empty, renders them inline (a list, not a single string) and does not navigate.
3. Otherwise, runs `isDefaultDeck`. If `true`, navigates to `?s=<minted code>` exactly as today. If `false`, navigates to `?s=<minted code>&d=<phrases joined and encoded>`.
4. If `deckWarning` returns non-null at any point after a successful parse, shows it as a dismissible notice — this never blocks step 3.

### Game screen — new failure state

On load, when `?d=` is present, the game screen runs the decoded value through the same `parseDeckText` the start screen uses (rather than a separate check), so the failure message can report the actual phrase count. If `errors` is non-empty — in practice, a hand-edited or truncated URL producing fewer than `CELL_COUNT` phrases — the grid is not rendered. In its place: a plain message — "This session's word list looks broken (need 25 phrases, this link has N)" — and a link back to the start screen (`?s=` and `?d=` both dropped). This is the one genuinely new UI state on this screen; every other error case in the lobby-sessions design degrades silently or discards marks, but a deck that can't build a card at all has nothing to render.

## Error Handling

| Case | Behavior |
|---|---|
| Textarea untouched, or edited only by reordering lines | No `?d=` param; identical to a pre-existing session link |
| Textarea edited, ≥25 unique valid phrases after parsing | `?d=` set; session starts |
| Textarea edited, <25 phrases after parsing | Inline error(s) on the start screen; start blocked |
| A phrase >40 characters after trimming | Inline error naming that phrase; start blocked |
| >150 phrases after parsing | Non-blocking warning; start proceeds |
| `?d=` present but decodes to <25 phrases (hand-edited link) | Game-screen failure state; no grid rendered |
| `?d=` present and valid, `?s=` absent | Start screen, exactly as when `?s=` alone is absent — a deck has no meaning without a session |
| `?d=` absent | Built-in `DECK`, byte-identical seed and marks tag to every pre-existing session link |

## Testing

TDD, pure layer only, consistent with ADR 0001 decision 4 and the lobby-sessions precedent.

### `customDeck.test.js` — new

- `parseDeckText`: strips blank lines and surrounding whitespace; dedupes exact repeats; accepts exactly `CELL_COUNT` phrases; rejects `CELL_COUNT - 1` with the correct "need 1 more" message; rejects an over-length phrase with a message naming it; a input producing multiple simultaneous errors returns all of them, not just the first.
- `deckWarning`: `null` at and below 150 phrases; a message above it.
- `isDefaultDeck`: `true` for the deck itself; `true` for the deck reordered; `false` for one phrase changed; `false` for one phrase added; `false` for one phrase removed; uses an injected small fixture deck rather than the real 108-phrase `DECK`.

### `bingo.test.js` — one change

The existing DECK-shape test imports `MAX_PHRASE_LENGTH` instead of hardcoding `40`.

### `session.test.js` — additions

- The seed for a given `(code, id)` differs when `deckText` differs, and matches when it doesn't (mirrors the existing card-determinism test, extended by one parameter).
- The marks tag is the bare `sessionCode` when `deckText` equals the built-in deck's joined text, and `sessionCode#<fingerprint>` otherwise.
- Two different custom deck texts that happen to hash-collide are not a concern this suite tests for directly — `hashSeed` is a 32-bit hash, not cryptographic, and an accidental collision here has the same harmless consequence ADR 0002 already accepted for session-code collisions: a shared identity for two things that happen to hash alike, not a security property.

### Manual browser pass

Starting a session with the textarea untouched produces a link with no `?d=`, matching today's behavior exactly. Editing one phrase and starting produces a longer link that, when opened fresh, shows the edited deck. Clearing the textarea and clicking "Start a session" shows the inline "need 25 more phrases" error without navigating. Pasting a phrase over 40 characters shows the corresponding error. Hand-truncating a shared `?d=` link's value and opening it shows the game-screen failure state, with a working link back to the start screen. Pasting 160 short phrases shows the non-blocking length warning and still starts the session.

## Out of Scope

- Saving or remembering a custom deck across sessions or browsers. Every session starts from the prefilled built-in list; there is no "my last deck" memory.
- Any deck format beyond one phrase per line — no categories, weights, or per-phrase metadata.
- Compressing or shortening the URL payload.
- Editing a deck after a session has started.
- Deduplication or validation beyond exact-string matching (e.g. catching near-duplicate phrases that differ only in punctuation or case) — same tolerance the built-in `DECK` already has.
