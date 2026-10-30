import React from 'react';
import { Award, CheckCircle, AlertCircle, Lightbulb, Clock, Download, ArrowLeft } from 'lucide-react';
import { ReportResponse, Turn } from '@interviewsense/schemas';

interface ReportViewProps {
  report: ReportResponse;
  turns: Turn[];
  onNewInterview: () => void;
  onExportJSON: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  report,
  turns,
  onNewInterview,
  onExportJSON,
}) => {
  // Aggregate delivery stats across turns
  const avgWpm = turns.length > 0
    ? Math.round(turns.reduce((acc, t) => acc + t.delivery.wpm, 0) / turns.length)
    : 120;
    
  const avgFillerRate = turns.length > 0
    ? Number((turns.reduce((acc, t) => acc + t.delivery.fillerRate, 0) / turns.length).toFixed(2))
    : 0.02;

  const totalDurationMin = turns.length > 0
    ? (turns.reduce((acc, t) => acc + t.delivery.durationMs, 0) / 60000).toFixed(1)
    : '5.0';

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', padding: '40px 20px', minHeight: '90vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 4px 0', color: '#f8fafc' }}>
            Interview Evaluation
          </h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
            Comprehensive performance report and feedback
          </p>
        </div>
        <button
          onClick={onNewInterview}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}
        >
          <ArrowLeft size={16} /> New Interview
        </button>
      </header>

      {/* Score Header Card */}
      <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: '1px solid #334155', borderRadius: '20px', padding: '32px', marginBottom: '28px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Overall Assessment
          </span>
          <p style={{ fontSize: '1.1rem', color: '#f1f5f9', lineHeight: 1.6, margin: '12px 0 0 0' }}>
            {report.overall}
          </p>
        </div>
        <div style={{ textAlign: 'center', minWidth: '130px', padding: '16px 24px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid #0284c7', borderRadius: '16px' }}>
          <div style={{ fontSize: '3rem', fontWeight: 900, color: '#38bdf8', lineHeight: 1 }}>
            {report.score_0_100}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Overall Score / 100</span>
        </div>
      </div>

      {/* Delivery Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '18px' }}>
          <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Average Cadence</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '6px' }}>
            {avgWpm} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>WPM</span>
          </div>
        </div>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '18px' }}>
          <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Filler Word Rate</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '6px' }}>
            {(avgFillerRate * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '18px' }}>
          <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Total Speech Time</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '6px' }}>
            {totalDurationMin} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>min</span>
          </div>
        </div>
      </div>

      {/* Three Strengths and Three Gaps Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Strengths */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#4ade80', fontSize: '1.15rem' }}>
            <CheckCircle size={20} /> Three Key Strengths
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1', lineHeight: 1.7, fontSize: '0.95rem' }}>
            {report.strengths.slice(0, 3).map((s, idx) => (
              <li key={idx} style={{ marginBottom: '8px' }}>{s}</li>
            ))}
          </ul>
        </div>

        {/* Gaps */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '1.15rem' }}>
            <AlertCircle size={20} /> Three Key Areas for Growth
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1', lineHeight: 1.7, fontSize: '0.95rem' }}>
            {report.gaps.slice(0, 3).map((g, idx) => (
              <li key={idx} style={{ marginBottom: '8px' }}>{g}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Practical Advice */}
      {report.advice && report.advice.length > 0 && (
        <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '1.15rem' }}>
            <Lightbulb size={20} /> Actionable Next Steps
          </h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1', lineHeight: 1.7, fontSize: '0.95rem' }}>
            {report.advice.map((adv, idx) => (
              <li key={idx} style={{ marginBottom: '6px' }}>{adv}</li>
            ))}
          </ul>
        </div>
      )}

      {/* JSON Export Link (Section 5.7) */}
      <footer style={{ textAlign: 'center', paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
        <button
          onClick={onExportJSON}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Download size={14} /> Export interview session as JSON
        </button>
      </footer>
    </div>
  );
};
