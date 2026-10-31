import React, { useState } from 'react';
import { Mic, MicOff, Volume2, Loader, AlertTriangle, Send, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { AudioPipelineStatus } from '../audio/types.js';
import { Turn } from '@interviewsense/schemas';

interface InterviewViewProps {
  questionText: string;
  questionKind: 'main' | 'followup';
  audioState: AudioPipelineStatus;
  liveCaption: string;
  standardBankFallbackBanner: boolean;
  typedAnswerMode: boolean;
  lastTurn?: Turn;
  onEndInterview: () => void;
  onSubmitTypedAnswer: (text: string) => void;
  onToggleTypedMode: () => void;
}

export const InterviewView: React.FC<InterviewViewProps> = ({
  questionText,
  questionKind,
  audioState,
  liveCaption,
  standardBankFallbackBanner,
  typedAnswerMode,
  lastTurn,
  onEndInterview,
  onSubmitTypedAnswer,
  onToggleTypedMode,
}) => {
  const [typedInput, setTypedInput] = useState('');

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typedInput.trim()) {
      onSubmitTypedAnswer(typedInput.trim());
      setTypedInput('');
    }
  };

  const getStatusColor = () => {
    switch (audioState) {
      case 'listening':
        return '#22c55e'; // green
      case 'speaking':
        return '#38bdf8'; // sky blue
      case 'processing':
        return '#f59e0b'; // amber
      default:
        return '#64748b'; // slate
    }
  };

  const getStatusLabel = () => {
    switch (audioState) {
      case 'listening':
        return 'Listening...';
      case 'speaking':
        return 'Speaking Question...';
      case 'processing':
        return 'Processing Answer...';
      default:
        return 'Ready';
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 20px', minHeight: '90vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {/* Top Banner (Section 5.7 Fallback) */}
      <div>
        {standardBankFallbackBanner && (
          <div style={{ marginBottom: '20px', padding: '10px 16px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #eab308', borderRadius: '10px', color: '#fef08a', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>Using standard questions (custom bank generation unavailable)</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          {/* Audio Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(),
                }}
              />
              {audioState === 'listening' && (
                <div
                  style={{
                    position: 'absolute',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: '2px solid #22c55e',
                    animation: 'pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }}
                />
              )}
            </div>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: getStatusColor(), textTransform: 'capitalize' }}>
              {getStatusLabel()}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onToggleTypedMode}
              style={{ padding: '6px 12px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              {typedAnswerMode ? 'Use Microphone' : 'Type Answers'}
            </button>
            <button
              onClick={onEndInterview}
              style={{ padding: '6px 16px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
            >
              End Interview
            </button>
          </div>
        </div>
      </div>

      {/* Previous Answer Feedback Card */}
      {lastTurn && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid #334155',
            borderRadius: '14px',
            padding: '16px 20px',
            marginBottom: '16px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Previous Answer Feedback
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor:
                    lastTurn.band === 'strong'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : lastTurn.band === 'partial'
                      ? 'rgba(234, 179, 8, 0.15)'
                      : 'rgba(248, 113, 113, 0.15)',
                  color:
                    lastTurn.band === 'strong'
                      ? '#4ade80'
                      : lastTurn.band === 'partial'
                      ? '#facc15'
                      : '#f87171',
                }}
              >
                {lastTurn.band.toUpperCase()}
              </span>
            </div>
            {lastTurn.delivery?.wpm ? (
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {Math.round(lastTurn.delivery.wpm)} WPM
              </span>
            ) : null}
          </div>

          {/* Feedback details */}
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px' }}>
            {lastTurn.band === 'strong' && 'Great response! You covered the core technical concepts well.'}
            {lastTurn.band === 'partial' && 'Good points mentioned. The interviewer is digging deeper into details:'}
            {lastTurn.band === 'weak' && 'Covered limited concepts. Moving to the next question:'}
            {lastTurn.band === 'offtopic' && 'Response did not directly address the question. Refocusing:'}
          </div>

          {/* Covered concepts chips */}
          {lastTurn.analysis?.covered && lastTurn.analysis.covered.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Recognized:</span>
              {lastTurn.analysis.covered.map((concept, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '0.75rem',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    color: '#86efac',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  ✓ {concept}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Center Area: Large Question Text */}
      <div style={{ margin: 'auto 0', textAlign: 'center', padding: '24px 0' }}>
        {questionKind === 'followup' && (
          <span style={{ display: 'inline-block', marginBottom: '16px', padding: '4px 12px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Follow-up Question
          </span>
        )}
        <h2 style={{ fontSize: '1.85rem', fontWeight: 700, lineHeight: 1.4, color: '#f8fafc', margin: '0 auto', maxWidth: '720px' }}>
          {questionText}
        </h2>
      </div>

      {/* Live Captions & Inputs Area */}
      <div>
        {typedAnswerMode ? (
          <form onSubmit={handleTypedSubmit} style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder="Type your response here and press Enter..."
                autoFocus
                style={{ flex: 1, padding: '14px 16px', background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', color: '#f8fafc', fontSize: '1rem', outline: 'none' }}
              />
              <button
                type="submit"
                disabled={!typedInput.trim()}
                style={{ padding: '0 20px', background: typedInput.trim() ? '#2563eb' : '#1e293b', border: 'none', borderRadius: '12px', color: '#ffffff', cursor: typedInput.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        ) : null}

        {/* Small Live Captions (Section 5.7) */}
        <div style={{ minHeight: '60px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px 18px', color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5 }}>
          <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Transcript Captions
          </span>
          {liveCaption || <span style={{ color: '#475569', fontStyle: 'italic' }}>Listening for your voice response...</span>}
        </div>
      </div>
    </div>
  );
};

