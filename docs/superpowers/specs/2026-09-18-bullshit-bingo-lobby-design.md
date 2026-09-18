# Business Bullshit Bingo — Lobby Sessions — Design

**Date:** 2026-09-18
**Status:** Draft — awaiting review
**Supersedes in part:** [2026-09-08-business-bullshit-bingo-design.md](2026-09-08-business-bullshit-bingo-design.md) (State, Extras)
**Related ADR:** ADR 0002 (to be written on acceptance); amends ADR 0001 decision 5

## Purpose

Turn the solo-card page into a lobby game. Players join a session by opening a shared link, each gets their own card, and that card is fixed for the duration of the session — a reload brings back the same grid with the same marks. Cards change only when someone starts a new session.

This closes the sharpest accepted flaw of the original design ("a page reload mid-meeting discards the card and all marks") and makes re-rolling a bad card a deliberate act rather than a refresh away.

## Scope Decisions

Settled during brainstorming; these bound the design:

- **No backend.** ADR 0001 decision 1 stands. No server, no real-time service, no accounts, no peer-to-peer. Deployment stays a `git push` to GitHub Pages.
- **Invisible lobby.** Players cannot see each other, each other's progress, or a roster. The social half of the game stays in Slack or Teams, as before.
- **Different card per player.** Classic bingo, not a shared-card race.
- **Identity is an anonymous per-browser id**, minted on first load and stored in a cookie. No name is typed. Nothing identifying is stored, and nothing is transmitted — there is no server to transmit to.
- **Session is a code in the URL** (`?s=k7m2`). Opening the link is joining. There is no host role.
- **Restart is a new link.** Someone mints a new code and shares it; cards reset for whoever opens it.
- **Marks persist** for the session, in a cookie.
- **Card is derived, never stored.** Seed is `hash(sessionCode + playerId)`.
- **Storage is cookies, not localStorage.** Rationale in "Storage" below.
- **Still no dependencies and no build step.** ADR 0001 decisions 2, 3, and 4 stand unchanged.

### Accepted trade-offs

1. **A lost cookie is a lost card, with no way to recover it.** Because identity is an anonymous minted id rather than something the player types, the cookie is the only source of that identity. Clearing the browser, switching devices, or opening the link in incognito produces a new id and therefore a new card. A player who wants to re-roll can do so this way. Accepted: this is a joke app played by one team, and the requirement was to stop *accidental* re-rolls on refresh, which this does.

2. **Two tabs on the same session diverge on marks.** Both tabs derive the same card, but marks are written independently and the last write wins. Cookies have no change event, so there is no cheap way to sync. Accepted and documented.

3. **Session codes can collide.** Two unrelated meetings may mint the same code. This is harmless: the seed also contains each player's id, so their cards still differ. No coordination or collision check is needed, which is why a short code is enough.

## Architecture

The two-layer split from the original design is preserved. One new module is added at the browser-coupled edge, and the pure layer grows four functions.

```
index.html      markup, styling, state, event wiring, screen routing
   |
   +-- bingo.js    pure rules + pure encoding. No DOM, no cookies, no globals.
   +-- session.js  session code, identity, cookie I/O. Pure core, thin impure edge.
   +-- deck.js     data only
```

`session.js` MUST NOT touch `document` or `location` at module top level — only inside function bodies. Otherwise `node --test` crashes on import and the pure half of the module becomes untestable.

## Data Flow

```
?s=k7m2  (URL)  ──┐
                  ├─► hashSeed("k7m2:<id>") ─► seededRng ─► buildCard(DECK) ─► string[25]
bb_id    (cookie) ─┘

bb_marks (cookie) ─► parseMarks("k7m2.3f9x2a", "k7m2") ─► boolean[25]
                     (code mismatch ─► 25 x false)
```

On load:

1. `currentCode()` reads and normalizes `?s=`. If it is empty, render the start screen and stop.
2. `loadIdentity()` reads `bb_id`, minting and persisting one if absent.
3. `card = buildCard(DECK, seededRng(hashSeed(code + ':' + id)))`.
4. `marked = parseMarks(readCookie(document.cookie, 'bb_marks'), code)`.
5. Render grid, apply marks, check wins.

On each cell toggle: update `marked`, re-check wins, then `saveMarks(code, marked)`.

The requirement follows directly: a refresh re-runs steps 1–5 against an unchanged URL and an unchanged cookie, so the seed is identical and the card is bit-identical.

## Storage

Two cookies, with deliberately different lifetimes.

| Name | Value | max-age | Rationale |
|---|---|---|---|
| `bb_id` | opaque id, e.g. a UUID | 30 days | Identity must outlive a single meeting so that reopening an old session link still yields that player's old card |
| `bb_marks` | `<sessionCode>.<base36 bitmask>` | 8 hours | Progress belongs to one meeting; yesterday's marks must not bleed into today |

Both are set with `path=/bullshit-bingo; SameSite=Lax; Secure`.

**Why cookies over localStorage.** The site is served from `onehandeddev.github.io`, an origin shared by every GitHub Pages repo on the account. `localStorage` is per-origin and cannot be narrowed, so all of those projects share one bucket and can collide on key names. A cookie can be pinned with `path=/bullshit-bingo`. Cookies also carry native expiry via `max-age`, which gives `bb_marks` its per-meeting lifetime for free instead of a hand-rolled timestamp check. The costs — a stringly `document.cookie` API and a 4 KB limit — are irrelevant at roughly 80 bytes of payload.

**Privacy.** Both cookies are strictly functional: they hold an anonymous id and the player's own game progress, they are never transmitted (no server exists), and they carry no personal data. No consent banner is required.

The marks bitmask is session-tagged on purpose. Discarding marks when the stored code does not match the URL is the mechanism that makes a session restart actually reset a player.

## Module: `bingo.js` — additions

All four are pure, side-effect free, and free of DOM and cookie access.

### `hashSeed(text)`

FNV-1a over the string `sessionCode + ':' + playerId`, followed by an explicit xorshift-multiply avalanche step, returning an unsigned 32-bit integer.

The avalanche step is not decoration. `seededRng` is a linear congruential generator, and an LCG's first few outputs are strongly correlated across adjacent seeds. Plain FNV-1a leaves a one-character input change visible mostly in the low bits, which would make two similar session codes produce suspiciously similar cards. Mixing the result decouples them and is what makes the avalanche test below meaningful rather than flaky.

### `seededRng(seed)`

Moved verbatim from `bingo.test.js`, where it already exists and is already tested. The test file imports it instead of defining it, so the existing determinism tests begin exercising shipped code. The generator is a Numerical Recipes LCG; quality is irrelevant, repeatability is the point.

### `packMarks(marked)`

`boolean[25]` to a base36 string of at most 5 characters (`2**25 - 1` is `jz6rj`). Bit `i` corresponds to cell `i`, least-significant first.

### `unpackMarks(text)`

Base36 string to `boolean[25]`. Tolerant: any unparseable, missing, or overlong input yields 25 × `false` rather than throwing. Always returns exactly `CELL_COUNT` entries. Every bitmask is a legal game state, so no further validation is performed.

## Module: `session.js` — new

### Pure core (unit tested)

- `normalizeCode(raw)` — lowercase, strip non-alphanumeric, cap at 16 characters. `null`, `undefined`, and all-garbage input yield `''`.
- `mintCode(randomInt)` — a 4-character code drawn from lowercase alphanumerics (36^4 = 1,679,616 possibilities). Randomness is injected as a parameter so the function is testable, mirroring the `rng` convention in `bingo.js`. Four characters is short enough to read aloud and, per trade-off 3, collisions are harmless.
- `formatMarks(code, marked)` — `"k7m2.3f9x2a"`.
- `parseMarks(value, currentCode)` — splits, compares the code, and delegates to `unpackMarks`. A mismatched or absent code yields 25 × `false`.
- `readCookie(cookieString, name)` — parses a cookie header for one name. Must tolerate surrounding whitespace and must not match on a prefix (`bb_id` must not match `bb_ident`).

### Impure edge (verified by hand in a browser)

- `currentCode()` — `normalizeCode` over `location.search`.
- `loadIdentity()` — read `bb_id`, or mint via `crypto.randomUUID()` and persist. Falls back to two `Math.random().toString(36)` chunks where `crypto.randomUUID` is unavailable; GitHub Pages is HTTPS, so the secure-context path is the normal one.
- `saveMarks(code, marked)` — writes the `bb_marks` cookie.
- `cookiesEnabled()` — probe by writing and reading back a throwaway cookie.

## UI (`index.html`)

Two screens, selected by whether a valid session code is present.

**Start screen** (no valid `?s=`): the title, a one-line explainer, and a single "Start a session" button. The button mints a code and assigns `location.search`, a full navigation rather than History API manipulation. Nothing is typed anywhere in the app.

**Game screen** (valid `?s=`): the existing grid, share button, and BINGO banner, unchanged. A new footer shows `Session <code>`, a "Copy invite link" button, and a "New session" link. "New session" is behind a `confirm()`, because it abandons the clicker's own card. It does not affect other players, who only move when they open the new link.

**Cookie-blocked warning:** when `cookiesEnabled()` is false, the game still plays with an in-memory id, and a single line of text states that the card will reset on refresh. This must be visible — a silent failure here is indistinguishable from a bug.

## Error Handling

| Case | Behavior |
|---|---|
| `?s=` absent, empty, or garbage after normalization | Start screen |
| Cookies blocked or disabled | In-memory id, game playable, visible warning that refresh re-rolls |
| `crypto.randomUUID` unavailable | `Math.random` fallback for id and code |
| Corrupt or truncated `bb_marks` | 25 × `false`; never throws, never surfaces an error |
| Stored marks code does not match the URL code | Marks discarded. This is correct behavior, not an error |
| `?s=` hand-edited mid-game | New seed, new card, marks discarded |
| Deck shorter than `CELL_COUNT` | Existing `RangeError` from `buildCard`, unchanged |

## Testing

TDD. Tests cover the pure layer only, consistent with ADR 0001 decision 4. The DOM layer is verified by hand.

### `bingo.test.js` — additions

- **The requirement, as one assertion:** two cards built from the same `(code, id)` pair are `deepEqual`; a different code yields a different card; a different id yields a different card.
- `hashSeed`: deterministic; returns a uint32; a one-character change in the input produces an unrelated value.
- `packMarks` / `unpackMarks`: round-trip over seeded random boolean arrays; all-false; all-true; garbage input; overlong input; output length is always `CELL_COUNT`.
- `seededRng`: existing determinism tests, now importing from `bingo.js`.

### `session.test.js` — new

- `normalizeCode`: casing, stripped symbols, the 16-character cap, `null`, empty, all-garbage.
- `mintCode`: deterministic under injected randomness; charset and length.
- `formatMarks` / `parseMarks`: round-trip; code mismatch yields blank; malformed value yields blank.
- `readCookie`: finds a name among several; missing name yields `null`; tolerates whitespace; does not match a prefix.

`node --test` globs `*.test.js`, so `npm test` picks up the new file with no configuration change.

### Manual browser pass

Refresh restores the card and the marks. A new session link resets both. The cookie-blocked warning appears with cookies disabled. Copy-invite-link works. The start screen appears at the bare URL.

## Deployment

Unchanged: commit and push to `main`, GitHub Pages serves the repository root. No dependencies, no build step, no configuration.

## Documentation

ADR 0001 decision 5 reads "no `localStorage`, no cookies, no query parameters." This design uses two of those three. That reversal gets its own ADR 0002 rather than a silent edit to ADR 0001, recording why cookies beat `localStorage` on this origin, why identity is anonymous and unrecoverable, and the fact that decisions 1, 2, 3, and 4 survive untouched. ADR 0001 gains a line under "Changes since acceptance" pointing at it.

## Out of Scope

- Any roster, presence, or visibility of other players.
- Live marks, a shared BINGO feed, or any server-announced event.
- Typed player names, and therefore cross-device card recovery.
- Preventing a determined player from re-rolling by clearing cookies.
- Syncing marks between two tabs.
- Session expiry or cleanup as a concept — there is nothing stored anywhere to clean up.
- Custom decks, deck editing, or per-session decks.
