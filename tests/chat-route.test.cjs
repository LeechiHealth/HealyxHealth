const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadRoute({ authenticated = true, configured = true, gemini = false } = {}) {
  const calls = []
  const json = (body, options) => ({ body, status: options?.status || 200 })
  const database = { from(table) {
    const query = { select() { return query }, eq(key, value) { calls.push({ table, key, value }); return query }, order() { return query }, limit() { return Promise.resolve({ data: table === 'biomarkers' ? [{ name: 'Synthetic lab', value: 1, test_date: '2026-01-01' }] : [], error: null }) } }
    return query
  } }
  const scope = { exports: {}, Buffer, console, process: { env: configured ? { GROQ_API_KEY: 'synthetic-test-key', ...(gemini ? { GEMINI_API_KEY: 'synthetic-gemini-key' } : {}) } : {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json } }
    if (name === '@/lib/serverAuth') return { authenticateRequest: async () => authenticated ? { user: { id: 'verified-account' }, supabase: database } : { response: json({ error: 'Sign in' }, { status: 401 }) } }
    if (name === '@/lib/groq/client') return { GROQ_VISION_MODEL: 'synthetic-vision', stripReasoning: text => text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() }
    if (name === '@/lib/agents/llm') return { agentProviders: () => (configured ? [{ name: 'synthetic' }] : []), chat: async (input, env, options) => { calls.push({ ...input, model: 'synthetic-model', options }); return { message: { role: 'assistant', content: 'Synthetic answer' }, provider: 'synthetic' } } }
    return require(name)
  } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/api/chat/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope)
  return { post: scope.exports.POST, calls }
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
