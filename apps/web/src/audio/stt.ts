import { CONFIG } from '../config.js';
import { RuntimeProfile } from '@interviewsense/schemas';
import type { STTWorkerIncomingMessage, STTWorkerOutgoingMessage } from './types.js';

export interface STTProgress {
  progress: number;
  file: string;
}

export interface STTResult {
  id: string;
  text: string;
  wordCount: number;
  fillerRate: number;
  wpm: number;
  durationMs: number;
}

export class STTManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (res: STTResult) => void; reject: (err: Error) => void }
  >();
  private isReady = false;
  private loadPromise: Promise<void> | null = null;

  constructor(private onProgress?: (progress: STTProgress) => void) {}

  public async initialize(profile: RuntimeProfile): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = new Promise<void>((resolve, reject) => {
      try {
        // Instantiate Web Worker using Vite standard syntax
        this.worker = new Worker(new URL('./stt.worker.ts', import.meta.url), {
          type: 'module',
        });

        this.worker.onmessage = (event: MessageEvent<STTWorkerOutgoingMessage>) => {
          const msg = event.data;
          if (msg.type === 'ready') {
            this.isReady = true;
            resolve();
          } else if (msg.type === 'progress') {
            this.onProgress?.({ progress: msg.progress, file: msg.file });
          } else if (msg.type === 'result') {
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              pending.resolve({
                id: msg.id,
                text: msg.text,
                wordCount: msg.wordCount,
                fillerRate: msg.fillerRate,
                wpm: msg.wpm,
                durationMs: msg.durationMs,
              });
            }
          } else if (msg.type === 'error') {
            if (msg.id) {
              const pending = this.pendingRequests.get(msg.id);
              if (pending) {
                this.pendingRequests.delete(msg.id);
                pending.reject(new Error(msg.message));
              }
            } else {
              this.isReady = false;
              reject(new Error(msg.message));
            }
          }
        };

        this.worker.onerror = (err) => {
          this.isReady = false;
          reject(new Error(`STT Worker error: ${err.message}`));
        };

        // Determine model and device based on profile
        const model =
          profile === 'local-gpu'
            ? CONFIG.stt.models.gpu
            : CONFIG.stt.models.cpu;

        const device = profile === 'local-gpu' ? 'webgpu' : 'wasm';

        this.worker.postMessage({
          type: 'load',
          model,
          device,
        } satisfies STTWorkerIncomingMessage);
      } catch (err: any) {
        reject(err);
      }
    });

    return this.loadPromise;
  }

  public async transcribe(audio: Float32Array): Promise<STTResult> {
    if (!this.worker || !this.isReady) {
      throw new Error('STT Worker is not initialized or ready.');
    }

    const id = `stt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise<STTResult>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage({
        type: 'transcribe',
        id,
        audio,
      } satisfies STTWorkerIncomingMessage);

      // Safety timeout: 15s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Transcription timed out after 15 seconds.'));
        }
      }, 15000);
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isReady = false;
    this.loadPromise = null;
    this.pendingRequests.clear();
  }
}

