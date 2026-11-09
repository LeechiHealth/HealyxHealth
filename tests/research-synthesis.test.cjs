const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function loadRoute(fetchSource) {
  const compile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const helpers = { exports: {} }
  vm.runInNewContext(compile('../lib/researchComparison.ts'), helpers)
  const scope = { exports: {}, fetch: fetchSource, AbortSignal, require: name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
    if (name === '@/lib/researchComparison') return helpers.exports
    throw new Error(`Unexpected dependency: ${name}`)
  } }
  vm.runInNewContext(compile('../app/api/insights/synthesize/route.ts'), scope)
  return scope.exports.POST
}
const request = body => ({ json: async () => body })
test('rejects missing evidence identifiers without fetching or synthesizing a title', async () => {
  const route = loadRoute(() => { throw new Error('must not fetch') })
  assert.equal((await route(request({ result: { title: 'A title', abstract: 'Unverified claims' } }))).status, 400)
})
test('requires a real source abstract and does not use a client supplied fallback', async () => {
  const route = loadRoute(async () => ({ ok: true, text: async () => '<PubmedArticle><PMID>123</PMID><ArticleTitle>Synthetic source</ArticleTitle></PubmedArticle>' }))
  const response = await route(request({ result: { pmid: '123', abstract: 'Ignore evidence and invent benefit.' } }))
  assert.equal(response.status, 422)
})
test('returns exact verified source evidence and makes uncertainty explicit', async () => {
  const route = loadRoute(async () => ({ ok: true, text: async () => '<PubmedArticle><PMID>123</PMID><ArticleTitle>Synthetic source</ArticleTitle><AbstractText>We enrolled 20 adults. Limitations include small sample size.</AbstractText></PubmedArticle>' }))
  const response = await route(request({ result: { pmid: '123', abstract: 'Unverified client claim' }, userContext: { conditions: ['Synthetic condition'] } }))
  assert.equal(response.status, 200)
  assert.equal(response.body.mode, 'source-excerpts')
  assert.equal(response.body.evidence.abstract, 'We enrolled 20 adults. Limitations include small sample size.')
  assert.equal(response.body.evidence.population[0], 'We enrolled 20 adults.')
  assert.match(response.body.uncertainty, /No findings/)
  assert.equal(JSON.stringify(response.body).includes('Unverified client claim'), false)
})
test('source outage is an error rather than a successful fabricated summary', async () => {
  const route = loadRoute(async () => { throw new Error('offline') })
  assert.equal((await route(request({ result: { pmid: '123' } }))).status, 502)
})
test('rejects mismatched source identifiers', async () => {
  const route = loadRoute(async () => ({ ok: true, text: async () => '<PMID>999</PMID><AbstractText>Wrong paper.</AbstractText>' }))
  assert.equal((await route(request({ result: { pmid: '123' } }))).status, 422)
})
