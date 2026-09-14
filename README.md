# Business Bullshit Bingo

Corporate buzzword bingo for meetings. Open the link, get your own random
5×5 card, tap a square whenever someone actually says the phrase.

**Play:** <https://REPLACE_WITH_PAGES_URL>

Everyone who opens the link gets an independently randomized card from the
same shared deck, so no two cards are alike — any two share about six of
their twenty-five phrases. First to fill a row, column, or
diagonal wins. Hit **Copy result** and paste the emoji grid into the team
chat to prove it.

There is no server and no sync — the app never sends anything anywhere, and
nothing is stored. Reloading the page starts a fresh card, so don't reload
mid-meeting.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole UI: markup, CSS, state, event handlers. |
| `bingo.js` | Pure game logic — shuffle, card building, win detection, share text. No DOM. |
| `deck.js` | The phrases. |
| `bingo.test.js` | Tests for `bingo.js` and the deck. |
| `package.json` | Sets `"type": "module"`. No dependencies. |

## Development

No dependencies, no build step. Requires Node 20+ for the test runner.
The page itself needs roughly Chrome 88, Safari 15.4, or Firefox 89 or later
(`aspect-ratio`, `overflow-wrap: anywhere`, `Array.flatMap`, optional catch
binding, ES modules); on older browsers the grid renders empty with no
message.

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
