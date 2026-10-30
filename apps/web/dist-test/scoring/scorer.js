import { CONFIG } from '../config.js';
import { getCachedEmbedding, setCachedEmbedding } from '../store/index.js';
import { matchAnswerToRubric } from './matcher.js';
import { splitIntoSentences } from './similarity.js';
export class ScorerManager {
    onProgress;
    worker = null;
    isReady = false;
    loadPromise = null;
    pendingRequests = new Map();
    // In-memory embedding cache for active bank
    conceptEmbeddings = new Map(); // conceptId -> vector
    questionEmbeddings = new Map(); // questionId -> vector
    constructor(onProgress) {
        this.onProgress = onProgress;
    }
    async initialize() {
        if (this.loadPromise) {
            return this.loadPromise;
        }
        this.loadPromise = new Promise((resolve, reject) => {
            try {
                this.worker = new Worker(new URL('./embedding.worker.ts', import.meta.url), {
                    type: 'module',
                });
                this.worker.onmessage = (event) => {
                    const msg = event.data;
                    if (msg.type === 'ready') {
                        this.isReady = true;
                        resolve();
                    }
                    else if (msg.type === 'progress') {
                        this.onProgress?.({ progress: msg.progress, file: msg.file });
                    }
                    else if (msg.type === 'embeddings') {
                        const pending = this.pendingRequests.get(msg.id);
                        if (pending) {
                            this.pendingRequests.delete(msg.id);
                            pending.resolve(msg.vectors);
                        }
                    }
                    else if (msg.type === 'error') {
                        if (msg.id) {
                            const pending = this.pendingRequests.get(msg.id);
                            if (pending) {
                                this.pendingRequests.delete(msg.id);
                                pending.reject(new Error(msg.message));
                            }
                        }
                        else {
                            this.isReady = false;
                            reject(new Error(msg.message));
                        }
                    }
                };
                this.worker.onerror = (err) => {
                    this.isReady = false;
                    reject(new Error(`Embedding Worker error: ${err.message}`));
                };
                this.worker.postMessage({
                    type: 'load',
                    model: CONFIG.embeddings.model,
                });
            }
            catch (err) {
                reject(err);
            }
        });
        return this.loadPromise;
    }
    async embedTexts(texts) {
        if (!this.worker || !this.isReady) {
            throw new Error('Embedding worker is not ready.');
        }
        if (texts.length === 0)
            return [];
        const id = `emb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({
                type: 'embed',
                id,
                texts,
            });
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Embedding request timed out after 10 seconds.'));
                }
            }, 10000);
        });
    }
    async prepareBank(bank) {
        const textsToEmbed = [];
        const keysToEmbed = [];
        for (const q of bank.questions) {
            // Question text embedding
            const qKey = `${bank.id}:${bank.version}:${q.id}`;
            const cachedQ = await getCachedEmbedding(qKey);
            if (cachedQ) {
                this.questionEmbeddings.set(q.id, cachedQ);
            }
            else {
                textsToEmbed.push(q.text);
                keysToEmbed.push({ key: qKey, type: 'question', id: q.id });
            }
            // Concept text embeddings
            for (const c of q.concepts) {
                const cKey = `${bank.id}:${bank.version}:${c.id}`;
                const cachedC = await getCachedEmbedding(cKey);
                if (cachedC) {
                    this.conceptEmbeddings.set(c.id, cachedC);
                }
                else {
                    textsToEmbed.push(c.text);
                    keysToEmbed.push({ key: cKey, type: 'concept', id: c.id });
                }
            }
        }
        if (textsToEmbed.length > 0) {
            try {
                const vectors = await this.embedTexts(textsToEmbed);
                for (let i = 0; i < vectors.length; i++) {
                    const item = keysToEmbed[i];
                    const vector = vectors[i];
                    await setCachedEmbedding(item.key, vector);
                    if (item.type === 'concept') {
                        this.conceptEmbeddings.set(item.id, vector);
                    }
                    else {
                        this.questionEmbeddings.set(item.id, vector);
                    }
                }
            }
            catch (err) {
                console.warn('Scorer: failed to pre-embed bank concepts, falling back to keywords', err);
            }
        }
    }
    async scoreAnswer(transcript, question, options = {}) {
        const sentences = splitIntoSentences(transcript);
        let sentenceEmbeddings = [];
        if (this.isReady && sentences.length > 0) {
            try {
                sentenceEmbeddings = await this.embedTexts(sentences);
            }
            catch (err) {
                console.warn('Scorer: sentence embedding failed, using keyword matching only', err);
            }
        }
        const qEmbedding = this.questionEmbeddings.get(question.id) || null;
        return matchAnswerToRubric(transcript, question, this.conceptEmbeddings, qEmbedding, sentenceEmbeddings, options);
    }
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isReady = false;
        this.loadPromise = null;
        this.pendingRequests.clear();
        this.conceptEmbeddings.clear();
        this.questionEmbeddings.clear();
    }
}
