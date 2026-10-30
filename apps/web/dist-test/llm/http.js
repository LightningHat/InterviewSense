import { FollowupResponseSchema } from '@interviewsense/schemas';
import { CONFIG } from '../config.js';
export class HttpLLMAdapter {
    id = 'http';
    async ready() {
        try {
            const res = await fetch(CONFIG.api.health, {
                signal: AbortSignal.timeout(3000),
            });
            return res.ok;
        }
        catch {
            return false;
        }
    }
    async followup(req, signal) {
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
                    err.code = code;
                    err.retryable = errorData?.error?.retryable ?? (response.status >= 500);
                    throw err;
                }
                const data = await response.json();
                const parsed = FollowupResponseSchema.safeParse(data);
                if (!parsed.success) {
                    throw new Error('Invalid response structure from followup API');
                }
                return parsed.data;
            }
            catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        };
        // Attempt request with 1 retry on retryable errors
        try {
            return await makeRequest();
        }
        catch (err) {
            if (err.code === 'budget_exhausted' || err.code === 'rate_limited' || err.code === 'session_cap') {
                // Non-retryable guard rejections
                throw err;
            }
            // One retry
            return await makeRequest();
        }
    }
    async summarize(req, signal) {
        const followupReq = {
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
