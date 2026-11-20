const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { loadTs } = require('./helpers/load-ts.cjs')
const chatActions = loadTs('lib/chatActions.ts', { stubs: { zod: require('zod') }, globals: { Date } })

function loadRoute({ authenticated = true, configured = true, gemini = false } = {}) {
  const calls = []
  const json = (body, options) => ({ body, status: options?.status || 200 })
  const database = { from(table) {
    const query = { select() { return query }, eq(key, value) { calls.push({ table, key, value }); return query }, order() { return query }, limit() { return Promise.resolve({ data: table === 'biomarkers' ? [{ name: 'Synthetic lab', value: 1, test_date: '2026-01-01' }] : [], error: null }) } }
    return query
  } }
  const scope = { exports: {}, Buffer, console, process: { env: configured ? { GROQ_API_KEY: 'synthetic-test-key', ...(gemini ? { GEMINI_API_KEY: 'synthetic-gemini-key' } : {}) } : {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json } }
    if (name === '@/lib/chatActions') return chatActions
    if (name === '@/lib/serverAuth') return { authenticateRequest: async () => authenticated ? { user: { id: 'verified-account' }, supabase: database } : { response: json({ error: 'Sign in' }, { status: 401 }) } }
    if (name === '@/lib/groq/client') return { GROQ_VISION_MODEL: 'synthetic-vision', stripReasoning: text => text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() }
    if (name === '@/lib/agents/llm') return { agentProviders: () => (configured ? [{ name: 'synthetic' }] : []), chat: async (input, env, options) => { calls.push({ ...input, model: 'synthetic-model', options }); return { message: { role: 'assistant', content: scope.answer || 'Synthetic answer' }, provider: 'synthetic' } } }
    return require(name)
  } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/api/chat/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope)
  return { post: scope.exports.POST, calls, scope }
}
const request = body => ({ json: async () => body })
test('chat rejects unauthenticated requests before loading records or calling AI', async () => {
  const { post, calls } = loadRoute({ authenticated: false })
  assert.equal((await post(request({ message: 'Hello' }))).status, 401)
  assert.equal(calls.length, 0)
})
test('chat reports missing AI configuration without invoking provider', async () => {
  const { post, calls } = loadRoute({ configured: false })
  assert.equal((await post(request({ message: 'Hello' }))).status, 503)
  assert.equal(calls.length, 0)
})
test('chat binds record queries to verified account and ignores client health context', async () => {
  const { post, calls } = loadRoute()
  assert.equal((await post(request({ message: 'Explain my data', userId: 'other-account', healthContext: 'SPOOFED PRIVATE RECORD' }))).status, 200)
  const queries = calls.filter(c => c.table)
  assert.equal(queries.length, 3)
  assert.ok(queries.every(c => c.key === 'user_id' && c.value === 'verified-account'))
  const modelInput = calls.find(c => c.model)
  assert.match(modelInput.messages[0].content, /Synthetic lab/)
  assert.doesNotMatch(JSON.stringify(modelInput), /SPOOFED PRIVATE RECORD|other-account/)
})
test('chat images go to the vision model first, through the provider fallback chain', async () => {
  const { post, calls } = loadRoute()
  const result = await post(request({ message: 'What is this?', fileData: { base64: 'aGVsbG8=', mimeType: 'image/png', name: 'x.png' } }))
  assert.equal(result.status, 200)
  const modelInput = calls.find(c => c.model)
  assert.equal(modelInput.options.groqModel, 'synthetic-vision')
  assert.equal(modelInput.messages.at(-1).content[0].type, 'image_url')
})

test('chat photos go to Gemini only, with every image before the text', async () => {
  const { post, calls } = loadRoute({ gemini: true })
  const images = [{ mimeType: 'image/jpeg', data: 'aGVsbG8=' }, { mimeType: 'image/heic', data: 'aGk=' }]
  const result = await post(request({ message: 'What is this rash?', images }))
  assert.equal(result.status, 200)
  const modelInput = calls.find(c => c.model)
  assert.equal(modelInput.options.onlyGemini, true)
  const parts = modelInput.messages.at(-1).content
  assert.equal(parts.length, 3)
  assert.equal(parts[0].image_url.url, 'data:image/jpeg;base64,aGVsbG8=')
  assert.equal(parts[2].text, 'What is this rash?')
})
test('chat photos need the Gemini key', async () => {
  const { post, calls } = loadRoute()
  const result = await post(request({ images: [{ mimeType: 'image/png', data: 'aGVsbG8=' }] }))
  assert.equal(result.status, 503)
  assert.equal(result.body.error, 'Photo questions need the Gemini key set on the server.')
  assert.equal(calls.length, 0)
})
test('chat rejects bad photos', async () => {
  const { post } = loadRoute({ gemini: true })
  const tooMany = Array.from({ length: 4 }, () => ({ mimeType: 'image/png', data: 'aGVsbG8=' }))
  assert.equal((await post(request({ images: tooMany }))).status, 400)
  assert.equal((await post(request({ images: [{ mimeType: 'image/gif', data: 'aGVsbG8=' }] }))).status, 400)
  assert.equal((await post(request({ images: [{ mimeType: 'image/png', data: 'not base64!' }] }))).status, 400)
  const big = 'A'.repeat(5_600_000)
  const result = await post(request({ images: [{ mimeType: 'image/png', data: big }] }))
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'Each photo must be 4 MB or smaller.')
})

test('chat photos pull out lab results and hide the block from the reply', async () => {
  const { post, scope } = loadRoute({ gemini: true })
  scope.answer = 'Your A1c is normal.\n```healyx-labs\n[{"name":"Hemoglobin A1c","value":5.4,"unit":"%","range":"4.0-5.6","date":"2026-05-23"},{"name":""}]\n```'
  const result = await post(request({ images: [{ mimeType: 'image/jpeg', data: 'aGVsbG8=' }] }))
  assert.equal(result.status, 200)
  assert.equal(result.body.reply, 'Your A1c is normal.')
  assert.equal(result.body.extractedLabs.length, 1)
  assert.equal(result.body.extractedLabs[0].value, 5.4)
})
test('chat voice flag asks for short spoken answers', async () => {
  const { post, calls } = loadRoute()
  assert.equal((await post(request({ message: 'How am I doing?', voice: true }))).status, 200)
  assert.match(calls.find(c => c.model).messages[0].content, /spoken aloud/)
})

test('chat returns saved facts as actions and hides the block', async () => {
  const { post, calls, scope } = loadRoute()
  scope.answer = 'Logged your sleep.\n```healyx-actions\n[{"type":"log_sleep","bedtime":"2026-11-19T23:00","wake_time":"2026-11-20T06:30","wakeups":2},{"type":"log_water","ml":500}]\n```'
  const result = await post(request({ message: 'I slept 11 to 6:30 and drank a bottle of water', now: '2026-11-20T08:00', tz: 'America/New_York' }))
  assert.equal(result.status, 200)
  assert.equal(result.body.reply, 'Logged your sleep.')
  assert.equal(result.body.actions.length, 2)
  assert.equal(result.body.actions[0].type, 'log_sleep')
  const modelInput = calls.find(c => c.model)
  assert.match(modelInput.messages[0].content, /2026-11-20T08:00 \(America\/New_York\)/)
})

test('chat drops invalid actions and keeps the reply', async () => {
  const { post, scope } = loadRoute()
  scope.answer = 'Done.\n```healyx-actions\n[{"type":"log_sleep","bedtime":"2026-11-20T07:00","wake_time":"2026-11-20T06:00"},{"type":"delete_everything"},{"type":"log_stress","rating_1_10":12},{"type":"add_medication","name":"Metformin","dose":"500 mg"}]\n```'
  const result = await post(request({ message: 'I started metformin 500 mg' }))
  assert.equal(result.status, 200)
  assert.equal(result.body.actions.map(a => a.type).join(','), 'add_medication')
  assert.equal(result.body.reply, 'Done.')
})

test('chat without a block returns no actions field', async () => {
  const { post, scope } = loadRoute()
  scope.answer = 'Plain answer.'
  const result = await post(request({ message: 'What is HRV?' }))
  assert.equal(result.body.actions, undefined)
})
