import { AnswerAnalysis, Concept, Question } from '@interviewsense/schemas';
import { CONFIG } from '../config.js';
import { checkKeywords, cosineSimilarity, splitIntoSentences } from './similarity.js';

export interface ConceptScore {
  conceptId: string;
  weight: number;
  maxSimilarity: number;
  keywordMatch: boolean;
  covered: boolean;
}

export interface MatchOptions {
  tCover?: number;
  tOff?: number;
  wordCount?: number;
  fillerRate?: number;
}

export function matchAnswerToRubric(
  transcript: string,
  question: Question,
  conceptEmbeddings: Map<string, number[]>, // conceptId -> embedding vector
  questionEmbedding: number[] | null,
  sentenceEmbeddings: number[][], // embeddings for each sentence in splitIntoSentences(transcript)
  options: MatchOptions = {}
): AnswerAnalysis {
  const tCover = options.tCover ?? CONFIG.scoring.defaultTCover;
  const tOff = options.tOff ?? CONFIG.scoring.defaultTOff;

  const sentences = splitIntoSentences(transcript);
  let totalWeight = 0;
  let coveredWeight = 0;
  const covered: string[] = [];
  const missingWithWeight: { id: string; weight: number }[] = [];

  let globalMaxSim = 0;

  // 1. Check max similarity to the question itself if question embedding is available
  if (questionEmbedding && sentenceEmbeddings.length > 0) {
    for (const sEmbed of sentenceEmbeddings) {
      const sim = cosineSimilarity(questionEmbedding, sEmbed);
      if (sim > globalMaxSim) {
        globalMaxSim = sim;
      }
    }
  }

  // 2. Evaluate each concept in the rubric
  for (const concept of question.concepts) {
    totalWeight += concept.weight;
    const cVector = conceptEmbeddings.get(concept.id);

    let maxSim = 0;
    if (cVector && sentenceEmbeddings.length > 0) {
      for (const sEmbed of sentenceEmbeddings) {
        const sim = cosineSimilarity(cVector, sEmbed);
        if (sim > maxSim) {
          maxSim = sim;
        }
      }
    }

    if (maxSim > globalMaxSim) {
      globalMaxSim = maxSim;
    }

    // Check keyword promotion
    const hasKeyword = checkKeywords(transcript, concept.keywords);

    // Concept covered if similarity >= tCover or strong keyword match with reasonable similarity (e.g. >= 0.40)
    const isCovered = maxSim >= tCover || (hasKeyword && (maxSim >= tCover - 0.20 || !cVector));

    if (isCovered) {
      covered.push(concept.id);
      coveredWeight += concept.weight;
    } else {
      missingWithWeight.push({ id: concept.id, weight: concept.weight });
    }
  }

  // Sort missing concept IDs by weight descending
  missingWithWeight.sort((a, b) => b.weight - a.weight);
  const missing = missingWithWeight.map((m) => m.id);

  const coverage = totalWeight > 0 ? Number((coveredWeight / totalWeight).toFixed(3)) : 0;

  // Off-topic check: if transcript is non-empty and max similarity across question + all concepts < tOff
  // and no keywords matched at all
  const anyKeywordsMatched = question.concepts.some((c) => checkKeywords(transcript, c.keywords));
  const offTopic =
    transcript.trim().length > 0 &&
    globalMaxSim < tOff &&
    !anyKeywordsMatched &&
    covered.length === 0;

  // Confidence hint based on distance from thresholds (0.75, 0.40)
  const distToStrong = Math.abs(coverage - 0.75);
  const distToPartial = Math.abs(coverage - 0.40);
  const minDist = Math.min(distToStrong, distToPartial);
  // Scale confidence hint: closer to threshold -> lower confidence hint
  const confidenceHint = Math.min(Math.max(minDist / 0.25, 0.1), 1.0);

  const words = transcript.split(/\s+/).filter(Boolean);

  return {
    coverage,
    covered,
    missing,
    offTopic,
    wordCount: options.wordCount ?? words.length,
    fillerRate: options.fillerRate ?? 0,
    confidenceHint: Number(confidenceHint.toFixed(2)),
  };
}

