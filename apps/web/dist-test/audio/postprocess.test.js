import test from 'node:test';
import assert from 'node:assert/strict';
import { postProcessTranscript } from './postprocess.js';
test('postProcessTranscript cleans text and calculates metrics', () => {
    const raw = 'I think, um, I think SPI is faster than I2C because it has full duplex lines.';
    const res = postProcessTranscript(raw, 5000);
    assert.equal(res.isHallucination, false);
    assert.ok(res.wordCount > 0);
    assert.ok(res.fillerRate > 0);
    assert.ok(res.wpm > 0);
    assert.ok(res.text.includes('SPI is faster'));
});
test('postProcessTranscript rejects silence hallucinations', () => {
    const hallucinations = [
        'Thank you.',
        'Thank you very much',
        'Thanks for watching!',
        'Subtitles by ...',
        '   ',
    ];
    for (const phrase of hallucinations) {
        const res = postProcessTranscript(phrase, 3000);
        assert.equal(res.isHallucination, true, `Expected '${phrase}' to be detected as hallucination`);
        assert.equal(res.text, '');
    }
});
test('postProcessTranscript collapses repeated stutter/fillers', () => {
    const raw = 'The the pullup pullup resistor is required.';
    const res = postProcessTranscript(raw, 4000);
    assert.equal(res.isHallucination, false);
    assert.equal(res.text, 'The pullup resistor is required.');
});
