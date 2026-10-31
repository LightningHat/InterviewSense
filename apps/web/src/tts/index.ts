import { CONFIG } from '../config.js';

export interface TTSOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
  onSentenceStart?: (sentence: string, index: number) => void;
  onFinished?: () => void;
  onInterrupted?: () => void;
}

export class TTSAdapter {
  private isSpeaking = false;
  private currentSentences: string[] = [];
  private currentSentenceIndex = 0;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private userInterrupted = false;

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.isAvailable()) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  }

  public getSpeakingState(): boolean {
    return this.isSpeaking;
  }

  public stop(): void {
    if (!this.isAvailable()) return;
    this.userInterrupted = true;
    this.isSpeaking = false;
    this.currentSentences = [];
    this.currentSentenceIndex = 0;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  public speakText(text: string, options: TTSOptions = {}): Promise<void> {
    if (!this.isAvailable()) {
      options.onFinished?.();
      return Promise.resolve();
    }

    this.stop(); // Stop any pending utterances
    this.userInterrupted = false;

    // Split text into short, natural sentences to allow fine-grained barge-in
    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length === 0) {
      options.onFinished?.();
      return Promise.resolve();
    }

    this.currentSentences = sentences;
    this.currentSentenceIndex = 0;
    this.isSpeaking = true;

    return new Promise<void>((resolve) => {
      const speakNext = () => {
        if (this.userInterrupted || !this.isSpeaking) {
          options.onInterrupted?.();
          resolve();
          return;
        }

        if (this.currentSentenceIndex >= this.currentSentences.length) {
          this.isSpeaking = false;
          options.onFinished?.();
          resolve();
          return;
        }

        const sentence = this.currentSentences[this.currentSentenceIndex];
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.rate = options.rate ?? CONFIG.tts.defaultRate;
        utterance.lang = options.lang ?? CONFIG.tts.preferredLanguage;

        // Try to pick a natural English voice
        const englishVoices = this.getVoices();
        const preferredVoice =
          englishVoices.find((v) => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')) ||
          englishVoices[0];
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        let hasEnded = false;
        const finishSentence = () => {
          if (hasEnded) return;
          hasEnded = true;
          clearTimeout(safetyTimer);
          this.currentSentenceIndex++;
          speakNext();
        };

        // Safety watchdog: prevent Chrome Web Speech API from hanging indefinitely
        const safetyTimeoutMs = Math.max(3000, sentence.length * 90);
        const safetyTimer = setTimeout(() => {
          finishSentence();
        }, safetyTimeoutMs);

        utterance.onstart = () => {
          options.onSentenceStart?.(sentence, this.currentSentenceIndex);
        };

        utterance.onend = () => {
          finishSentence();
        };

        utterance.onerror = (e) => {
          console.warn('TTS utterance error:', e);
          finishSentence();
        };

        this.activeUtterance = utterance;
        try {
          window.speechSynthesis.resume();
        } catch {
          // ignore
        }
        window.speechSynthesis.speak(utterance);
      };

      speakNext();
    });
  }
}

