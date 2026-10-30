import { FollowupRequest, FollowupResponse } from '@interviewsense/schemas';

export interface SummaryRequest {
  sessionId: string;
  rollingSummary: string;
}

export interface LLMAdapter {
  id: 'webllm' | 'http' | 'ollama';
  ready(): Promise<boolean>;
  followup(req: FollowupRequest, signal?: AbortSignal): Promise<FollowupResponse>;
  summarize(req: SummaryRequest, signal?: AbortSignal): Promise<string>;
}
