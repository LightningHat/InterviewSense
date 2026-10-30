import { MicVAD } from '@ricky0123/vad-web';
import { CONFIG } from '../config.js';

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
  onError?: (err: Error) => void;
}

export class VADController {
  private vad: any = null;
  private isPaused: boolean = false;
  private callbacks: VADCallbacks = {};
  private preRollSamples: number;
  private preRollRingBuffer: Float32Array;
  private preRollWriteIndex: number = 0;
  private preRollFilled: boolean = false;

  constructor(callbacks: VADCallbacks = {}) {
    this.callbacks = callbacks;
    // 300 ms at 16 kHz = 4800 samples
    this.preRollSamples = Math.floor((CONFIG.audio.preRollMs / 1000) * 16000);
    this.preRollRingBuffer = new Float32Array(this.preRollSamples);
  }

  public async start(): Promise<void> {
    try {
      this.vad = await MicVAD.new({
        positiveSpeechThreshold: CONFIG.audio.speechStartThreshold,
        negativeSpeechThreshold: CONFIG.audio.speechStartThreshold - 0.15,
        minSpeechFrames: Math.floor(CONFIG.audio.minSpeechMs / 32),
        redemptionFrames: Math.floor(CONFIG.audio.silenceTimeoutMs / 32),
        preSpeechPadFrames: Math.floor(CONFIG.audio.preRollMs / 32),
        onSpeechStart: () => {
          if (this.isPaused) return;
          this.callbacks.onSpeechStart?.();
        },
        onSpeechEnd: (audio: Float32Array) => {
          if (this.isPaused) return;
          if (audio.length < (CONFIG.audio.minSpeechMs / 1000) * 16000) {
            this.callbacks.onVADMisfire?.();
            return;
          }
          this.callbacks.onSpeechEnd?.(audio);
        },
        onVADMisfire: () => {
          if (this.isPaused) return;
          this.callbacks.onVADMisfire?.();
        },
      });
      this.vad.start();
    } catch (err) {
      console.warn('Silero MicVAD initialization failed, running fallback energy detector', err);
      // Fallback energy detector could be used if ONNX web fails on some platform
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.vad && typeof this.vad.pause === 'function') {
      try {
        this.vad.pause();
      } catch {
        // ignore
      }
    }
  }

  public resume(): void {
    this.isPaused = false;
    if (this.vad && typeof this.vad.start === 'function') {
      try {
        this.vad.start();
      } catch {
        // ignore
      }
    }
  }

  public destroy(): void {
    this.isPaused = true;
    if (this.vad && typeof this.vad.destroy === 'function') {
      try {
        this.vad.destroy();
      } catch {
        // ignore
      }
    }
    this.vad = null;
  }
}

