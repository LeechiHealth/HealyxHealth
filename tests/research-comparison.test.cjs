const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/researchComparison.ts'), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const scope = { exports: {} }
vm.runInNewContext(output, scope)
const { reportedPassages, studyLabel, toggleComparison, buildDiscussionBrief } = scope.exports

test('comparison caps selection at three, supports removal, and never duplicates sources', () => {
  let selected = []
  for (const id of ['a', 'b', 'c', 'd']) selected = toggleComparison(selected, { id })
  assert.equal(selected.length, 3)
  assert.equal(selected.some(s => s.id === 'd'), false)
  selected = toggleComparison(selected, { id: 'b' })
  assert.equal(selected.length, 2)
  assert.equal(selected.some(s => s.id === 'b'), false)
})
test('population excerpts preserve exact source text and require reporting language', () => {
  const original = 'We recruited 120 adults aged 40–65 years.'
  assert.equal(reportedPassages(original, 'population')[0], original)
  assert.equal(reportedPassages('Adults may benefit from exercise.', 'population').length, 0)
  assert.equal(reportedPassages(undefined, 'population').length, 0)
})
test('missing limitations are unknown, not an invented appraisal', () => {
  assert.equal(reportedPassages('Outcomes improved.', 'limitations').length, 0)
  const limitation = 'Limitations include short follow-up.'
  assert.equal(reportedPassages(limitation, 'limitations')[0], limitation)
})
test('trial registrations and unclassified papers do not imply efficacy or study quality', () => {
  assert.match(studyLabel({ type: 'clinical-trial' }), /not proof of benefit/)
  assert.match(studyLabel({ type: 'journal', badges: ['PubMed indexed'] }), /design not supplied/)
  assert.equal(studyLabel({ type: 'review', badges: ['Systematic Review'] }), 'Systematic Review')
})
test('discussion brief preserves source links and does not claim cross-validation', () => {
  const brief = buildDiscussionBrief([{ title: 'Synthetic study', url: 'https://pubmed.ncbi.nlm.nih.gov/123/', type: 'journal' }], 'Sleep')
  assert.match(brief, /Research discussion: Sleep/)
  assert.match(brief, /https:\/\/pubmed.ncbi.nlm.nih.gov\/123\//)
  assert.match(brief, /have not been cross-validated/)
  assert.match(brief, /absolute benefits, harms/)
})
