const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')

const tts = loadTs('lib/tts.ts', { globals: { Buffer, Date } })

test('pcmToWav writes a 24 kHz mono 16-bit header', () => {
  const wav = tts.pcmToWav(Buffer.alloc(480))
  assert.equal(wav.length, 524)
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF')
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE')
  assert.equal(wav.readUInt16LE(22), 1)
  assert.equal(wav.readUInt32LE(24), 24000)
  assert.equal(wav.readUInt16LE(34), 16)
  assert.equal(wav.readUInt32LE(40), 480)
})

test('findAudio finds Interactions and generateContent payloads', () => {
  const data = Buffer.alloc(200, 1).toString('base64')
  const interactions = { steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data }] }] }
  assert.equal(tts.findAudio(interactions).mimeType, 'audio/wav')
  const legacy = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data } }] } }] }
  assert.equal(tts.findAudio(legacy).data, data)
  assert.equal(tts.findAudio({ text: 'no audio' }), null)
})

test('toWav keeps WAV and wraps raw PCM using the sample rate in the mime type', () => {
  const wav = tts.pcmToWav(Buffer.alloc(10))
  assert.equal(tts.toWav({ data: wav.toString('base64'), mimeType: 'audio/wav' }).length, wav.length)
  const wrapped = tts.toWav({ data: Buffer.alloc(10).toString('base64'), mimeType: 'audio/L16;rate=16000' })
  assert.equal(wrapped.readUInt32LE(24), 16000)
})

test('allowRequest caps requests per account per minute', () => {
  for (let i = 0; i < 40; i++) assert.equal(tts.allowRequest('acct', 1000), true)
  assert.equal(tts.allowRequest('acct', 1000), false)
  assert.equal(tts.allowRequest('other', 1000), true)
  assert.equal(tts.allowRequest('acct', 70_000), true)
})
