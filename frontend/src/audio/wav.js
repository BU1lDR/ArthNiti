// Mono 16-bit PCM WAV, the one audio format the backend's /api/intake/transcribe
// takes (and the one Meta's speech model takes). No imports and no browser calls,
// so tools/verify/talk-lib-test.mjs runs it in plain Node.
//
// 16 kHz is plenty for speech and keeps a minute of audio at 1.92 MB, under the
// 3 MB the backend accepts (MAX_AUDIO_BYTES in data/limits.js).

export const SAMPLE_RATE = 16000

// samples: Float32Array of -1..1. Anything outside that range is clamped, not
// wrapped, because a wrapped sample is a loud click.
export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const text = (at, word) => {
    for (let i = 0; i < word.length; i++) view.setUint8(at + i, word.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const level = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, level < 0 ? level * 0x8000 : level * 0x7fff, true)
  }
  return bytes
}
