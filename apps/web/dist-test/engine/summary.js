import { CONFIG } from '../config.js';
export function formatTurnSummaryLine(turn) {
    const qShort = turn.questionId.replace(/^pool-[a-z]+-|^q-/, '');
    const missedStr = turn.analysis.missing.length > 0
        ? `missed ${turn.analysis.missing.slice(0, 2).join(', ')}`
        : 'covered all';
    return `Q-${qShort}: ${turn.band}; ${missedStr}; wpm ${turn.delivery.wpm}`;
}
export function appendToRollingSummary(currentSummary, newTurn) {
    const line = formatTurnSummaryLine(newTurn);
    if (!currentSummary.trim()) {
        return line;
    }
    return `${currentSummary}\n${line}`;
}
export function shouldCompressSummary(summary) {
    // Estimate tokens by chars / 4; trigger compression if over 100 tokens (400 chars)
    return summary.length > CONFIG.summary.charThreshold;
}
export function compressSummaryLocally(summary) {
    const lines = summary.split('\n').filter(Boolean);
    if (lines.length <= 4)
        return summary;
    // Keep the first turn line and the last 3 turn lines
    const head = lines[0];
    const tail = lines.slice(-3);
    return `${head}\n... (${lines.length - 4} earlier turns omitted) ...\n${tail.join('\n')}`;
}
