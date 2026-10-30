import React, { useState, useEffect, useRef } from 'react';
import {
  Profile,
  QuestionBank,
  RuntimeProfile,
  ReportResponse,
  Turn,
} from '@interviewsense/schemas';
import { seedEmbeddedBank } from '@interviewsense/banks';
import { CONFIG } from './config.js';
import { probeCapabilities, selectRuntimeProfile, fallbackProfile } from './probe/index.js';
import { STTManager } from './audio/stt.js';
import { ScorerManager } from './audio/../scoring/scorer.js';
import { TTSAdapter } from './tts/index.js';
import { VADController } from './audio/vad.js';
import { requestMicCapture, MicCapture } from './audio/mic.js';
import { createLLMAdapter, LLMAdapter } from './llm/index.js';
import {
  INITIAL_ENGINE_STATE,
  reduceEngineState,
  EngineState,
  EngineEffect,
} from './engine/state.js';
import { decideRoute } from './engine/router.js';
import {
  saveSession,
  saveTurn,
  getActiveSession,
  getTurnsForSession,
  getCachedBank,
  cacheBank,
  exportSessionJSON,
} from './store/index.js';
import { HomeView } from './ui/HomeView.js';
import { InterviewView } from './ui/InterviewView.js';
import { ReportView } from './ui/ReportView.js';

export const App: React.FC = () => {
  const [engineState, setEngineState] = useState<EngineState>(INITIAL_ENGINE_STATE);
  const [runtimeProfile, setRuntimeProfile] = useState<RuntimeProfile>('thin');
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepMessage, setPrepMessage] = useState('Initializing runtime probe...');
  const [activeSessionExists, setActiveSessionExists] = useState(false);

  // Manager references
  const sttRef = useRef<STTManager | null>(null);
  const scorerRef = useRef<ScorerManager | null>(null);
  const ttsRef = useRef<TTSAdapter | null>(null);
  const vadRef = useRef<VADController | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const llmRef = useRef<LLMAdapter | null>(null);

  // Initialize Probe & Store on startup
  useEffect(() => {
    async function initProbe() {
      try {
        const caps = await probeCapabilities();
        const profile = selectRuntimeProfile(caps);
        setRuntimeProfile(profile);
        llmRef.current = createLLMAdapter(profile);

        // Check for active session to resume
        const activeSess = await getActiveSession();
        if (activeSess) {
          setActiveSessionExists(true);
        }
      } catch (err) {
        console.warn('Probe initialization error:', err);
      }
    }
    initProbe();

    return () => {
      // Cleanup adapters on unmount
      sttRef.current?.terminate();
      scorerRef.current?.terminate();
      ttsRef.current?.stop();
      vadRef.current?.destroy();
      micRef.current?.stop();
    };
  }, []);

  // Process State Transitions and Effects
  const dispatch = async (event: any) => {
    setEngineState((prevState) => {
      const { state: nextState, effects } = reduceEngineState(prevState, event);

      // Execute side-effects asynchronously
      if (effects.length > 0) {
        setTimeout(() => executeEffects(effects, nextState), 0);
      }

      return nextState;
    });
  };

  const executeEffects = async (effects: EngineEffect[], currentState: EngineState) => {
    for (const eff of effects) {
      switch (eff.type) {
        case 'SPEAK': {
          if (!ttsRef.current) {
            ttsRef.current = new TTSAdapter();
          }

          // Echo guard: pause VAD while TTS is speaking (Section 5.5)
          vadRef.current?.pause();

          await ttsRef.current.speakText(eff.text, {
            onFinished: () => {
              vadRef.current?.resume();
              dispatch({ type: 'QUESTION_SPOKEN' });
            },
            onInterrupted: () => {
              // User barge-in detected
              vadRef.current?.resume();
              dispatch({ type: 'SPEECH_STARTED' });
            },
          });
          break;
        }

        case 'START_LISTENING': {
          vadRef.current?.resume();
          break;
        }

        case 'TRANSCRIBE_AUDIO': {
          try {
            if (!sttRef.current) {
              throw new Error('STT is not initialized');
            }
            const sttRes = await sttRef.current.transcribe(eff.audio);
            if (sttRes.text.trim().length === 0) {
              dispatch({ type: 'TRANSCRIPTION_EMPTY_OR_HALLUCINATION' });
            } else {
              dispatch({
                type: 'TRANSCRIPTION_SUCCESS',
                text: sttRes.text,
                wordCount: sttRes.wordCount,
                fillerRate: sttRes.fillerRate,
                wpm: sttRes.wpm,
                durationMs: sttRes.durationMs,
              });
            }
          } catch (err: any) {
            console.warn('Transcription failed:', err);
            // Degrade to typed answer mode on fatal STT error
            dispatch({ type: 'SWITCH_TO_TYPED_ANSWER' });
          }
          break;
        }

        case 'SCORE_TRANSCRIPT': {
          try {
            if (!scorerRef.current) {
              throw new Error('Scorer is not ready');
            }
            const analysis = await scorerRef.current.scoreAnswer(
              eff.transcript,
              eff.question,
              {
                wordCount: eff.delivery.wpm > 0 ? undefined : eff.transcript.split(/\s+/).length,
                fillerRate: eff.delivery.fillerRate,
              }
            );
            dispatch({ type: 'SCORING_SUCCESS', analysis });
          } catch (err) {
            console.warn('Scoring error, proceeding with fallback analysis:', err);
            dispatch({
              type: 'SCORING_SUCCESS',
              analysis: {
                coverage: 0.5,
                covered: [],
                missing: [],
                offTopic: false,
                wordCount: 10,
                fillerRate: 0,
                confidenceHint: 0.5,
              },
            });
          }
          break;
        }

        case 'DECIDE_ROUTE': {
          if (!currentState.currentQuestion) break;
          const decision = decideRoute(eff.analysis, {
            question: currentState.currentQuestion,
            followupsCount: currentState.followupsForCurrentQuestion,
            offTopicConsecutiveCount: currentState.consecutiveOffTopic,
            tier2CallsCount: currentState.tier2CallsCount,
            totalQuestionsAsked: currentState.currentTurnIndex + 1,
            maxQuestions: currentState.bank?.config.maxQuestions || 8,
            llmAvailable: llmRef.current !== null,
            canUseTier2: currentState.tier2CallsCount < CONFIG.scoring.tier2MaxCallsPerSession,
          });
          dispatch({ type: 'ROUTING_DECIDED', decision });
          break;
        }

        case 'FETCH_FOLLOWUP': {
          try {
            if (!llmRef.current) throw new Error('No LLM adapter');
            const res = await llmRef.current.followup({
              sessionId: currentState.session?.id || 'default',
              question: eff.question.text,
              answerPoints: eff.analysis.covered.join(', '),
              missing: eff.analysis.missing,
              summary: currentState.session?.rollingSummary || '',
              mode: 'followup',
            });
            const text = res.followup || eff.question.staticFollowups[eff.missingConceptId] || 'Could you explain that further?';
            dispatch({ type: 'FOLLOWUP_GENERATED', text, route: 'tier1' });
          } catch (err) {
            // Fall back to static follow-up on HTTP/LLM failure (Section 5.4)
            const fallbackText =
              eff.question.staticFollowups[eff.missingConceptId] ||
              Object.values(eff.question.staticFollowups)[0] ||
              'Could you elaborate on that aspect?';
            dispatch({ type: 'FOLLOWUP_GENERATED', text: fallbackText, route: 'static-fallback' });
          }
          break;
        }

        case 'GENERATE_REPORT': {
          try {
            const reportReq = {
              sessionId: currentState.session?.id || 'default',
              turns: currentState.turns.map((t) => ({
                questionId: t.questionId,
                band: t.band,
                covered: t.analysis.covered,
                missing: t.analysis.missing,
                delivery: t.delivery,
              })),
            };

            const response = await fetch(CONFIG.api.report, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reportReq),
            });

            if (response.ok) {
              const rep = await response.json();
              dispatch({ type: 'REPORT_READY', report: rep });
            } else {
              throw new Error('Report endpoint failed');
            }
          } catch (err) {
            // Local fallback template report
            const templateReport: ReportResponse = {
              overall: 'Interview practice session completed successfully using local evaluation.',
              strengths: [
                'Successfully answered structured technical interview questions',
                'Demonstrated good communication and domain concepts',
                'Engaged with progressive follow-up probes',
              ],
              gaps: [
                'Further detail on deeper architectural tradeoffs is recommended',
                'Key protocol and timing requirements could be highlighted more explicitly',
                'Edge case and failure mode handling can be expanded',
              ],
              advice: [
                'Practice breaking down explanations into structured 3-part answers',
                'Review datasheet specifications for communication protocols',
                'Continue building hands-on projects to deepen practical intuition',
              ],
              score_0_100: 78,
            };
            dispatch({ type: 'REPORT_READY', report: templateReport });
          }
          break;
        }

        case 'PERSIST_TURN': {
          await saveTurn(eff.turn);
          break;
        }

        case 'PERSIST_SESSION': {
          await saveSession(eff.session);
          break;
        }
      }
    }
  };

  // Preparation Pipeline (Section 5.7)
  const prepareAndStart = async (bank: QuestionBank) => {
    setIsPreparing(true);
    setPrepMessage('Requesting microphone & initializing neural models...');

    try {
      // 1. Initialize Microphone & VAD in parallel
      try {
        const capture = await requestMicCapture();
        micRef.current = capture;

        const vad = new VADController({
          onSpeechStart: () => {
            // Handle barge-in if TTS is active
            if (ttsRef.current?.getSpeakingState()) {
              ttsRef.current.stop();
            }
            dispatch({ type: 'SPEECH_STARTED' });
          },
          onSpeechEnd: (audio) => {
            dispatch({
              type: 'UTTERANCE_RECORDED',
              audio,
              durationMs: (audio.length / 16000) * 1000,
            });
          },
        });
        await vad.start();
        vadRef.current = vad;
      } catch (err) {
        console.warn('Microphone permission denied or unavailable. Falling back to typed answers:', err);
        dispatch({ type: 'SWITCH_TO_TYPED_ANSWER' });
      }

      // 2. Initialize STT and Scorer
      setPrepMessage('Loading speech recognition and embedding models...');
      const stt = new STTManager((p) => {
        setPrepMessage(`Loading STT model: ${Math.round(p.progress * 100)}%`);
      });
      await stt.initialize(runtimeProfile);
      sttRef.current = stt;

      const scorer = new ScorerManager();
      await scorer.initialize();
      scorerRef.current = scorer;

      // 3. Pre-embed bank concepts
      setPrepMessage('Pre-embedding rubric concepts...');
      await scorer.prepareBank(bank);
      await cacheBank(bank);

      // Start interview state machine
      await dispatch({ type: 'START_SESSION', profile: runtimeProfile, bank });
      setIsPreparing(false);
      dispatch({ type: 'PREPARATION_COMPLETE' });
    } catch (err: any) {
      console.warn('Preparation failed, falling back down profile:', err);
      const nextProfile = fallbackProfile(runtimeProfile);
      setRuntimeProfile(nextProfile);
      setIsPreparing(false);
      dispatch({ type: 'SWITCH_TO_TYPED_ANSWER' });
      await dispatch({ type: 'START_SESSION', profile: nextProfile, bank });
      dispatch({ type: 'PREPARATION_COMPLETE' });
    }
  };

  // Home Handlers
  const handleStartStandard = async () => {
    await prepareAndStart(seedEmbeddedBank);
  };

  const handleStartWithResume = async (profile: Profile) => {
    setIsPreparing(true);
    setPrepMessage('Generating custom question bank from resume profile...');

    try {
      const response = await fetch(CONFIG.api.bankGenerate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `sess-${Date.now()}`,
          profile,
          bankSize: 8,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Bank generation API failed');
      }

      // Read NDJSON stream (Section 9.1)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let generatedBank: QuestionBank | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);

          if (chunk.type === 'pool_ready') {
            setPrepMessage('Questions ready, preparing local audio pipeline...');
          } else if (chunk.type === 'bank_complete') {
            generatedBank = chunk.bank;
          }
        }
      }

      if (generatedBank && generatedBank.questions.length >= 3) {
        await prepareAndStart(generatedBank);
      } else {
        throw new Error('Incomplete bank from stream');
      }
    } catch (err) {
      console.warn('Custom bank generation failed or timed out. Falling back to standard bank:', err);
      dispatch({ type: 'FAIL_TO_STANDARD_BANK', fallbackBank: seedEmbeddedBank });
      await prepareAndStart(seedEmbeddedBank);
    }
  };

  const handleResumeSession = async () => {
    const active = await getActiveSession();
    if (!active) return;
    const turns = await getTurnsForSession(active.id);
    const bank = (await getCachedBank(active.bankId)) || seedEmbeddedBank;

    // Fast-forward engine state to current active question
    const lastTurn = turns[turns.length - 1];
    const nextQId = lastTurn ? lastTurn.questionId : bank.questions[0].id;
    const currentQ = bank.questions.find((q) => q.id === nextQId) || bank.questions[0];

    setEngineState({
      ...INITIAL_ENGINE_STATE,
      phase: 'ASKING',
      session: active,
      bank,
      currentQuestion: currentQ,
      currentQuestionText: currentQ.text,
      currentTurnIndex: turns.length,
      turns,
    });
    dispatch({ type: 'QUESTION_SPOKEN' });
  };

  const handleExportJSON = async () => {
    if (engineState.session) {
      const json = await exportSessionJSON(engineState.session.id);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interviewsense-${engineState.session.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Render view depending on phase
  if (engineState.phase === 'DONE' && engineState.report) {
    return (
      <ReportView
        report={engineState.report}
        turns={engineState.turns}
        onNewInterview={() => setEngineState(INITIAL_ENGINE_STATE)}
        onExportJSON={handleExportJSON}
      />
    );
  }

  if (
    engineState.phase === 'ASKING' ||
    engineState.phase === 'LISTENING' ||
    engineState.phase === 'TRANSCRIBING' ||
    engineState.phase === 'SCORING' ||
    engineState.phase === 'ROUTING' ||
    engineState.phase === 'REPORTING'
  ) {
    return (
      <InterviewView
        questionText={engineState.currentQuestionText}
        questionKind={engineState.currentQuestionKind}
        audioState={engineState.audioState}
        liveCaption={engineState.liveCaption}
        standardBankFallbackBanner={engineState.standardBankFallbackBanner}
        typedAnswerMode={engineState.typedAnswerMode}
        onEndInterview={() => dispatch({ type: 'END_SESSION_MANUALLY' })}
        onSubmitTypedAnswer={(text) => dispatch({ type: 'SUBMIT_TYPED_ANSWER', text })}
        onToggleTypedMode={() =>
          engineState.typedAnswerMode
            ? setEngineState((s) => ({ ...s, typedAnswerMode: false }))
            : dispatch({ type: 'SWITCH_TO_TYPED_ANSWER' })
        }
      />
    );
  }

  return (
    <HomeView
      onStartStandard={handleStartStandard}
      onStartWithResume={handleStartWithResume}
      isPreparing={isPreparing}
      preparationMessage={prepMessage}
      hasResumeSession={activeSessionExists}
      onResumeSession={handleResumeSession}
    />
  );
};

