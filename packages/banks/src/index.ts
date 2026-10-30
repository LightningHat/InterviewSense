import { createRequire } from 'node:module';
import { QuestionBank, Question } from '@interviewsense/schemas';
import { validateBank, ValidationResult } from './validator.js';

const require = createRequire(import.meta.url);
const seedEmbeddedData = require('./seed-embedded.json') as QuestionBank;
const taggedPoolData = require('./tagged-pool.json') as Question[];

export { validateBank, ValidationResult };

export const seedEmbeddedBank: QuestionBank = seedEmbeddedData;
export const taggedQuestionPool: Question[] = taggedPoolData;

export function getSeedBank(id: string = 'embedded-v1'): QuestionBank | null {
  if (id === 'embedded-v1') {
    return seedEmbeddedBank;
  }
  return null;
}
