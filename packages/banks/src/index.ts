import { QuestionBank, Question } from '@interviewsense/schemas';
import { validateBank, ValidationResult } from './validator.js';
import seedEmbeddedData from './seed-embedded.json' with { type: 'json' };
import taggedPoolData from './tagged-pool.json' with { type: 'json' };

export { validateBank, ValidationResult };

export const seedEmbeddedBank = seedEmbeddedData as unknown as QuestionBank;
export const taggedQuestionPool = taggedPoolData as unknown as Question[];

export function getSeedBank(id: string = 'embedded-v1'): QuestionBank | null {
  if (id === 'embedded-v1') {
    return seedEmbeddedBank;
  }
  return null;
}
