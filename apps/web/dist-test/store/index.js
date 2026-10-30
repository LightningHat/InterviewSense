import { openDB } from 'idb';
const DB_NAME = 'interviewsense-v1';
const DB_VERSION = 1;
let dbPromise = null;
export function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('by-startedAt', 'startedAt');
                }
                if (!db.objectStoreNames.contains('turns')) {
                    const turnStore = db.createObjectStore('turns', { keyPath: 'id' });
                    turnStore.createIndex('by-sessionId', 'sessionId');
                    turnStore.createIndex('by-createdAt', 'createdAt');
                }
                if (!db.objectStoreNames.contains('embeddings')) {
                    db.createObjectStore('embeddings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('banks')) {
                    db.createObjectStore('banks', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
            },
        });
    }
    return dbPromise;
}
// Session store operations
export async function saveSession(session) {
    const db = await getDB();
    await db.put('sessions', session);
}
export async function getSession(id) {
    const db = await getDB();
    return db.get('sessions', id);
}
export async function getActiveSession() {
    const db = await getDB();
    const tx = db.transaction('sessions', 'readonly');
    const index = tx.store.index('by-startedAt');
    const allSessions = await index.getAll();
    // Return the most recently started active session if any
    return allSessions.reverse().find((s) => s.status === 'active');
}
// Turn store operations
export async function saveTurn(turn) {
    const db = await getDB();
    await db.put('turns', turn);
}
export async function getTurnsForSession(sessionId) {
    const db = await getDB();
    const index = db.transaction('turns').store.index('by-sessionId');
    const turns = await index.getAll(sessionId);
    return turns.sort((a, b) => a.index - b.index);
}
// Embedding cache operations
export async function getCachedEmbedding(key) {
    try {
        const db = await getDB();
        const entry = await db.get('embeddings', key);
        return entry ? entry.vector : null;
    }
    catch {
        return null;
    }
}
export async function setCachedEmbedding(key, vector) {
    try {
        const db = await getDB();
        await db.put('embeddings', {
            key,
            vector,
            createdAt: Date.now(),
        });
    }
    catch (err) {
        console.warn('Failed to cache embedding', err);
    }
}
// Bank cache operations
export async function cacheBank(bank) {
    try {
        const db = await getDB();
        await db.put('banks', bank);
    }
    catch (err) {
        console.warn('Failed to cache bank', err);
    }
}
export async function getCachedBank(id) {
    try {
        const db = await getDB();
        return db.get('banks', id);
    }
    catch {
        return undefined;
    }
}
// Session export as JSON
export async function exportSessionJSON(sessionId) {
    const session = await getSession(sessionId);
    const turns = await getTurnsForSession(sessionId);
    return JSON.stringify({ session, turns }, null, 2);
}
