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
