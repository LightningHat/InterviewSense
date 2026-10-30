import { FollowupRequest, FollowupResponse } from '@interviewsense/schemas';
import { CONFIG } from '../config.js';
import { LLMAdapter, SummaryRequest } from './types.js';

export class WebLLMAdapter implements LLMAdapter {
  public readonly id = 'webllm' as const;
  private engine: any = null;
  private isLoaded = false;
  private loadPromise: Promise<boolean> | null = null;

  public async ready(): Promise<boolean> {
    return this.isLoaded;
  }

  public async loadInBackground(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        // Dynamic import so it doesn't block bundle or fail on environments without WebGPU
        const webllm = await import('@mlc-ai/web-llm' as any).catch(() => null);
        if (!webllm || !webllm.CreateMLCEngine) {
          console.warn('WebLLM is not installed or available in this environment');
          return false;
        }

        this.engine = await webllm.CreateMLCEngine(CONFIG.llm.webllmModel, {
          initProgressCallback: (report: any) => {
            console.debug('WebLLM loading progress:', report.text);
          },
        });
        this.isLoaded = true;
        return true;
      } catch (err) {
        console.warn('WebLLM failed to load in background', err);
        this.isLoaded = false;
        return false;
      }
    })();

    return this.loadPromise;
  }

  public async followup(req: FollowupRequest, signal?: AbortSignal): Promise<FollowupResponse> {
    if (!this.engine || !this.isLoaded) {
      throw new Error('WebLLM engine is not ready');
    }

    const systemPrompt =
      'You are a concise technical interviewer. Given the question, what the candidate covered, and what they missed, ask exactly one short follow-up (max 20 words) targeting the first missed point. Do not reveal the answer. Output JSON only: {"followup": string}.';

    const userPrompt = `Question: ${req.question}\nCovered: ${req.answerPoints}\nMissing: ${req.missing.join(', ')}\nMode: ${req.mode}`;

    const completion = await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: CONFIG.llm.followupMaxTokens,
      temperature: CONFIG.llm.temperature,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(content);
      return {
        followup: parsed.followup || parsed.question || 'Could you elaborate on that?',
      };
    } catch {
      return { followup: content.trim() };
    }
  }

  public async summarize(req: SummaryRequest, signal?: AbortSignal): Promise<string> {
    if (!this.engine || !this.isLoaded) {
      return req.rollingSummary;
    }

    const completion = await this.engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Compress this interview summary into max 4 concise bullet lines under 80 words. Plain text.',
        },
        { role: 'user', content: req.rollingSummary },
      ],
      max_tokens: CONFIG.llm.summaryMaxTokens,
      temperature: 0.2,
    });

    return completion.choices[0]?.message?.content?.trim() || req.rollingSummary;
  }
}
