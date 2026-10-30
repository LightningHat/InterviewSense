import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateBank } from './validator.js';

const require = createRequire(import.meta.url);
const seedEmbeddedData = require('./seed-embedded.json');

test('validates seed embedded bank successfully', () => {
  const result = validateBank(seedEmbeddedData);
  assert.equal(result.valid, true, `Errors found: ${result.errors.join(', ')}`);
});

test('catches non-existent next target in bank', () => {
  const badBank = JSON.parse(JSON.stringify(seedEmbeddedData));
  badBank.questions[0].next.strong = 'q-nonexistent-id';
  const result = validateBank(badBank);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e: string) => e.includes('non-existent next target')));
});

test('catches missing static followup for heaviest concept', () => {
  const badBank = JSON.parse(JSON.stringify(seedEmbeddedData));
  // Provide a followup, but omit the heaviest concepts ('c-pullup', 'c-2wire', 'c-addr' which have weight 2)
  badBank.questions[0].staticFollowups = {
    'c-tradeoff': 'Why is I2C slower than SPI?',
  };
  const result = validateBank(badBank);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e: string) => e.includes('missing a staticFollowups entry')));
});

test('catches unreachable questions in question graph', () => {
  const badBank = JSON.parse(JSON.stringify(seedEmbeddedData));
  badBank.questions.push({
    id: 'q-island',
    text: 'Isolated question',
    topic: 'isolated',
    difficulty: 1,
    concepts: [
      { id: 'c1', text: 'Concept 1', weight: 2 },
      { id: 'c2', text: 'Concept 2', weight: 1 },
    ],
    staticFollowups: { c1: 'Followup' },
    next: {},
  });
  const result = validateBank(badBank);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e: string) => e.includes('unreachable')));
});
