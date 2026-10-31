import {
  AnswerAnalysis,
  DeliveryStats,
  Question,
  QuestionBank,
  ReportResponse,
  RuntimeProfile,
  Session,
  Turn,
  TurnBand,
  TurnRoute,
} from '@interviewsense/schemas';
import { RouteDecision } from './router.js';
import { appendToRollingSummary } from './summary.js';

export type EnginePhase =
  | 'IDLE'
  | 'PREPARING'
  | 'ASKING'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'SCORING'
  | 'ROUTING'
  | 'REPORTING'
  | 'DONE'
  | 'ERROR';

export interface EngineState {
  phase: EnginePhase;
  previousPhase?: EnginePhase;
  session: Session | null;
  bank: QuestionBank | null;
  currentQuestion: Question | null;
  currentQuestionKind: 'main' | 'followup';
  currentQuestionText: string;
  currentTurnIndex: number;
  turns: Turn[];
  followupsForCurrentQuestion: number;
  consecutiveOffTopic: number;
  tier2CallsCount: number;
  liveCaption: string;
  audioState: 'listening' | 'speaking' | 'processing' | 'idle';
  error: { message: string; code?: string; retryable: boolean } | null;
  typedAnswerMode: boolean;
  standardBankFallbackBanner: boolean;
  report: ReportResponse | null;
}

export type EngineEvent =
  | { type: 'START_SESSION'; profile: RuntimeProfile; bank: QuestionBank }
  | { type: 'PREPARATION_COMPLETE' }
  | { type: 'QUESTION_SPOKEN' }
  | { type: 'SPEECH_STARTED' }
  | { type: 'UTTERANCE_RECORDED'; audio: Float32Array; durationMs: number }
  | { type: 'SUBMIT_TYPED_ANSWER'; text: string }
  | {
      type: 'TRANSCRIPTION_SUCCESS';
      text: string;
      wordCount: number;
      fillerRate: number;
      wpm: number;
      durationMs: number;
    }
  | { type: 'TRANSCRIPTION_EMPTY_OR_HALLUCINATION' }
  | { type: 'SCORING_SUCCESS'; analysis: AnswerAnalysis }
  | { type: 'ROUTING_DECIDED'; decision: RouteDecision; analysis?: AnswerAnalysis }
  | { type: 'FOLLOWUP_GENERATED'; text: string; route: TurnRoute }
  | { type: 'REPORT_READY'; report: ReportResponse }
  | { type: 'FAIL_TO_STANDARD_BANK'; fallbackBank: QuestionBank }
  | { type: 'SWITCH_TO_TYPED_ANSWER' }
  | { type: 'ERROR_OCCURRED'; error: { message: string; code?: string; retryable: boolean } }
  | { type: 'RETRY_FROM_ERROR' }
  | { type: 'END_SESSION_MANUALLY' };

export type EngineEffect =
  | { type: 'SPEAK'; text: string }
  | { type: 'START_LISTENING' }
  | { type: 'TRANSCRIBE_AUDIO'; audio: Float32Array }
  | { type: 'SCORE_TRANSCRIPT'; transcript: string; question: Question; delivery: DeliveryStats }
  | { type: 'DECIDE_ROUTE'; analysis: AnswerAnalysis }
  | { type: 'FETCH_FOLLOWUP'; question: Question; analysis: AnswerAnalysis; missingConceptId: string }
  | { type: 'GENERATE_REPORT' }
  | { type: 'PERSIST_TURN'; turn: Turn }
  | { type: 'PERSIST_SESSION'; session: Session };

export const INITIAL_ENGINE_STATE: EngineState = {
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

export function reduceEngineState(
  state: EngineState,
  event: EngineEvent
): { state: EngineState; effects: EngineEffect[] } {
  const effects: EngineEffect[] = [];

  switch (event.type) {
    case 'START_SESSION': {
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const firstQuestion = event.bank.questions[0] || null;

      const newSession: Session = {
        id: sessionId,
        bankId: event.bank.id,
        bankVersion: event.bank.version,
        profile: event.profile,
        startedAt: Date.now(),
        rollingSummary: '',
        tokensUsed: { in: 0, out: 0 },
        status: 'active',
      };

      const nextState: EngineState = {
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

      const nextState: EngineState = {
        ...state,
        phase: 'ASKING',
        audioState: 'speaking',
        currentQuestionText: state.currentQuestion.text,
      };

      effects.push({ type: 'SPEAK', text: state.currentQuestion.text });
      return { state: nextState, effects };
    }

    case 'QUESTION_SPOKEN': {
      const nextState: EngineState = {
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
      const nextState: EngineState = {
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

      const nextState: EngineState = {
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
      const nextState: EngineState = {
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
      const nextState: EngineState = {
        ...state,
        phase: 'ASKING',
        audioState: 'speaking',
      };
      effects.push({ type: 'SPEAK', text: repromptText });
      return { state: nextState, effects };
    }

    case 'SCORING_SUCCESS': {
      const nextState: EngineState = {
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
      const turnAnalysis: AnswerAnalysis = event.analysis || {
        coverage: 0,
        covered: [],
        missing: [],
        offTopic: decision.band === 'offtopic',
        wordCount: 0,
        fillerRate: 0,
        confidenceHint: 1,
      };

      // Construct Turn record
      const newTurn: Turn = {
        id: turnId,
        sessionId: state.session?.id || 'default-session',
        index: state.currentTurnIndex,
        questionId: state.currentQuestion?.id || 'unknown-q',
        kind: state.currentQuestionKind,
        questionText: state.currentQuestionText,
        transcript: state.liveCaption,
        analysis: turnAnalysis,
        route: decision.route,
        band: decision.band,
        delivery: { wpm: 0, fillerRate: 0, durationMs: 0 },
        createdAt: Date.now(),
      };

      const updatedTurns = [...state.turns, newTurn];
      const updatedSummary = state.session
        ? appendToRollingSummary(state.session.rollingSummary, newTurn)
        : '';

      const updatedSession: Session | null = state.session
        ? { ...state.session, rollingSummary: updatedSummary }
        : null;

      effects.push({ type: 'PERSIST_TURN', turn: newTurn });
      if (updatedSession) {
        effects.push({ type: 'PERSIST_SESSION', session: updatedSession });
      }

      // Handle Route Decision Actions:
      if (decision.action === 'complete' || !decision.nextQuestionId && decision.action === 'advance') {
        const nextState: EngineState = {
          ...state,
          phase: 'REPORTING',
          audioState: 'processing',
          turns: updatedTurns,
          session: updatedSession,
        };
        effects.push({ type: 'GENERATE_REPORT' });
        return { state: nextState, effects };
      }

      if (decision.action === 'adjudicate') {
        if (state.currentQuestion) {
          const nextState: EngineState = {
            ...state,
            phase: 'ROUTING',
            turns: updatedTurns,
            session: updatedSession,
            followupsForCurrentQuestion: state.followupsForCurrentQuestion + 1,
            tier2CallsCount: state.tier2CallsCount + 1,
            audioState: 'processing',
          };
          effects.push({
            type: 'FETCH_FOLLOWUP',
            question: state.currentQuestion,
            analysis: turnAnalysis,
            missingConceptId: decision.missingConceptId || '',
          });
          return { state: nextState, effects };
        }
      }

      if (decision.action === 'followup') {
        // Needs follow-up question
        if (decision.route === 'tier1' && state.currentQuestion) {
          const nextState: EngineState = {
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
        } else {
          // Static follow-up
          const followupText = decision.followupText || 'Could you elaborate on that point?';
          const nextState: EngineState = {
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
          effects.push({ type: 'SPEAK', text: `Got it. ${followupText}` });
          return { state: nextState, effects };
        }
      }

      if (decision.action === 'rephrase') {
        const rephraseText = decision.followupText || state.currentQuestionText;
        const nextState: EngineState = {
          ...state,
          phase: 'ASKING',
          currentQuestionText: rephraseText,
          consecutiveOffTopic: state.consecutiveOffTopic + 1,
          audioState: 'speaking',
          turns: updatedTurns,
          session: updatedSession,
        };
        effects.push({ type: 'SPEAK', text: `Let's refocus on this topic: ${rephraseText}` });
        return { state: nextState, effects };
      }

      if (decision.action === 'advance' && decision.nextQuestionId) {
        const nextQ = state.bank?.questions.find((q) => q.id === decision.nextQuestionId) || null;
        if (!nextQ) {
          // Reached end of graph
          const nextState: EngineState = {
            ...state,
            phase: 'REPORTING',
            turns: updatedTurns,
            session: updatedSession,
            audioState: 'processing',
          };
          effects.push({ type: 'GENERATE_REPORT' });
          return { state: nextState, effects };
        }

        const nextState: EngineState = {
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

        let spokenText = nextQ.text;
        if (decision.band === 'strong') {
          spokenText = `Great answer! Next question: ${nextQ.text}`;
        } else if (decision.band === 'partial') {
          spokenText = `Good explanation. Let's move to the next question: ${nextQ.text}`;
        } else if (decision.band === 'weak') {
          spokenText = `Thanks. Let's move on to the next question: ${nextQ.text}`;
        } else if (decision.band === 'skipped') {
          spokenText = `Let's move ahead to the next question: ${nextQ.text}`;
        }

        effects.push({ type: 'SPEAK', text: spokenText });
        return { state: nextState, effects };
      }

      return { state, effects };
    }

    case 'FOLLOWUP_GENERATED': {
      const nextState: EngineState = {
        ...state,
        phase: 'ASKING',
        currentQuestionKind: 'followup',
        currentQuestionText: event.text,
        currentTurnIndex: state.currentTurnIndex + 1,
        audioState: 'speaking',
      };
      effects.push({ type: 'SPEAK', text: `Got it. ${event.text}` });
      return { state: nextState, effects };
    }

    case 'REPORT_READY': {
      const completedSession: Session | null = state.session
        ? { ...state.session, status: 'complete', endedAt: Date.now() }
        : null;

      const nextState: EngineState = {
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
      const nextState: EngineState = {
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
      const nextState: EngineState = {
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
      const nextState: EngineState = {
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

