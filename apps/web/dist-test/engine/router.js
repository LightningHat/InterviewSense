import { CONFIG } from '../config.js';
export function determineBand(analysis) {
    if (analysis.offTopic) {
        return 'offtopic';
    }
    if (analysis.coverage >= 0.75) {
        return 'strong';
    }
    if (analysis.coverage >= 0.40) {
        return 'partial';
    }
    return 'weak';
}
export function checkAmbiguity(analysis) {
    if (analysis.wordCount < CONFIG.scoring.ambiguityMinWords) {
        return false;
    }
    const distToStrong = Math.abs(analysis.coverage - 0.75);
    const distToPartial = Math.abs(analysis.coverage - 0.40);
    return distToStrong < CONFIG.scoring.ambiguityMargin || distToPartial < CONFIG.scoring.ambiguityMargin;
}
export function decideRoute(analysis, ctx) {
    const band = determineBand(analysis);
    const isAmbiguous = checkAmbiguity(analysis);
    const maxFollowups = ctx.question ? CONFIG.scoring.maxFollowupsPerQuestion : 1;
    const followupsLeft = ctx.followupsCount < maxFollowups;
    const topMissing = analysis.missing[0] || '';
    // Ambiguity adjudication check (Tier 2 call, capped at 3 per session)
    if (isAmbiguous &&
        ctx.canUseTier2 &&
        ctx.tier2CallsCount < CONFIG.scoring.tier2MaxCallsPerSession) {
        return {
            band,
            route: 'tier2',
            action: 'adjudicate',
            isAmbiguous: true,
            missingConceptId: topMissing,
        };
    }
    // 1. Off-topic handling
    if (band === 'offtopic') {
        if (ctx.offTopicConsecutiveCount === 0) {
            // First time off-topic: rephrase once
            const route = ctx.canUseTier2 ? 'tier2' : 'static-fallback';
            return {
                band: 'offtopic',
                route,
                action: 'rephrase',
                followupText: `Could you answer specifically about: ${ctx.question.text}`,
            };
        }
        else {
            // Repeated off-topic: mark skipped, move on
            const nextQ = ctx.question.next.weak || ctx.question.next.partial || ctx.question.next.strong;
            return {
                band: 'skipped',
                route: 'tier0',
                action: nextQ && ctx.totalQuestionsAsked < ctx.maxQuestions ? 'advance' : 'complete',
                nextQuestionId: nextQ,
            };
        }
    }
    // 2. Strong band
    if (band === 'strong') {
        const nextQ = ctx.question.next.strong || ctx.question.next.partial || ctx.question.next.weak;
        return {
            band: 'strong',
            route: 'tier0',
            action: nextQ && ctx.totalQuestionsAsked < ctx.maxQuestions ? 'advance' : 'complete',
            nextQuestionId: nextQ,
        };
    }
    // 3. Partial band
    if (band === 'partial') {
        if (followupsLeft && topMissing) {
            const staticFollowup = ctx.question.staticFollowups?.[topMissing] ||
                Object.values(ctx.question.staticFollowups || {})[0] ||
                `Could you elaborate more on ${topMissing}?`;
            return {
                band: 'partial',
                route: ctx.llmAvailable ? 'tier1' : 'static-fallback',
                action: 'followup',
                missingConceptId: topMissing,
                followupText: staticFollowup,
            };
        }
        else {
            const nextQ = ctx.question.next.partial || ctx.question.next.strong || ctx.question.next.weak;
            return {
                band: 'partial',
                route: 'tier0',
                action: nextQ && ctx.totalQuestionsAsked < ctx.maxQuestions ? 'advance' : 'complete',
                nextQuestionId: nextQ,
            };
        }
    }
    // 4. Weak band
    if (followupsLeft && topMissing && ctx.question.staticFollowups?.[topMissing]) {
        // Weak with followups left uses staticFollowups (tier0)
        return {
            band: 'weak',
            route: 'tier0',
            action: 'followup',
            missingConceptId: topMissing,
            followupText: ctx.question.staticFollowups[topMissing],
        };
    }
    else {
        const nextQ = ctx.question.next.weak || ctx.question.next.partial || ctx.question.next.strong;
        return {
            band: 'weak',
            route: 'tier0',
            action: nextQ && ctx.totalQuestionsAsked < ctx.maxQuestions ? 'advance' : 'complete',
            nextQuestionId: nextQ,
        };
    }
}
