import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionBank } from '@interviewsense/schemas';
import { INITIAL_ENGINE_STATE, reduceEngineState } from './state.js';

const mockBank: QuestionBank = {
  id: 'test-bank',
  version: 1,
  title: 'Test Bank',
  source: 'static',
  config: { maxQuestions: 8, maxFollowupsPerQuestion: 1, T_cover: 0.55, T_off: 0.25 },
  questions: [
    {
      id: 'q1',
      text: 'Explain I2C bus.',
      topic: 'protocols',
      difficulty: 1,
      concepts: [
        { id: 'c1', text: 'Two wires', weight: 2 },
        { id: 'c2', text: 'Addressing', weight: 1 },
      ],
      staticFollowups: { c1: 'What are the two wires?' },
      next: { strong: 'q2', partial: 'q2', weak: 'q2' },
    },
    {
      id: 'q2',
      text: 'Explain SPI bus.',
      topic: 'protocols',
      difficulty: 2,
      concepts: [
        { id: 'c3', text: 'Four lines', weight: 2 },
        { id: 'c4', text: 'Chip select', weight: 1 },
      ],
      staticFollowups: { c3: 'What four lines?' },
      next: {},
    },
  ],
};

test('state machine: START_SESSION transitions to PREPARING and issues PERSIST_SESSION', () => {
  const { state, effects } = reduceEngineState(INITIAL_ENGINE_STATE, {
    type: 'START_SESSION',
    profile: 'local-cpu',
    bank: mockBank,
  });

  assert.equal(state.phase, 'PREPARING');
  assert.equal(state.currentQuestion?.id, 'q1');
  assert.ok(effects.some((e) => e.type === 'PERSIST_SESSION'));
});

test('state machine: PREPARATION_COMPLETE transitions to ASKING and issues SPEAK effect', () => {
  const preparedState = {
    ...INITIAL_ENGINE_STATE,
    phase: 'PREPARING' as const,
    bank: mockBank,
    currentQuestion: mockBank.questions[0],
    currentQuestionText: mockBank.questions[0].text,
  };

  const { state, effects } = reduceEngineState(preparedState, {
    type: 'PREPARATION_COMPLETE',
  });

  assert.equal(state.phase, 'ASKING');
  assert.equal(state.audioState, 'speaking');
  assert.ok(effects.some((e) => e.type === 'SPEAK' && e.text === mockBank.questions[0].text));
});

test('state machine: QUESTION_SPOKEN transitions to LISTENING and starts listening', () => {
  const askingState = {
    ...INITIAL_ENGINE_STATE,
    phase: 'ASKING' as const,
    currentQuestion: mockBank.questions[0],
    currentQuestionText: mockBank.questions[0].text,
  };

  const { state, effects } = reduceEngineState(askingState, {
    type: 'QUESTION_SPOKEN',
  });

  assert.equal(state.phase, 'LISTENING');
  assert.equal(state.audioState, 'listening');
  assert.ok(effects.some((e) => e.type === 'START_LISTENING'));
});

test('state machine: SUBMIT_TYPED_ANSWER transitions directly to SCORING with SCORE_TRANSCRIPT effect', () => {
  const listeningState = {
    ...INITIAL_ENGINE_STATE,
    phase: 'LISTENING' as const,
    currentQuestion: mockBank.questions[0],
    typedAnswerMode: true,
  };

  const { state, effects } = reduceEngineState(listeningState, {
    type: 'SUBMIT_TYPED_ANSWER',
    text: 'I2C uses SDA and SCL with addresses.',
  });

  assert.equal(state.phase, 'SCORING');
  assert.equal(state.liveCaption, 'I2C uses SDA and SCL with addresses.');
  assert.ok(effects.some((e) => e.type === 'SCORE_TRANSCRIPT'));
});

test('state machine: FAIL_TO_STANDARD_BANK displays banner and swaps bank', () => {
  const { state } = reduceEngineState(INITIAL_ENGINE_STATE, {
    type: 'FAIL_TO_STANDARD_BANK',
    fallbackBank: mockBank,
  });

  assert.equal(state.standardBankFallbackBanner, true);
  assert.equal(state.bank?.id, 'test-bank');
});
