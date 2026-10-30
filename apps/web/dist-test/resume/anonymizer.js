const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+/gi;
const SOCIAL_REGEX = /(?:linkedin|github|twitter|gitlab|medium)\.com\/[^\s]+/gi;
const POSTAL_REGEX = /\b\d{5}(?:-\d{4})?\b/g;
// Prompt injection and command phrases to sanitize
const INJECTION_PATTERNS = [
    /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/gi,
    /system\s*:\s*/gi,
    /assistant\s*:\s*/gi,
    /you\s+are\s+now\s+/gi,
    /act\s+as\s+a\s+/gi,
    /output\s+the\s+system\s+prompt/gi,
    /reveal\s+(?:your\s+)?secret/gi,
    /new\s+rule\s*:\s*/gi,
];
// Common employer phrasing to neutralize
const EMPLOYER_PREFIX_REGEX = /\b(?:at|for|with)\s+([A-Z][A-Za-z0-9&.,\- ]+?)(?=\s+(?:as|from|in|\d{4}|present|current|\n|\.))/g;
export function stripPIIAndInjections(rawText) {
    let cleaned = rawText;
    // 1. Remove emails
    cleaned = cleaned.replace(EMAIL_REGEX, '[EMAIL]');
    // 2. Remove phones
    cleaned = cleaned.replace(PHONE_REGEX, '[PHONE]');
    // 3. Remove URLs and social links
    cleaned = cleaned.replace(URL_REGEX, '[LINK]');
    cleaned = cleaned.replace(SOCIAL_REGEX, '[LINK]');
    // 4. Neutralize prompt injections
    for (const pattern of INJECTION_PATTERNS) {
        cleaned = cleaned.replace(pattern, '[FILTERED_COMMAND]');
    }
    // 5. Generalize employer names to "a company"
    cleaned = cleaned.replace(EMPLOYER_PREFIX_REGEX, 'at a company');
    return cleaned;
}
export function clampField(text, maxLen = 200) {
    if (!text)
        return '';
    const trimmed = text.trim();
    if (trimmed.length <= maxLen)
        return trimmed;
    return trimmed.slice(0, maxLen - 3) + '...';
}
