import test from 'node:test';
import assert from 'node:assert/strict';
import { Question } from '@interviewsense/schemas';
import { decideRoute, determineBand } from './router.js';

const mockQuestion: Question = {
  id: 'q1',
  text: 'What is I2C?',
  topic: 'protocols',
  difficulty: 2,
  concepts: [
    { id: 'c1', text: 'Two wires', weight: 2 },
    { id: 'c2', text: 'Pull up', weight: 1 },
  ],
  staticFollowups: {
    c1: 'What are the two wires called?',
    c2: 'Why pullup?',
  },
  next: {
    strong: 'q2-strong',
    partial: 'q2-partial',
    weak: 'q2-weak',
  },
};

test('determineBand returns correct bands from coverage', () => {
  assert.equal(determineBand({ coverage: 0.8, covered: ['c1'], missing: [], offTopic: false, wordCount: 20, fillerRate: 0, confidenceHint: 0.9 }), 'strong');
  assert.equal(determineBand({ coverage: 0.5, covered: ['c1'], missing: ['c2'], offTopic: false, wordCount: 20, fillerRate: 0, confidenceHint: 0.8 }), 'partial');
  assert.equal(determineBand({ coverage: 0.2, covered: [], missing: ['c1', 'c2'], offTopic: false, wordCount: 20, fillerRate: 0, confidenceHint: 0.8 }), 'weak');
  assert.equal(determineBand({ coverage: 0.0, covered: [], missing: ['c1', 'c2'], offTopic: true, wordCount: 20, fillerRate: 0, confidenceHint: 0.1 }), 'offtopic');
});

test('decideRoute routes strong answer to next.strong with tier0', () => {
  const decision = decideRoute(
    { coverage: 0.85, covered: ['c1', 'c2'], missing: [], offTopic: false, wordCount: 25, fillerRate: 0, confidenceHint: 0.9 },
    {
      question: mockQuestion,
      followupsCount: 0,
      offTopicConsecutiveCount: 0,
      tier2CallsCount: 0,
      totalQuestionsAsked: 1,
      maxQuestions: 8,
      llmAvailable: false,
      canUseTier2: false,
    }
  );

  assert.equal(decision.band, 'strong');
  assert.equal(decision.route, 'tier0');
  assert.equal(decision.action, 'advance');
  assert.equal(decision.nextQuestionId, 'q2-strong');
});

test('decideRoute routes partial answer with followups left to static followup without LLM', () => {
  const decision = decideRoute(
    { coverage: 0.60, covered: ['c1'], missing: ['c2'], offTopic: false, wordCount: 20, fillerRate: 0, confidenceHint: 0.8 },
    {
      question: mockQuestion,
      followupsCount: 0,
      offTopicConsecutiveCount: 0,
      tier2CallsCount: 0,
      totalQuestionsAsked: 1,
      maxQuestions: 8,
      llmAvailable: false,
      canUseTier2: false,
    }
  );

  assert.equal(decision.band, 'partial');
  assert.equal(decision.route, 'static-fallback');
  assert.equal(decision.action, 'followup');
  assert.equal(decision.missingConceptId, 'c2');
  assert.equal(decision.followupText, 'Why pullup?');
});

test('decideRoute routes partial answer with no followups left to next.partial', () => {
  const decision = decideRoute(
    { coverage: 0.60, covered: ['c1'], missing: ['c2'], offTopic: false, wordCount: 20, fillerRate: 0, confidenceHint: 0.8 },
    {
      question: mockQuestion,
      followupsCount: 1, // already asked 1 follow-up
      offTopicConsecutiveCount: 0,
      tier2CallsCount: 0,
      totalQuestionsAsked: 1,
      maxQuestions: 8,
      llmAvailable: false,
      canUseTier2: false,
    }
  );

  assert.equal(decision.band, 'partial');
  assert.equal(decision.route, 'tier0');
  assert.equal(decision.action, 'advance');
  assert.equal(decision.nextQuestionId, 'q2-partial');
});

test('decideRoute routes first off-topic to rephrase', () => {
  const decision = decideRoute(
    { coverage: 0, covered: [], missing: ['c1', 'c2'], offTopic: true, wordCount: 15, fillerRate: 0, confidenceHint: 0.1 },
    {
      question: mockQuestion,
      followupsCount: 0,
      offTopicConsecutiveCount: 0,
      tier2CallsCount: 0,
      totalQuestionsAsked: 1,
      maxQuestions: 8,
      llmAvailable: false,
      canUseTier2: false,
    }
  );

  assert.equal(decision.band, 'offtopic');
  assert.equal(decision.action, 'rephrase');
});

test('decideRoute advances on repeated off-topic and marks skipped', () => {
  const decision = decideRoute(
    { coverage: 0, covered: [], missing: ['c1', 'c2'], offTopic: true, wordCount: 15, fillerRate: 0, confidenceHint: 0.1 },
    {
      question: mockQuestion,
      followupsCount: 0,
      offTopicConsecutiveCount: 1, // already off-topic once
      tier2CallsCount: 0,
      totalQuestionsAsked: 1,
      maxQuestions: 8,
      llmAvailable: false,
      canUseTier2: false,
    }
  );

  assert.equal(decision.band, 'skipped');
  assert.equal(decision.action, 'advance');
  assert.equal(decision.nextQuestionId, 'q2-weak');
});
