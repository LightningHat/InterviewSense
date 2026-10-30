import React, { useState, useRef } from 'react';
import { Upload, Play, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { parseResumeFile } from '../resume/parser.js';
import { extractProfileFromText } from '../resume/extractor.js';
import { Profile } from '@interviewsense/schemas';

interface HomeViewProps {
  onStartStandard: () => void;
  onStartWithResume: (profile: Profile) => void;
  isPreparing: boolean;
  preparationMessage?: string;
  hasResumeSession?: boolean;
  onResumeSession?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onStartStandard,
  onStartWithResume,
  isPreparing,
  preparationMessage,
  hasResumeSession,
  onResumeSession,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = async (file: File) => {
    setErrorMsg(null);
    const result = await parseResumeFile(file);
    if (!result.success) {
      if (result.isScannedOrEmpty) {
        setShowPasteBox(true);
      }
      setErrorMsg(result.error || 'Failed to extract text from file.');
      return;
    }

    const profile = extractProfileFromText(result.text);
    onStartWithResume(profile);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handlePasteSubmit = () => {
    if (pastedText.trim().length < 100) {
      setErrorMsg('Please paste at least 100 characters of resume or background text.');
      return;
    }
    setErrorMsg(null);
    const profile = extractProfileFromText(pastedText);
    onStartWithResume(profile);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '12px', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          InterviewSense
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1.1rem', margin: 0 }}>
          Voice-first AI practice interview. Zero audio uploads.
        </p>
      </header>

      {hasResumeSession && !isPreparing && (
        <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid #0284c7', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#e0f2fe' }}>You have an active interview in progress.</span>
          <button
            onClick={onResumeSession}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            <RefreshCw size={16} /> Resume Session
          </button>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginBottom: '24px', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {showPasteBox ? (
        <div style={{ background: '#1e293b', padding: '24px', borderRadius: '16px', border: '1px solid #334155', marginBottom: '24px' }}>
          <h3 style={{ marginTop: 0, color: '#f8fafc' }}>Paste Resume Text</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>We could not detect clear text from your document. Paste your resume text below:</p>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={8}
            placeholder="Paste your resume or project details here..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.95rem', resize: 'vertical' }}
          />
          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowPasteBox(false)}
              style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '8px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handlePasteSubmit}
              style={{ padding: '8px 20px', background: '#2563eb', border: 'none', color: '#ffffff', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
            >
              Submit & Start
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          {/* Tile 1: Upload Resume */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isPreparing && fileInputRef.current?.click()}
            style={{
              background: isDragging ? '#1e293b' : '#0f172a',
              border: `2px dashed ${isDragging ? '#38bdf8' : '#334155'}`,
              borderRadius: '20px',
              padding: '40px 24px',
              textAlign: 'center',
              cursor: isPreparing ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '220px',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
            />
            {isPreparing ? (
              <div>
                <RefreshCw size={36} color="#38bdf8" style={{ animation: 'spin 1.5s linear infinite', marginBottom: '16px' }} />
                <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '1.25rem' }}>Preparing Interview</h3>
                <p style={{ margin: 0, color: '#38bdf8', fontSize: '0.95rem' }}>{preparationMessage || 'Analyzing profile and building question tree...'}</p>
              </div>
            ) : (
              <div>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                  <Upload size={28} color="#38bdf8" />
                </div>
                <h2 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '1.35rem', fontWeight: 700 }}>Upload Your Resume</h2>
                <p style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '0.95rem' }}>Tap or drop a PDF, DOCX, or TXT file</p>
                <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#1e293b', padding: '4px 10px', borderRadius: '12px' }}>Tailored questions from projects</span>
              </div>
            )}
          </div>

          {/* Tile 2: Standard Interview */}
          <div
            onClick={() => !isPreparing && onStartStandard()}
            style={{
              background: '#0f172a',
              border: '2px solid #334155',
              borderRadius: '20px',
              padding: '40px 24px',
              textAlign: 'center',
              cursor: isPreparing ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '220px',
            }}
          >
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <Play size={28} color="#818cf8" style={{ marginLeft: '4px' }} />
            </div>
            <h2 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '1.35rem', fontWeight: 700 }}>Standard Interview</h2>
            <p style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '0.95rem' }}>No resume required. Instant start.</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#1e293b', padding: '4px 10px', borderRadius: '12px' }}>Embedded Systems Intern Seed Bank</span>
          </div>
        </div>
      )}

      {/* Small Privacy Line (Section 5.7) */}
      <footer style={{ textAlign: 'center', marginTop: 'auto' }}>
        <p style={{ color: '#64748b', fontSize: '0.82rem', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <FileText size={14} />
          Your resume is read on your device and only a short anonymised profile is sent to the server.
        </p>
      </footer>
    </div>
  );
};
