import test from 'node:test';
import assert from 'node:assert/strict';

import { CELL_COUNT, seededRng } from './bingo.js';
import { normalizeCode, mintCode, formatMarks, parseMarks, readCookie, sessionKey } from './session.js';

test('normalizeCode lowercases and strips non-alphanumerics', () => {
  assert.equal(normalizeCode('K7-M2!'), 'k7m2');
});

test('normalizeCode caps at 16 characters', () => {
  assert.equal(normalizeCode('a'.repeat(20)), 'a'.repeat(16));
});

test('normalizeCode treats absent input as no code', () => {
  assert.equal(normalizeCode(null), '');
  assert.equal(normalizeCode(undefined), '');
  assert.equal(normalizeCode(''), '');
  assert.equal(normalizeCode('   '), '');
});

test('mintCode is deterministic under injected randomness', () => {
  assert.equal(mintCode(seededRng(1)), mintCode(seededRng(1)));
});

test('mintCode returns a 4-character lowercase alphanumeric code', () => {
  const code = mintCode(seededRng(5));
  assert.equal(code.length, 4);
  assert.match(code, /^[a-z0-9]{4}$/);
});

test('formatMarks/parseMarks round-trip when the code matches', () => {
  const marked = new Array(CELL_COUNT).fill(false);
  marked[0] = true;
  marked[24] = true;

  const stored = formatMarks('k7m2', marked);
  assert.deepEqual(parseMarks(stored, 'k7m2'), marked);
});

test('parseMarks discards marks from a different session code', () => {
  const marked = new Array(CELL_COUNT).fill(true);
  const stored = formatMarks('k7m2', marked);

  assert.deepEqual(parseMarks(stored, 'k7m3'), new Array(CELL_COUNT).fill(false));
});

test('parseMarks tolerates malformed or absent stored values', () => {
  const blank = new Array(CELL_COUNT).fill(false);

  assert.deepEqual(parseMarks(null, 'k7m2'), blank);
  assert.deepEqual(parseMarks(undefined, 'k7m2'), blank);
  assert.deepEqual(parseMarks('no-separator-here', 'k7m2'), blank);
  assert.deepEqual(parseMarks('', 'k7m2'), blank);
});

test('readCookie finds a name among several', () => {
  assert.equal(readCookie('bb_id=abc123; other=xyz', 'bb_id'), 'abc123');
  assert.equal(readCookie('other=xyz; bb_id=abc123', 'bb_id'), 'abc123');
});

test('readCookie tolerates surrounding whitespace', () => {
  assert.equal(readCookie(' bb_id=abc123 ; other=1', 'bb_id'), 'abc123');
});

test('readCookie does not match on a name prefix', () => {
  assert.equal(readCookie('bb_ident=xyz; bb_id=abc123', 'bb_id'), 'abc123');
});

test('readCookie returns null for a missing name or empty header', () => {
  assert.equal(readCookie('a=1; b=2', 'bb_id'), null);
  assert.equal(readCookie('', 'bb_id'), null);
  assert.equal(readCookie(null, 'bb_id'), null);
});

test('sessionKey is the bare code when there is no custom deck', () => {
  assert.equal(sessionKey('k7m2', null), 'k7m2');
  assert.equal(sessionKey('k7m2', undefined), 'k7m2');
});

test('sessionKey tags the code with a deck fingerprint when a custom deck is present', () => {
  const key = sessionKey('k7m2', 'Alpha\nBeta\nGamma');
  assert.match(key, /^k7m2#[0-9a-z]+$/);
});

test('sessionKey is deterministic for the same deck text and differs for a different one', () => {
  const first = sessionKey('k7m2', 'Alpha\nBeta');
  const second = sessionKey('k7m2', 'Alpha\nBeta');
  const third = sessionKey('k7m2', 'Alpha\nGamma');

  assert.equal(first, second);
  assert.notEqual(first, third);
});
