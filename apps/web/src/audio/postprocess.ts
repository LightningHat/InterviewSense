const FILLER_WORDS = new Set([
  'um',
  'uh',
  'er',
  'ah',
  'like',
  'basically',
  'actually',
  'literally',
  'you know',
  'i mean',
]);

const HALLUCINATION_PHRASES = [
  'thank you',
  'thank you very much',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  'subtitles by',
  'transcribed by',
  'bye',
  'goodbye',
];

export interface PostProcessResult {
  text: string;
  wordCount: number;
  fillerRate: number;
  wpm: number;
  isHallucination: boolean;
}

export function postProcessTranscript(rawText: string, durationMs: number): PostProcessResult {
  let cleaned = rawText.trim();

  // Check for common Whisper silence hallucinations
  const lower = cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const isHallucination =
    lower.length === 0 ||
    HALLUCINATION_PHRASES.includes(lower);

  if (isHallucination) {
    return {
      text: '',
      wordCount: 0,
      fillerRate: 0,
      wpm: 0,
      isHallucination: true,
    };
  }

  // Collapse consecutive repeated words (e.g. "um um" or "the the")
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const deduplicatedTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const prevWord = deduplicatedTokens[deduplicatedTokens.length - 1];
    if (prevWord && word.toLowerCase() === prevWord.toLowerCase()) {
      // Skip consecutive identical token (filler or repeated stutter)
      continue;
    }
    deduplicatedTokens.push(word);
  }

  cleaned = deduplicatedTokens.join(' ');

  // Count words and fillers
  let fillerCount = 0;
  for (const token of deduplicatedTokens) {
    const normalized = token.toLowerCase().replace(/[^a-z]/g, '');
    if (FILLER_WORDS.has(normalized)) {
      fillerCount++;
    }
  }

  const wordCount = deduplicatedTokens.length;
  const fillerRate = wordCount > 0 ? Number((fillerCount / wordCount).toFixed(3)) : 0;

  // Words per minute calculation
  const durationMinutes = Math.max(durationMs / 60000, 0.05); // min 3s floor
  const wpm = Math.round(wordCount / durationMinutes);

  return {
    text: cleaned,
    wordCount,
    fillerRate,
    wpm,
    isHallucination: false,
  };
}

