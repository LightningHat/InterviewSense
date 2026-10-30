export async function requestMicCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by this browser.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
    });
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioCtx({ sampleRate: 16000 });
    const sourceNode = audioContext.createMediaStreamSource(stream);
    return {
        stream,
        audioContext,
        sourceNode,
        stop: () => {
            try {
                stream.getTracks().forEach((track) => track.stop());
                if (audioContext.state !== 'closed') {
                    audioContext.close();
                }
            }
            catch {
                // ignore cleanup errors
            }
        },
    };
}
export function resampleTo16kHz(inputBuffer, originalSampleRate) {
    if (originalSampleRate === 16000) {
        return inputBuffer;
    }
    const ratio = originalSampleRate / 16000;
    const targetLength = Math.round(inputBuffer.length / ratio);
    const result = new Float32Array(targetLength);
    for (let i = 0; i < targetLength; i++) {
        const originIndex = i * ratio;
        const lower = Math.floor(originIndex);
        const upper = Math.min(lower + 1, inputBuffer.length - 1);
        const weight = originIndex - lower;
        result[i] = inputBuffer[lower] * (1 - weight) + inputBuffer[upper] * weight;
    }
    return result;
}
