import { CONFIG } from '../config.js';
export class TTSAdapter {
    isSpeaking = false;
    currentSentences = [];
    currentSentenceIndex = 0;
    activeUtterance = null;
    userInterrupted = false;
    isAvailable() {
        return typeof window !== 'undefined' && 'speechSynthesis' in window;
    }
    getVoices() {
        if (!this.isAvailable())
            return [];
        return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    }
    getSpeakingState() {
        return this.isSpeaking;
    }
    stop() {
        if (!this.isAvailable())
            return;
        this.userInterrupted = true;
        this.isSpeaking = false;
        this.currentSentences = [];
        this.currentSentenceIndex = 0;
        try {
            window.speechSynthesis.cancel();
        }
        catch {
            // ignore
        }
    }
    speakText(text, options = {}) {
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
        return new Promise((resolve) => {
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
                const preferredVoice = englishVoices.find((v) => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')) ||
                    englishVoices[0];
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                }
                utterance.onstart = () => {
                    options.onSentenceStart?.(sentence, this.currentSentenceIndex);
                };
                utterance.onend = () => {
                    this.currentSentenceIndex++;
                    speakNext();
                };
                utterance.onerror = (e) => {
                    console.warn('TTS utterance error:', e);
                    this.currentSentenceIndex++;
                    speakNext();
                };
                this.activeUtterance = utterance;
                window.speechSynthesis.speak(utterance);
            };
            speakNext();
        });
    }
}
