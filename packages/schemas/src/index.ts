import { z } from 'zod';

// Capabilities & Profile selection (Section 3)
export const CapabilitiesSchema = z.object({
  webgpu: z.boolean(),
  deviceMemoryGB: z.number().nullable(),
  hardwareConcurrency: z.number(),
  isMobile: z.boolean(),
  micPermission: z.enum(['granted', 'prompt', 'denied']),
  speechSynthesis: z.boolean(),
  indexedDB: z.boolean(),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const RuntimeProfileSchema = z.enum(['local-gpu', 'local-cpu', 'thin', 'dev']);
export type RuntimeProfile = z.infer<typeof RuntimeProfileSchema>;

// Profile extracted from resume (Section 5.8)
export const ProjectSchema = z.object({
  title: z.string().max(200),
  summary: z.string().max(200),
  tech: z.array(z.string().max(50)).max(10),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProfileSchema = z.object({
  level: z.enum(['intern', 'junior', 'mid', 'senior']),
  skills: z.array(z.string().max(50)).max(15),
  domains: z.array(z.string().max(50)).max(5),
  projects: z.array(ProjectSchema).max(4),
});
export type Profile = z.infer<typeof ProfileSchema>;

// Scorer Analysis (Section 5.3)
export const AnswerAnalysisSchema = z.object({
  coverage: z.number().min(0).max(1),
  covered: z.array(z.string()),
  missing: z.array(z.string()),
  offTopic: z.boolean(),
  wordCount: z.number(),
  fillerRate: z.number(),
  confidenceHint: z.number().min(0).max(1),
});
export type AnswerAnalysis = z.infer<typeof AnswerAnalysisSchema>;

// Question Bank Concept & Question (Section 6.1)
export const ConceptSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  weight: z.number().positive(),
  keywords: z.array(z.string()).optional(),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const QuestionNextSchema = z.object({
  strong: z.string().optional(),
  partial: z.string().optional(),
  weak: z.string().optional(),
});
export type QuestionNext = z.infer<typeof QuestionNextSchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(300),
  topic: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  concepts: z.array(ConceptSchema).min(2),
  idealAnswer: z.string().optional(),
  staticFollowups: z.record(z.string(), z.string()).refine(
    (val) => Object.keys(val).length > 0,
    { message: 'Every question must have at least one static followup' }
  ),
  next: QuestionNextSchema,
  origin: z.enum(['pool', 'resume']).optional(),
  skills: z.array(z.string()).optional(),
  domain: z.string().optional(),
  level: z.enum(['intern', 'junior', 'mid', 'senior']).optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const BankConfigSchema = z.object({
  maxQuestions: z.number().int().positive().default(8),
  maxFollowupsPerQuestion: z.number().int().nonnegative().default(1),
  T_cover: z.number().min(0).max(1).default(0.55),
  T_off: z.number().min(0).max(1).default(0.25),
});
export type BankConfig = z.infer<typeof BankConfigSchema>;

export const QuestionBankSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  config: BankConfigSchema,
  questions: z.array(QuestionSchema).min(1),
  source: z.enum(['static', 'generated']).optional().default('static'),
  profileHash: z.string().optional(),
});
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

// Session & Turns (Section 6.2)
export const TurnBandSchema = z.enum(['strong', 'partial', 'weak', 'offtopic', 'skipped']);
export type TurnBand = z.infer<typeof TurnBandSchema>;

export const TurnRouteSchema = z.enum(['tier0', 'tier1', 'tier2', 'static-fallback']);
export type TurnRoute = z.infer<typeof TurnRouteSchema>;

export const DeliveryStatsSchema = z.object({
  wpm: z.number(),
  fillerRate: z.number(),
  durationMs: z.number(),
});
export type DeliveryStats = z.infer<typeof DeliveryStatsSchema>;

export const TurnSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  index: z.number().int().nonnegative(),
  questionId: z.string(),
  kind: z.enum(['main', 'followup']),
  questionText: z.string(),
  transcript: z.string(),
  analysis: AnswerAnalysisSchema,
  route: TurnRouteSchema,
  band: TurnBandSchema,
  delivery: DeliveryStatsSchema,
  createdAt: z.number(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const SessionStatusSchema = z.enum(['active', 'complete', 'abandoned']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  bankId: z.string(),
  bankVersion: z.number(),
  profile: RuntimeProfileSchema,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  rollingSummary: z.string().max(600), // ~100 tokens max
  tokensUsed: z.object({
    in: z.number(),
    out: z.number(),
  }),
  status: SessionStatusSchema,
});
export type Session = z.infer<typeof SessionSchema>;

// API Contracts (Section 8 & 9)
export const FollowupModeSchema = z.enum(['followup', 'rephrase', 'adjudicate', 'summarize']);
export type FollowupMode = z.infer<typeof FollowupModeSchema>;

export const FollowupRequestSchema = z.object({
  sessionId: z.string(),
  question: z.string().max(400),
  answerPoints: z.string().max(800),
  missing: z.array(z.string().max(200)),
  summary: z.string().max(600),
  mode: FollowupModeSchema,
  rawAnswer: z.string().max(1000).optional(), // only for adjudicate mode, truncated
});
export type FollowupRequest = z.infer<typeof FollowupRequestSchema>;

export const FollowupResponseSchema = z.object({
  followup: z.string().optional(),
  band: z.enum(['strong', 'partial', 'weak']).optional(),
  summary: z.string().optional(),
});
export type FollowupResponse = z.infer<typeof FollowupResponseSchema>;

export const TurnReportInputSchema = z.object({
  questionId: z.string(),
  band: TurnBandSchema,
  covered: z.array(z.string()),
  missing: z.array(z.string()),
  delivery: DeliveryStatsSchema,
});
export type TurnReportInput = z.infer<typeof TurnReportInputSchema>;

export const ReportRequestSchema = z.object({
  sessionId: z.string(),
  turns: z.array(TurnReportInputSchema),
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export const ReportResponseSchema = z.object({
  overall: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  advice: z.array(z.string()),
  score_0_100: z.number().min(0).max(100),
});
export type ReportResponse = z.infer<typeof ReportResponseSchema>;

export const BankGenerateRequestSchema = z.object({
  sessionId: z.string(),
  profile: ProfileSchema,
  bankSize: z.number().int().min(4).max(15).optional().default(8),
});
export type BankGenerateRequest = z.infer<typeof BankGenerateRequestSchema>;

export const ApiErrorCodeSchema = z.enum([
  'budget_exhausted',
  'rate_limited',
  'session_cap',
  'provider_error',
  'bad_request',
  'not_found',
  'internal_error',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
