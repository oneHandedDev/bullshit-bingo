import test from 'node:test';
import assert from 'node:assert/strict';

import { CARD_SIZE, CELL_COUNT, LINES, TITLE, lineName, shuffle, buildCard, findWins, formatShare, seededRng, hashSeed, packMarks, unpackMarks, MAX_PHRASE_LENGTH } from './bingo.js';
import { DECK } from './deck.js';

test('card geometry is 5x5 with 25 cells', () => {
  assert.equal(CARD_SIZE, 5);
  assert.equal(CELL_COUNT, 25);
});

test('TITLE is the app name', () => {
  assert.equal(TITLE, 'Business Bullshit Bingo');
});

test('LINES has 12 lines of 5 cells each', () => {
  assert.equal(LINES.length, 12);
  for (const line of LINES) {
    assert.equal(line.length, CARD_SIZE);
  }
});

test('LINES contains the expected rows, columns and diagonals', () => {
  assert.deepEqual(LINES, [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
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
  assert.equal(lineName(4), 'row 5');
  assert.equal(lineName(5), 'column 1');
  assert.equal(lineName(9), 'column 5');
  assert.equal(lineName(10), 'diagonal ↘');
  assert.equal(lineName(11), 'diagonal ↙');
});

const NUMBERS = Array.from({ length: 30 }, (_, i) => `phrase ${i}`);

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

test('buildCard returns 25 unique phrases drawn from the deck', () => {
  const card = buildCard(NUMBERS, seededRng(7));

  assert.equal(card.length, 25);
  assert.equal(new Set(card).size, 25, 'card contains duplicates');
  for (const phrase of card) {
    assert.ok(NUMBERS.includes(phrase), `"${phrase}" is not in the deck`);
  }
});

test('buildCard works with a deck of exactly 25 phrases', () => {
  const exact = NUMBERS.slice(0, 25);
  const card = buildCard(exact, seededRng(3));

  assert.deepEqual([...card].sort(), [...exact].sort());
});

test('buildCard throws RangeError on a deck too small to fill a card', () => {
  assert.throws(() => buildCard(NUMBERS.slice(0, 24), seededRng(3)), RangeError);
});

/** Builds a 25-element boolean array with the given cell indices marked. */
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
  assert.deepEqual(findWins(markCells(0, 1, 2, 3)), []);
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
  // Top row [0,1,2,3,4] plus first column [0,5,10,15,20], sharing cell 0.
  const wins = findWins(markCells(0, 1, 2, 3, 4, 5, 10, 15, 20));

  assert.deepEqual(wins, [0, 5]);
});

test('findWins reports all 12 lines for a full card', () => {
  const wins = findWins(new Array(CELL_COUNT).fill(true));

  assert.deepEqual(wins, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

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

test('formatShare without wins omits BINGO and reports the count', () => {
  const marked = markCells(0, 6);
  const text = formatShare(marked, []);

  assert.deepEqual(text.split('\n'), [
    'Business Bullshit Bingo',
    '🟩⬜⬜⬜⬜',
    '⬜🟩⬜⬜⬜',
    '⬜⬜⬜⬜⬜',
    '⬜⬜⬜⬜⬜',
    '⬜⬜⬜⬜⬜',
    '2/25 heard',
  ]);
});

test('formatShare with an empty card reports 0 of 25', () => {
  const text = formatShare(new Array(CELL_COUNT).fill(false), []);

  assert.match(text, /^Business Bullshit Bingo\n/);
  assert.ok(text.endsWith('0/25 heard'));
  assert.ok(!text.includes('🟩'));
});

test('formatShare with one win announces BINGO and names the line', () => {
  const marked = markCells(0, 1, 2, 3, 4, 6, 12, 18);
  const text = formatShare(marked, findWins(marked));

  assert.deepEqual(text.split('\n'), [
    'Business Bullshit Bingo — BINGO 🎉',
    '🟩🟩🟩🟩🟩',
    '⬜🟩⬜⬜⬜',
    '⬜⬜🟩⬜⬜',
    '⬜⬜⬜🟩⬜',
    '⬜⬜⬜⬜⬜',
    '8/25 heard · row 1',
  ]);
});

test('formatShare names every winning line, comma separated', () => {
  const marked = markCells(0, 1, 2, 3, 4, 5, 10, 15, 20);
  const text = formatShare(marked, findWins(marked));

  assert.ok(text.endsWith('9/25 heard · row 1, column 1'), text);
});

test('formatShare takes no card and emits only title, emoji grid and count', () => {
  assert.equal(formatShare.length, 2, 'formatShare must not accept a card argument');

  const marked = markCells(0, 1, 2, 3, 4, 6, 12, 18);
  const lines = formatShare(marked, findWins(marked)).split('\n');
  const rowPattern = new RegExp(`^[🟩⬜]{${CARD_SIZE}}$`, 'u');
  const footerPattern = new RegExp(`^\\d{1,2}\\/${CELL_COUNT} heard( · .+)?$`, 'u');

  assert.equal(lines.length, CARD_SIZE + 2);
  assert.match(lines[0], /^Business Bullshit Bingo( — BINGO 🎉)?$/u);
  for (const row of lines.slice(1, 1 + CARD_SIZE)) {
    assert.match(row, rowPattern);
  }
  assert.match(lines[lines.length - 1], footerPattern);
});

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
    assert.ok(phrase.length <= MAX_PHRASE_LENGTH, `"${phrase}" is ${phrase.length} characters`);
  }
});

test('buildCard draws a different card for a different seed', () => {
  const first = buildCard(DECK, seededRng(11));
  const second = buildCard(DECK, seededRng(12));

  assert.equal(first.length, CELL_COUNT);
  assert.notDeepEqual(first, second);
});

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

test('a session card also depends on deck text, when a custom deck is present', () => {
  const seedWithDeck = (code, id, deckText) => hashSeed(`${code}:${id}:${deckText}`);
  const cardWithDeck = (code, id, deckText) => buildCard(DECK, seededRng(seedWithDeck(code, id, deckText)));

  const first = cardWithDeck('k7m2', 'player-a', 'alpha\nbeta');
  const second = cardWithDeck('k7m2', 'player-a', 'alpha\nbeta');
  assert.deepEqual(first, second, 'same (code, id, deckText) must reproduce the same card');

  const differentDeckText = cardWithDeck('k7m2', 'player-a', 'gamma\ndelta');
  assert.notDeepEqual(first, differentDeckText, 'a different deckText must change the card');
});

test('DECK is large enough that two colleagues barely overlap', () => {
  assert.ok(
    DECK.length >= CELL_COUNT * 4,
    `deck has ${DECK.length} phrases; below ${CELL_COUNT * 4} two cards would overlap heavily`,
  );
});
