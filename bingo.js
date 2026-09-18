export const CARD_SIZE = 5;
export const CELL_COUNT = CARD_SIZE * CARD_SIZE;
// Also appears as literal text in index.html's <title> and <h1>; the two must move together.
export const TITLE = 'Business Bullshit Bingo';

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

/** Winning lines: every row, every column, main diagonal, anti-diagonal. */
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
