import test from 'node:test';
import assert from 'node:assert/strict';
import { Question } from '@interviewsense/schemas';
import { matchAnswerToRubric } from './matcher.js';

const sampleI2CQuestion: Question = {
  id: 'q-i2c',
  text: 'Explain how I2C works and when you would choose it over SPI.',
  topic: 'protocols',
  difficulty: 2,
  concepts: [
    { id: 'c-2wire', text: 'Two wires: SDA and SCL, shared synchronous bus', weight: 2, keywords: ['sda', 'scl', 'two wire'] },
    { id: 'c-addr', text: 'Devices are addressed, supports multiple slaves with unique addresses', weight: 2, keywords: ['address', 'slave', 'master'] },
    { id: 'c-pullup', text: 'Open-drain lines require pull-up resistors', weight: 2, keywords: ['pull-up', 'pullup', 'resistor', 'open drain'] },
    { id: 'c-tradeoff', text: 'Slower transfer speed than SPI but requires fewer microcontroller pins', weight: 1, keywords: ['speed', 'pin', 'faster', 'slower'] },
  ],
  staticFollowups: {
    'c-pullup': 'Why do the SDA and SCL lines in I2C require pull-up resistors?',
  },
  next: { strong: 'q-dma', partial: 'q-spi', weak: 'q-uart' },
};

test('Golden: Strong answer covers all key concepts (coverage >= 0.75)', () => {
  const strongAnswer = `
    I2C uses two bidirectional wires, SDA for data and SCL for the clock.
    Each slave device on the shared bus has a unique 7-bit or 10-bit address.
    Because the outputs are open-drain, pull-up resistors to VCC are required on both lines.
    It is slower than SPI, but saves microcontroller pins when connecting multiple chips.
  `;

  // Without neural embeddings, keyword matching accurately promotes matched concepts
  const analysis = matchAnswerToRubric(
    strongAnswer,
    sampleI2CQuestion,
    new Map(),
    null,
    []
  );

  assert.ok(analysis.coverage >= 0.75, `Expected >= 0.75, got ${analysis.coverage}`);
  assert.ok(analysis.covered.includes('c-2wire'));
  assert.ok(analysis.covered.includes('c-addr'));
  assert.ok(analysis.covered.includes('c-pullup'));
  assert.equal(analysis.offTopic, false);
});

test('Golden: Partial answer covers some concepts (0.40 <= coverage < 0.75)', () => {
  const partialAnswer = `
    I2C has two wires, SDA and SCL, and devices have an address.
  `;

  const analysis = matchAnswerToRubric(
    partialAnswer,
    sampleI2CQuestion,
    new Map(),
    null,
    []
  );

  assert.ok(analysis.coverage >= 0.40 && analysis.coverage < 0.75, `Expected partial, got ${analysis.coverage}`);
  assert.ok(analysis.covered.includes('c-2wire'));
  assert.ok(analysis.covered.includes('c-addr'));
  assert.ok(analysis.missing.includes('c-pullup'));
  assert.equal(analysis.offTopic, false);
});

test('Golden: Weak answer covers minimal concepts (< 0.40)', () => {
  const weakAnswer = `
    I think it is slower than other buses like SPI because of fewer pins.
  `;

  const analysis = matchAnswerToRubric(
    weakAnswer,
    sampleI2CQuestion,
    new Map(),
    null,
    []
  );

  assert.ok(analysis.coverage < 0.40, `Expected weak (< 0.40), got ${analysis.coverage}`);
  assert.ok(analysis.covered.includes('c-tradeoff'));
  assert.ok(analysis.missing.includes('c-pullup'));
  assert.equal(analysis.offTopic, false);
});

test('Golden: Off-topic answer detected correctly', () => {
  const offTopicAnswer = `
    The weather outside is very sunny and I had a great breakfast this morning.
  `;

  const analysis = matchAnswerToRubric(
    offTopicAnswer,
    sampleI2CQuestion,
    new Map(),
    null,
    []
  );

  assert.equal(analysis.coverage, 0);
  assert.equal(analysis.offTopic, true);
  assert.equal(analysis.covered.length, 0);
});

