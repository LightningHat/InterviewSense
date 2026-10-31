import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProfileSchema,
  QuestionBankSchema,
  FollowupRequestSchema,
  ReportResponseSchema,
} from './index.js';

test('validates sample profile successfully', () => {
  const profile = {
    level: 'intern',
    skills: ['c', 'rtos', 'i2c'],
    domains: ['embedded'],
    projects: [
      {
        title: 'Drone Controller',
        summary: 'STM32 based flight controller',
        tech: ['C', 'FreeRTOS'],
      },
    ],
  };

  const parsed = ProfileSchema.safeParse(profile);
  assert.equal(parsed.success, true);
});

test('validates sample question bank successfully', () => {
  const bank = {
    id: 'embedded-v1',
    version: 1,
    title: 'Embedded Systems Intern',
    config: { maxQuestions: 8, maxFollowupsPerQuestion: 1, T_cover: 0.55 },
    questions: [
      {
        id: 'q-i2c',
        text: 'Explain how I2C works and when you would choose it over SPI.',
        topic: 'protocols',
        difficulty: 2,
        concepts: [
          { id: 'c-2wire', text: 'Two wires: SDA and SCL', weight: 2, keywords: ['sda', 'scl'] },
          { id: 'c-addr', text: 'Devices are addressed', weight: 2, keywords: ['address'] },
        ],
        staticFollowups: {
          'c-2wire': 'What are the two lines called in I2C?',
        },
        next: {
          strong: 'q-dma',
          partial: 'q-spi',
          weak: 'q-uart',
        },
      },
    ],
  };

  const parsed = QuestionBankSchema.safeParse(bank);
  assert.equal(parsed.success, true);
});

test('rejects question bank missing static followups', () => {
  const badBank = {
    id: 'test',
    version: 1,
    title: 'Test',
    config: {},
    questions: [
      {
        id: 'q1',
        text: 'Question',
        topic: 'topic',
        difficulty: 1,
        concepts: [
          { id: 'c1', text: 'Concept 1', weight: 1 },
          { id: 'c2', text: 'Concept 2', weight: 1 },
        ],
        staticFollowups: {},
        next: {},
      },
    ],
  };

  const parsed = QuestionBankSchema.safeParse(badBank);
  assert.equal(parsed.success, false);
});

