const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/api/protocol/generate/route.ts'), 'utf8')
function loadRoute({ authenticated = true, output, failure } = {}) {
  let calls = 0
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const scope = { exports: {}, process: { env: { GROQ_API_KEY: 'synthetic-test-key' } }, require: name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
    if (name === 'zod') return require('zod')
    if (name === '@/lib/serverAuth') return { authenticateRequest: async () => authenticated ? { user: { id: 'synthetic-user' } } : { response: { status: 401 } } }
    if (name === '@/lib/groq/client') return { GROQ_MODEL: 'test', groq: { chat: { completions: { create: async () => { calls++; if (failure) throw failure; return { choices: [{ message: { content: JSON.stringify(output) } }] } } } } } }
    throw new Error(`Unexpected dependency: ${name}`)
  } }
  vm.runInNewContext(compiled, scope)
  return { post: scope.exports.POST, calls: () => calls }
}
const request = body => ({ json: async () => body })
const valid = {
  plain_summary: 'Your goal is to understand sleep.', whats_going_on: 'Sleep duration was not recorded.', strengths: [], concerns: [], focus: 'Record your routine.',
  tasks: [{ task_name: 'Record bedtime', description: 'Note your bedtime if useful.', why_it_matters: 'Sleep duration was not recorded.', category: 'tracking', frequency: 'When convenient' }],
}
test('unauthenticated generation never contacts the provider', async () => {
  const route = loadRoute({ authenticated: false })
  assert.equal((await route.post(request({ healthSummary: 'Synthetic context' }))).status, 401)
  assert.equal(route.calls(), 0)
})
test('invalid input never contacts the provider', async () => {
  const route = loadRoute()
  assert.equal((await route.post(request({ healthSummary: '' }))).status, 400)
  assert.equal(route.calls(), 0)
})
test('strips invented scores, evidence grades and severity and preserves input provenance', async () => {
  const route = loadRoute({ output: { ...valid, health_score: 99, health_score_target: 100, issues_ranked: [{ severity: 'high' }], tasks: [{ ...valid.tasks[0], evidence_level: 'strong', cost_estimate: '$5' }] } })
  const response = await route.post(request({ healthSummary: 'Synthetic record dated 2026-01-01' }))
  assert.equal(response.status, 200)
  assert.equal(response.body.health_score, undefined)
  assert.equal(response.body.health_score_target, undefined)
  assert.equal(response.body.tasks[0].evidence_level, undefined)
  assert.equal(response.body.tasks[0].cost_estimate, undefined)
  assert.equal(response.body.issues_ranked.length, 0)
  assert.equal(response.body.report.input_summary, 'Synthetic record dated 2026-01-01')
})
test('rejects incomplete output and supplement task category', async () => {
  for (const output of [{}, { ...valid, tasks: [{ ...valid.tasks[0], category: 'supplement' }] }]) {
    assert.equal((await loadRoute({ output }).post(request({ healthSummary: 'Synthetic context' }))).status, 502)
  }
})
test('provider exceptions do not disclose internal errors or user context', async () => {
  const route = loadRoute({ failure: { status: 500, message: 'Sensitive synthetic context' } })
  const result = await route.post(request({ healthSummary: 'Synthetic context' }))
  assert.equal(result.status, 503)
  assert.equal(JSON.stringify(result).includes('Sensitive synthetic'), false)
})
