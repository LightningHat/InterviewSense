import { QuestionBank, QuestionBankSchema } from '@interviewsense/schemas';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateBank(bank: unknown): ValidationResult {
  const errors: string[] = [];

  const parseResult = QuestionBankSchema.safeParse(bank);
  if (!parseResult.success) {
    return {
      valid: false,
      errors: parseResult.error.errors.map(
        (e) => `Schema error at ${e.path.join('.')}: ${e.message}`
      ),
    };
  }

  const validBank: QuestionBank = parseResult.data;
  const questionMap = new Map<string, (typeof validBank.questions)[0]>();

  // 1. Verify Unique Question IDs
  for (const q of validBank.questions) {
    if (questionMap.has(q.id)) {
      errors.push(`Duplicate question id: ${q.id}`);
    }
    questionMap.set(q.id, q);

    // 2. Verify Concepts
    if (q.concepts.length < 2) {
      errors.push(`Question ${q.id} must have at least 2 concepts (found ${q.concepts.length})`);
    }

    const conceptIds = new Set<string>();
    let maxWeight = -1;
    let heaviestConceptId = '';

    for (const c of q.concepts) {
      if (conceptIds.has(c.id)) {
        errors.push(`Question ${q.id} has duplicate concept id: ${c.id}`);
      }
      conceptIds.add(c.id);

      if (c.weight <= 0) {
        errors.push(`Question ${q.id} concept ${c.id} weight must be positive (found ${c.weight})`);
      }

      if (c.weight > maxWeight) {
        maxWeight = c.weight;
        heaviestConceptId = c.id;
      }
    }

    // 3. Verify static follow-up for heaviest concept
    if (!q.staticFollowups || !q.staticFollowups[heaviestConceptId]) {
      errors.push(
        `Question ${q.id} is missing a staticFollowups entry for its heaviest concept '${heaviestConceptId}'`
      );
    }
  }

  // 4. Verify Next targets exist
  for (const q of validBank.questions) {
    const nextTargets = [q.next.strong, q.next.partial, q.next.weak].filter(Boolean) as string[];
    for (const target of nextTargets) {
      if (!questionMap.has(target)) {
        errors.push(`Question ${q.id} references non-existent next target: ${target}`);
      }
    }
  }

  // 5. Verify Reachability (Graph has no unreachable questions from root(s))
  // The first question (questions[0]) is defined as the entry/root question.
  if (validBank.questions.length > 0) {
    const reachable = new Set<string>();
    const queue = [validBank.questions[0].id];
    reachable.add(validBank.questions[0].id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const q = questionMap.get(currentId);
      if (!q) continue;

      const nextTargets = [q.next.strong, q.next.partial, q.next.weak].filter(Boolean) as string[];
      for (const t of nextTargets) {
        if (!reachable.has(t)) {
          reachable.add(t);
          queue.push(t);
        }
      }
    }

    for (const q of validBank.questions) {
      if (!reachable.has(q.id)) {
        errors.push(`Question ${q.id} is unreachable in the question graph`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
