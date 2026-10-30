import { FollowupRequest, FollowupResponse } from '@interviewsense/schemas';
import { LLMAdapter, SummaryRequest } from './types.js';

export class OllamaLLMAdapter implements LLMAdapter {
  public readonly id = 'ollama' as const;
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'qwen2.5:1.5b') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  public async ready(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async followup(req: FollowupRequest, signal?: AbortSignal): Promise<FollowupResponse> {
    const systemPrompt =
      'You are a concise technical interviewer. Given the question, what the candidate covered, and what they missed, ask exactly one short follow-up (max 20 words) targeting the first missed point. Do not reveal the answer. Output JSON only: {"followup": string}.';

    const userPrompt = `Question: ${req.question}\nCovered: ${req.answerPoints}\nMissing: ${req.missing.join(', ')}\nMode: ${req.mode}`;

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        format: 'json',
        options: {
          temperature: 0.3,
          num_predict: 60,
        },
      }),
      signal: signal || AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed with status ${res.status}`);
    }

    const data = await res.json();
    const content = data?.message?.content || '{}';
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
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Compress this interview turn summary into max 4 concise bullet points under 80 words. Text only.',
          },
          { role: 'user', content: req.rollingSummary },
        ],
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 120,
        },
      }),
      signal: signal || AbortSignal.timeout(8000),
    });

    if (!res.ok) return req.rollingSummary;
    const data = await res.json();
    return data?.message?.content?.trim() || req.rollingSummary;
  }
}
