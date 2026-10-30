import { FollowupRequest, FollowupResponse, FollowupResponseSchema } from '@interviewsense/schemas';
import { CONFIG } from '../config.js';
import { LLMAdapter, SummaryRequest } from './types.js';

export class HttpLLMAdapter implements LLMAdapter {
  public readonly id = 'http' as const;

  public async ready(): Promise<boolean> {
    try {
      const res = await fetch(CONFIG.api.health, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async followup(req: FollowupRequest, signal?: AbortSignal): Promise<FollowupResponse> {
    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.api.httpTimeoutMs);

      // Link external signal if provided
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      try {
        const response = await fetch(CONFIG.api.followup, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const code = errorData?.error?.code || `HTTP_${response.status}`;
          const message = errorData?.error?.message || response.statusText;
          const err = new Error(`HTTP Followup error [${code}]: ${message}`);
          (err as any).code = code;
          (err as any).retryable = errorData?.error?.retryable ?? (response.status >= 500);
          throw err;
        }

        const data = await response.json();
        const parsed = FollowupResponseSchema.safeParse(data);
        if (!parsed.success) {
          throw new Error('Invalid response structure from followup API');
        }
        return parsed.data;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    // Attempt request with 1 retry on retryable errors
    try {
      return await makeRequest();
    } catch (err: any) {
      if (err.code === 'budget_exhausted' || err.code === 'rate_limited' || err.code === 'session_cap') {
        // Non-retryable guard rejections
        throw err;
      }
      // One retry
      return await makeRequest();
    }
  }

  public async summarize(req: SummaryRequest, signal?: AbortSignal): Promise<string> {
    const followupReq: FollowupRequest = {
      sessionId: req.sessionId,
      question: 'Summarize recent turns',
      answerPoints: '',
      missing: [],
      summary: req.rollingSummary,
      mode: 'summarize',
    };

    const res = await this.followup(followupReq, signal);
    return res.summary || req.rollingSummary;
  }
}

