import { appendToRollingSummary } from './summary.js';
export const INITIAL_ENGINE_STATE = {
    phase: 'IDLE',
    session: null,
    bank: null,
    currentQuestion: null,
    currentQuestionKind: 'main',
    currentQuestionText: '',
    currentTurnIndex: 0,
    turns: [],
    followupsForCurrentQuestion: 0,
    consecutiveOffTopic: 0,
    tier2CallsCount: 0,
    liveCaption: '',
    audioState: 'idle',
    error: null,
    typedAnswerMode: false,
    standardBankFallbackBanner: false,
    report: null,
};
export function reduceEngineState(state, event) {
    const effects = [];
    switch (event.type) {
        case 'START_SESSION': {
            const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const firstQuestion = event.bank.questions[0] || null;
            const newSession = {
                id: sessionId,
                bankId: event.bank.id,
                bankVersion: event.bank.version,
                profile: event.profile,
                startedAt: Date.now(),
                rollingSummary: '',
                tokensUsed: { in: 0, out: 0 },
                status: 'active',
            };
            const nextState = {
                ...INITIAL_ENGINE_STATE,
                phase: 'PREPARING',
                session: newSession,
                bank: event.bank,
                currentQuestion: firstQuestion,
                currentQuestionKind: 'main',
                currentQuestionText: firstQuestion ? firstQuestion.text : '',
                audioState: 'processing',
            };
            effects.push({ type: 'PERSIST_SESSION', session: newSession });
            return { state: nextState, effects };
        }
        case 'PREPARATION_COMPLETE': {
            if (!state.currentQuestion) {
                return {
                    state: { ...state, phase: 'ERROR', error: { message: 'No questions in bank', retryable: false } },
                    effects,
                };
            }
            const nextState = {
                ...state,
                phase: 'ASKING',
                audioState: 'speaking',
                currentQuestionText: state.currentQuestion.text,
            };
            effects.push({ type: 'SPEAK', text: state.currentQuestion.text });
            return { state: nextState, effects };
        }
        case 'QUESTION_SPOKEN': {
            const nextState = {
                ...state,
                phase: 'LISTENING',
                audioState: 'listening',
            };
            if (!state.typedAnswerMode) {
                effects.push({ type: 'START_LISTENING' });
            }
            return { state: nextState, effects };
        }
        case 'SPEECH_STARTED': {
            return {
                state: { ...state, audioState: 'listening' },
                effects,
            };
        }
        case 'UTTERANCE_RECORDED': {
            const nextState = {
                ...state,
                phase: 'TRANSCRIBING',
                audioState: 'processing',
            };
            effects.push({ type: 'TRANSCRIBE_AUDIO', audio: event.audio });
            return { state: nextState, effects };
        }
        case 'SUBMIT_TYPED_ANSWER': {
            // Direct text submission skips audio transcription
            const words = event.text.trim().split(/\s+/).filter(Boolean);
            const wordCount = words.length;
            const durationMs = Math.max(wordCount * 300, 3000); // estimated typing duration
            const wpm = Math.round(wordCount / (durationMs / 60000));
            const nextState = {
                ...state,
                phase: 'SCORING',
                audioState: 'processing',
                liveCaption: event.text,
            };
            if (state.currentQuestion) {
                effects.push({
                    type: 'SCORE_TRANSCRIPT',
                    transcript: event.text,
                    question: state.currentQuestion,
                    delivery: { wpm, fillerRate: 0, durationMs },
                });
            }
            return { state: nextState, effects };
        }
        case 'TRANSCRIPTION_SUCCESS': {
            const nextState = {
                ...state,
                phase: 'SCORING',
                audioState: 'processing',
                liveCaption: event.text,
            };
            if (state.currentQuestion) {
                effects.push({
                    type: 'SCORE_TRANSCRIPT',
                    transcript: event.text,
                    question: state.currentQuestion,
                    delivery: {
                        wpm: event.wpm,
                        fillerRate: event.fillerRate,
                        durationMs: event.durationMs,
                    },
                });
            }
            return { state: nextState, effects };
        }
        case 'TRANSCRIPTION_EMPTY_OR_HALLUCINATION': {
            // Re-prompt once on silence or near silence
            const repromptText = `I didn't catch that. ${state.currentQuestionText}`;
            const nextState = {
                ...state,
                phase: 'ASKING',
                audioState: 'speaking',
            };
            effects.push({ type: 'SPEAK', text: repromptText });
            return { state: nextState, effects };
        }
        case 'SCORING_SUCCESS': {
            const nextState = {
                ...state,
                phase: 'ROUTING',
                audioState: 'processing',
            };
            effects.push({ type: 'DECIDE_ROUTE', analysis: event.analysis });
            return { state: nextState, effects };
        }
        case 'ROUTING_DECIDED': {
            const decision = event.decision;
            const turnId = `turn-${Date.now()}-${state.currentTurnIndex}`;
            // Construct Turn record
            const newTurn = {
                id: turnId,
                sessionId: state.session?.id || 'default-session',
                index: state.currentTurnIndex,
                questionId: state.currentQuestion?.id || 'unknown-q',
                kind: state.currentQuestionKind,
                questionText: state.currentQuestionText,
                transcript: state.liveCaption,
                analysis: {
                    coverage: 0,
                    covered: [],
                    missing: [],
                    offTopic: decision.band === 'offtopic',
                    wordCount: 0,
                    fillerRate: 0,
                    confidenceHint: 1,
                }, // will be augmented or stored
                route: decision.route,
                band: decision.band,
                delivery: { wpm: 0, fillerRate: 0, durationMs: 0 },
                createdAt: Date.now(),
            };
            const updatedTurns = [...state.turns, newTurn];
            const updatedSummary = state.session
                ? appendToRollingSummary(state.session.rollingSummary, newTurn)
                : '';
            const updatedSession = state.session
                ? { ...state.session, rollingSummary: updatedSummary }
                : null;
            effects.push({ type: 'PERSIST_TURN', turn: newTurn });
            if (updatedSession) {
                effects.push({ type: 'PERSIST_SESSION', session: updatedSession });
            }
            // Handle Route Decision Actions:
            if (decision.action === 'complete' || !decision.nextQuestionId && decision.action === 'advance') {
                const nextState = {
                    ...state,
                    phase: 'REPORTING',
                    audioState: 'processing',
                    turns: updatedTurns,
                    session: updatedSession,
                };
                effects.push({ type: 'GENERATE_REPORT' });
                return { state: nextState, effects };
            }
            if (decision.action === 'followup') {
                // Needs follow-up question
                if (decision.route === 'tier1' && state.currentQuestion) {
                    const nextState = {
                        ...state,
                        turns: updatedTurns,
                        session: updatedSession,
                        followupsForCurrentQuestion: state.followupsForCurrentQuestion + 1,
                    };
                    effects.push({
                        type: 'FETCH_FOLLOWUP',
                        question: state.currentQuestion,
                        analysis: newTurn.analysis,
                        missingConceptId: decision.missingConceptId || '',
                    });
                    return { state: nextState, effects };
                }
                else {
                    // Static follow-up
                    const followupText = decision.followupText || 'Could you elaborate on that point?';
                    const nextState = {
                        ...state,
                        phase: 'ASKING',
                        currentQuestionKind: 'followup',
                        currentQuestionText: followupText,
                        currentTurnIndex: state.currentTurnIndex + 1,
                        followupsForCurrentQuestion: state.followupsForCurrentQuestion + 1,
                        turns: updatedTurns,
                        session: updatedSession,
                        audioState: 'speaking',
                        consecutiveOffTopic: 0,
                    };
                    effects.push({ type: 'SPEAK', text: followupText });
                    return { state: nextState, effects };
                }
            }
            if (decision.action === 'rephrase') {
                const rephraseText = decision.followupText || state.currentQuestionText;
                const nextState = {
                    ...state,
                    phase: 'ASKING',
                    currentQuestionText: rephraseText,
                    consecutiveOffTopic: state.consecutiveOffTopic + 1,
                    audioState: 'speaking',
                    turns: updatedTurns,
                    session: updatedSession,
                };
                effects.push({ type: 'SPEAK', text: rephraseText });
                return { state: nextState, effects };
            }
            if (decision.action === 'advance' && decision.nextQuestionId) {
                const nextQ = state.bank?.questions.find((q) => q.id === decision.nextQuestionId) || null;
                if (!nextQ) {
                    // Reached end of graph
                    const nextState = {
                        ...state,
                        phase: 'REPORTING',
                        turns: updatedTurns,
                        session: updatedSession,
                        audioState: 'processing',
                    };
                    effects.push({ type: 'GENERATE_REPORT' });
                    return { state: nextState, effects };
                }
                const nextState = {
                    ...state,
                    phase: 'ASKING',
                    currentQuestion: nextQ,
                    currentQuestionKind: 'main',
                    currentQuestionText: nextQ.text,
                    currentTurnIndex: state.currentTurnIndex + 1,
                    followupsForCurrentQuestion: 0,
                    consecutiveOffTopic: 0,
                    turns: updatedTurns,
                    session: updatedSession,
                    audioState: 'speaking',
                };
                effects.push({ type: 'SPEAK', text: nextQ.text });
                return { state: nextState, effects };
            }
            return { state, effects };
        }
        case 'FOLLOWUP_GENERATED': {
            const nextState = {
                ...state,
                phase: 'ASKING',
                currentQuestionKind: 'followup',
                currentQuestionText: event.text,
                currentTurnIndex: state.currentTurnIndex + 1,
                audioState: 'speaking',
            };
            effects.push({ type: 'SPEAK', text: event.text });
            return { state: nextState, effects };
        }
        case 'REPORT_READY': {
            const completedSession = state.session
                ? { ...state.session, status: 'complete', endedAt: Date.now() }
                : null;
            const nextState = {
                ...state,
                phase: 'DONE',
                audioState: 'idle',
                report: event.report,
                session: completedSession,
            };
            if (completedSession) {
                effects.push({ type: 'PERSIST_SESSION', session: completedSession });
            }
            return { state: nextState, effects };
        }
        case 'FAIL_TO_STANDARD_BANK': {
            const firstQ = event.fallbackBank.questions[0] || null;
            const nextState = {
                ...state,
                bank: event.fallbackBank,
                currentQuestion: firstQ,
                currentQuestionKind: 'main',
                currentQuestionText: firstQ ? firstQ.text : '',
                standardBankFallbackBanner: true,
            };
            return { state: nextState, effects };
        }
        case 'SWITCH_TO_TYPED_ANSWER': {
            return {
                state: { ...state, typedAnswerMode: true, audioState: 'idle' },
                effects,
            };
        }
        case 'ERROR_OCCURRED': {
            return {
                state: {
                    ...state,
                    previousPhase: state.phase,
                    phase: 'ERROR',
                    error: event.error,
                    audioState: 'idle',
                },
                effects,
            };
        }
        case 'RETRY_FROM_ERROR': {
            const resumePhase = state.previousPhase || 'ASKING';
            const nextState = {
                ...state,
                phase: resumePhase,
                error: null,
            };
            if (resumePhase === 'ASKING' && state.currentQuestionText) {
                effects.push({ type: 'SPEAK', text: state.currentQuestionText });
            }
            return { state: nextState, effects };
        }
        case 'END_SESSION_MANUALLY': {
            const nextState = {
                ...state,
                phase: 'REPORTING',
                audioState: 'processing',
            };
            effects.push({ type: 'GENERATE_REPORT' });
            return { state: nextState, effects };
        }
        default:
            return { state, effects };
    }
}
