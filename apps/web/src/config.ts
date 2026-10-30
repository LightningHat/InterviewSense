export const CONFIG = {
  // Audio & VAD Parameters
  audio: {
    targetSampleRate: 16000,
    speechStartThreshold: 0.5,
    silenceTimeoutMs: 1200,
    minSpeechMs: 400,
    maxAnswerLengthMs: 120000, // 120 seconds
    preRollMs: 300,
    silencePromptTimeoutMs: 15000, // 15 seconds re-prompt
  },

  // STT Models (Transformers.js / ONNX)
  stt: {
    models: {
      gpu: 'Xenova/whisper-base.en',
      cpu: 'Xenova/whisper-tiny.en',
      thin: 'Xenova/whisper-tiny.en',
    },
    language: 'en',
    task: 'transcribe',
  },

  // Embeddings Model
  embeddings: {
    model: 'Xenova/bge-small-en-v1.5',
    cachePrefix: 'embeddings',
  },

  // Scorer & Routing Thresholds
  scoring: {
    defaultTCover: 0.55,
    defaultTOff: 0.25,
    ambiguityMargin: 0.05,
    ambiguityMinWords: 40,
    tier2MaxCallsPerSession: 3,
    maxFollowupsPerQuestion: 1,
  },

  // Local Summarizer Threshold
  summary: {
    maxTokensLocalLimit: 100,
    charThreshold: 400, // ~100 tokens approx (chars / 4)
  },

  // TTS Configuration
  tts: {
    defaultRate: 1.0,
    preferredLanguage: 'en-US',
  },

  // LLM Generation Settings
  llm: {
    followupMaxTokens: 60,
    summaryMaxTokens: 120,
    reportMaxTokens: 500,
    temperature: 0.3,
    webllmModel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  },

  // API Endpoints
  api: {
    baseUrl: '/api',
    health: '/api/health',
    banks: '/api/banks',
    bankGenerate: '/api/bank/generate',
    followup: '/api/followup',
    report: '/api/report',
    httpTimeoutMs: 8000,
    bankGenerateTimeoutMs: 12000,
  },
} as const;

