// Records the microphone and hands back a mono 16-bit 16 kHz WAV, which is what
// /api/intake/transcribe takes. Browser only: the WAV encoder is wav.js, which is
// tested in plain Node, and this file is checked in a real browser by
// tools/verify/talk-ui.mjs.
//
// MediaRecorder gives a compressed file (webm, ogg or mp4, whichever the browser
// likes). decodeAudioData on an OfflineAudioContext made at 16 kHz decodes it AND
// resamples it to 16 kHz in one call, so there is no AudioWorklet and no
// resampling code here.

import { SAMPLE_RATE, encodeWav } from './wav.js'

// A minute is 1.92 MB of WAV, under the 3 MB the backend accepts. The page stops
// the recording at this length.
export const MAX_SECONDS = 60

// False on a page served over plain http (the browser hides the microphone from
// it) and in a browser with no MediaRecorder.
export function micAvailable() {
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'
}

async function toWav(blob) {
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const decoded = await context.decodeAudioData(await blob.arrayBuffer())
  // One channel: the average of whatever the microphone gave.
  const mono = new Float32Array(decoded.length)
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const samples = decoded.getChannelData(channel)
    for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / decoded.numberOfChannels
  }
  return new Blob([encodeWav(mono)], { type: 'audio/wav' })
}

// Asks for the microphone (the browser shows its own permission prompt) and
// starts recording. Rejects with the browser's own error: NotAllowedError when
// the person said no, NotFoundError when there is no microphone.
//   level()  how loud it is right now, 0 to 1, for a meter
//   stop()   resolves to the WAV Blob; the microphone is released
//   cancel() releases the microphone and throws the recording away
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })

  let audio
  let released = false
  const release = () => {
    if (released) return
    released = true
    stream.getTracks().forEach((track) => track.stop())
    audio?.close()
  }

  try {
    const recorder = new MediaRecorder(stream)
    const chunks = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve
    })

    audio = new AudioContext()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 512
    audio.createMediaStreamSource(stream).connect(analyser)
    const wave = new Float32Array(analyser.fftSize)

    const halt = () => {
      if (recorder.state !== 'inactive') recorder.stop()
    }

    recorder.start()
    return {
      // Speech sits around 0.05 to 0.25 RMS, so it is scaled up to fill the meter.
      level() {
        analyser.getFloatTimeDomainData(wave)
        let sum = 0
        for (const sample of wave) sum += sample * sample
        return Math.min(1, Math.sqrt(sum / wave.length) * 4)
      },
      async stop() {
        halt()
        await stopped
        release()
        return toWav(new Blob(chunks, { type: recorder.mimeType }))
      },
      cancel() {
        recorder.ondataavailable = null
        halt()
        release()
      },
    }
  } catch (failure) {
    // The permission is already given and the microphone is open: a recorder or
    // an audio context that will not start must not leave it listening.
    release()
    throw failure
  }
}
