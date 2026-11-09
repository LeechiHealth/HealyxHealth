const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadRoute({ authenticated = true, configured = true } = {}) {
  const calls = []
  const json = (body, options) => ({ body, status: options?.status || 200 })
  const database = { from(table) {
    const query = { select() { return query }, eq(key, value) { calls.push({ table, key, value }); return query }, order() { return query }, limit() { return Promise.resolve({ data: table === 'biomarkers' ? [{ name: 'Synthetic lab', value: 1, test_date: '2026-01-01' }] : [], error: null }) } }
    return query
  } }
  const scope = { exports: {}, Buffer, console, process: { env: configured ? { GROQ_API_KEY: 'synthetic-test-key' } : {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json } }
    if (name === '@/lib/serverAuth') return { authenticateRequest: async () => authenticated ? { user: { id: 'verified-account' }, supabase: database } : { response: json({ error: 'Sign in' }, { status: 401 }) } }
    if (name === '@/lib/groq/client') return { GROQ_MODEL: 'synthetic-model', GROQ_VISION_MODEL: 'synthetic-vision', stripReasoning: text => text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(), groq: { chat: { completions: { create: async input => { calls.push(input); return { choices: [{ message: { content: 'Synthetic answer' } }] } } } } } }
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
