const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/healthScore.ts'), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const scope = { exports: {} }
vm.runInNewContext(output, scope)
const { scoreBP, scoreBMI, scoreSleep, computeHealthScore } = scope.exports

test('blood pressure uses the worse reading, including mixed severity', () => {
  assert.equal(scoreBP(170, 85), 0)
  assert.equal(scoreBP(125, 105), 0)
  assert.equal(scoreBP(130, 95), 25)
  assert.equal(scoreBP(115, 75), 100)
})
test('incomplete and invalid readings do not become healthy observations', () => {
  assert.equal(scoreBP(110, null), null)
  assert.equal(scoreBP(NaN, 75), null)
  assert.equal(scoreBMI(Infinity), null)
  assert.equal(scoreSleep(-2), null)
})
test('missing observations are excluded rather than scored as zero', () => {
  const result = computeHealthScore({ systolic: 115, diastolic: 75, sleepHours: 6.5 })
  assert.equal(result.score, 85)
  assert.equal(result.measured, 2)
  assert.equal(result.total, 7)
})
test('no observations has explicit missing-data state; actual zero is still a score', () => {
  assert.equal(computeHealthScore({}).measured, 0)
  assert.equal(computeHealthScore({}).grade, 'Not enough data')
  const zero = computeHealthScore({ systolic: 170, diastolic: 105 })
  assert.equal(zero.score, 0)
  assert.equal(zero.measured, 1)
  assert.equal(zero.grade, 'Lower range')
})
