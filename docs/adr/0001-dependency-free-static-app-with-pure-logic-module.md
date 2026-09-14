# ADR 0001 — Dependency-free static app with a pure logic module

- **Status:** Accepted
- **Date:** 2026-09-08
- **Deciders:** Stefan Haupt
- **Spec:** [2026-09-08-business-bullshit-bingo-design.md](../superpowers/specs/2026-09-08-business-bullshit-bingo-design.md)

## Context

Business Bullshit Bingo is a page colleagues open at the start of a meeting to play buzzword bingo on their own phones. It is a joke app played a handful of times per week by one team. It has no users outside that team, no data worth protecting, and no roadmap.

The technical question is therefore not "what scales" but "what still works in a year with zero maintenance". Anything with a dependency tree, a build step, or a server is something that can rot while nobody is looking at it. At the same time, the game rules — randomized card selection and win detection — are real logic with off-by-one hazards and deserve tests.

Five decisions were taken together during brainstorming. They are recorded as one ADR because they are one coherent stance; taking any of them differently weakens the others.

## Decision

### 1. No backend — independently randomized solo cards behind a shared link

Each player loads the same static URL and their browser draws its own card. Nothing is shared between players except the URL.

Rejected: a live shared room (host creates a room, players join by code, real-time feed of marks, server-announced BINGO). It is the better *game*, and it costs a server, a websocket layer, hosting, room lifecycle, and reconnect handling — permanent operational surface for a joke. Comparing cards happens in the meeting chat, which is where the players already are.

### 2. No build step and no dependencies

Hand-written HTML, CSS, and JavaScript. No bundler, no transpiler, no `node_modules`, no lockfile. The committed files are the deployed files.

Rejected: Vite + React + TypeScript. For a 25-cell grid and three event handlers, a framework adds a toolchain that needs upkeep — dependency updates, breaking major versions, a build that can fail — and buys nothing this UI needs. TypeScript's value here is small because the whole data model is `string[25]` and `boolean[25]`.

The cost is real and accepted: no type checking, no JSX, no dev server with hot reload, and manual DOM updates.

### 3. Game logic in a pure ES module, separate from the DOM

`bingo.js` holds `shuffle`, `buildCard`, `findWins`, and `formatShare` — pure functions, no DOM access, no module-level mutable state, randomness injected as an `rng` parameter. `index.html` owns all markup, styling, state, and event wiring.

Rejected: a single `index.html` with everything inline. It is one file instead of three, and it makes the logic untestable without a headless browser — so in practice the win-detection tables would go unverified. Rejected too: inlining the logic *and* keeping a copy for tests, which guarantees the copies drift.

This split is what makes decision 4 (below) affordable, since `node --test` can import the same module the browser loads.

### 4. Node's built-in test runner, tests only on the pure layer

Tests run with `node --test` against `node:assert`, with a seeded linear congruential generator passed in as `rng` for deterministic shuffles. No test framework is installed.

DOM behavior — tap toggling, the BINGO banner, the clipboard fallback, responsive layout at phone and desktop widths — is verified by hand in a browser. A headless-browser rig would be more test infrastructure than application code.

### 5. In-memory state only, hosted on GitHub Pages

No `localStorage`, no cookies, no query parameters. Card and marks live in two variables and die on reload. Deployment is `git push` to `main` with Pages serving the repository root.

## Consequences

### Good

- Zero dependencies means zero dependency maintenance and no supply-chain surface.
- The app is readable end to end in a few minutes, by a person or an agent.
- No server means nothing to pay for, monitor, or secure; no personal data ever leaves the browser.
- Win detection and card generation are unit tested with reproducible randomness.
- Deployment is a push. Rollback is a revert.

### Bad

- **A page reload mid-meeting loses the card and all marks.** This is the sharpest edge of decision 5 and was accepted knowingly. Mitigation, if it turns out to hurt: serialize `card` and `marked` to `localStorage` on each mutation and hydrate on load. It touches only `index.html` and no interface in this design.
- Players cannot see each other's progress in the app, so the social half of bingo happens in Slack or Teams.
- The deck is fixed at build time; a new phrase means a commit and a push.
- Modules must be served over HTTP — opening `index.html` via `file://` fails CORS. Local development needs a static server (`python3 -m http.server`).
- Manual DOM rendering will get repetitive if the UI grows much past this scope.
- No type safety and no automated coverage of the UI layer.

### Reversibility

Decisions 3 and 4 are structural and cheap to keep. Decisions 1, 2, and 5 are the ones under pressure if the app is ever taken more seriously:

- Adding persistence (decision 5) is a contained change to `index.html`.
- Adding a framework or build step (decision 2) means a rewrite of the UI layer, but `bingo.js` survives untouched — it has no DOM or browser coupling.
- Adding live rooms (decision 1) is a new project, not a refactor. If it ever happens, `bingo.js` is still the shared rules engine, and this ADR should be superseded rather than amended.

## Changes since acceptance

**2026-09-14 — the card grew from 4×4 to 5×5.** Cell counts in this document were updated to match; none of the five decisions changed. The change cost one constant in `bingo.js` (`CARD_SIZE`) plus two CSS declarations, which is decision 3 paying off — the geometry was derived, not hardcoded. The two CSS declarations were `grid-template-columns: repeat(5, minmax(0, 1fr))` (a plain `1fr` floors at min-content and scrolled the page sideways on a phone at five columns) and `overflow-wrap: break-word` (narrower cells made `anywhere` split words gratuitously).
