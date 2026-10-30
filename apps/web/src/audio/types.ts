export interface AudioPipelineConfig {
  sampleRate: number;
  speechStartThreshold: number;
  silenceTimeoutMs: number;
  minSpeechMs: number;
  maxAnswerLengthMs: number;
  preRollMs: number;
  silencePromptTimeoutMs: number;
}

export type AudioPipelineStatus = 'idle' | 'listening' | 'speaking' | 'processing';

export interface UtteranceEvent {
  id: string;
  audio: Float32Array;
  durationMs: number;
  sampleRate: number;
}

export type STTWorkerIncomingMessage =
  | { type: 'load'; model: string; device: 'webgpu' | 'wasm' }
  | { type: 'transcribe'; id: string; audio: Float32Array };

export type STTWorkerOutgoingMessage =
  | { type: 'ready' }
  | { type: 'progress'; progress: number; file: string }
  | { type: 'result'; id: string; text: string; wordCount: number; fillerRate: number; wpm: number; durationMs: number }
  | { type: 'error'; id?: string; message: string };

