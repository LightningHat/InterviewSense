import React, { useState } from 'react';
import { Mic, MicOff, Volume2, Loader, AlertTriangle, Send } from 'lucide-react';
import { AudioPipelineStatus } from '../audio/types.js';

interface InterviewViewProps {
  questionText: string;
  questionKind: 'main' | 'followup';
  audioState: AudioPipelineStatus;
  liveCaption: string;
  standardBankFallbackBanner: boolean;
  typedAnswerMode: boolean;
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

