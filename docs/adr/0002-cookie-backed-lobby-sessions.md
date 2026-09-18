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
cookie from being set on the plain-HTTP local dev server. Both
refinements were verified during implementation: the local dev workflow
(`npm run serve`) sets and reads back both cookies correctly, which a
literal `path=/bullshit-bingo; Secure` would not have.

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
