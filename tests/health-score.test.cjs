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

const { prepareScoringLabs, finiteObservation, observationDate, scoreGlucose, scoreNicotine, computePhenoAge } = scope.exports
const day = '2025-01-10'
const lab = (name, value, unit = 'mg/dL', test_date = day) => ({ name, value, unit, test_date })
test('cholesterol never combines dates or guesses units', () => {
  const valid = prepareScoringLabs([lab('Total cholesterol', 200), lab('HDL', 50)])
  assert.equal(valid.nonHDL, 150)
  assert.equal(valid.provenance.lipids.date, day)
  assert.equal(prepareScoringLabs([lab('Total cholesterol', 200), lab('HDL', 50, 'mg/dL', '2025-01-09')]).nonHDL, null)
  assert.equal(prepareScoringLabs([lab('Total cholesterol', 5, 'mmol/L'), lab('HDL', 1, 'mmol/L')]).nonHDL, null)
  assert.equal(prepareScoringLabs([lab('Total cholesterol', 200, ''), lab('HDL', 50)]).nonHDL, null)
  assert.equal(prepareScoringLabs([lab('Total cholesterol', 200), lab('LDL', 50)]).nonHDL, null)
  assert.equal(prepareScoringLabs([lab('Total cholesterol', 40), lab('HDL', 50)]).nonHDL, null)
})
test('conflicting same-day results are omitted rather than selected arbitrarily', () => {
  assert.equal(prepareScoringLabs([lab('Total cholesterol', 200), lab('Total cholesterol', 220), lab('HDL', 50)]).nonHDL, null)
  assert.equal(prepareScoringLabs([lab('Total cholesterol', 200), lab('Total cholesterol', '200'), lab('HDL', 50)]).nonHDL, 150)
})
test('glucose requires explicit fasting provenance or percent A1c', () => {
  assert.equal(prepareScoringLabs([lab('Glucose', 90)]).fastingGlucose, null)
  assert.equal(prepareScoringLabs([lab('Fasting glucose', 5, 'mmol/L')]).fastingGlucose, null)
  assert.equal(prepareScoringLabs([lab('Fasting glucose', 90)]).fastingGlucose, 90)
  assert.equal(prepareScoringLabs([lab('HbA1c', 5.5, '%')]).hba1c, 5.5)
  assert.equal(prepareScoringLabs([lab('HbA1c', 40, 'mmol/mol')]).hba1c, null)
  assert.equal(prepareScoringLabs([lab('HbA1c', 101, '%')]).hba1c, null)
  assert.equal(scoreGlucose(101), null)
})
test('blank, boolean, unbounded, malformed, and future observations remain missing', () => {
  for (const value of ['', ' ', false, Infinity, 'Infinity', '0xFF', '<5']) assert.equal(finiteObservation(value), null)
  assert.equal(finiteObservation('5.5'), 5.5)
  assert.equal(observationDate('2025-02-30'), null)
  assert.equal(observationDate('2025-01-10Tgarbage'), null)
  assert.equal(observationDate('2099-01-01'), null)
  assert.equal(prepareScoringLabs([lab('HbA1c', 5.5, '%', '')]).hba1c, null)
})
test('unrecognized nicotine prose cannot accidentally become a good score', () => {
  assert.equal(scoreNicotine('Never'), 100)
  assert.equal(scoreNicotine('never quit'), null)
  assert.equal(scoreNicotine('not a current smoker'), null)
  assert.equal(scoreBP(75, 115), null)
})
const panel = { ageYears: 50, albumin_gdl: 4.5, creatinine_mgdl: 1, glucose_mgdl: 90, crp_mgl: 1, lymphocyte_pct: 30, mcv_fl: 90, rdw_pct: 13, alp_ul: 60, wbc_k: 5 }
test('PhenoAge rejects missing, nonfinite, nonnumeric, and invalid percentages', () => {
  assert.ok(computePhenoAge(panel))
  for (const v of [NaN, Infinity, '', '1', -1, 0]) assert.equal(computePhenoAge({ ...panel, crp_mgl: v }), null)
  assert.equal(computePhenoAge({ ...panel, lymphocyte_pct: 150 }), null)
  assert.equal(computePhenoAge({ ...panel, rdw_pct: 150 }), null)
  assert.equal(computePhenoAge({ ...panel, wbc_k: 1e100 }), null)
})

// Exercise the real loader with a minimal Supabase boundary; no network or DB.
const clientSource = fs.readFileSync(require('node:path').join(__dirname, '../lib/clientHealth.ts'), 'utf8')
const clientOutput = ts.transpileModule(clientSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const loadFixture = (tables) => {
  const clientScope = { exports: {}, require(name) {
    if (name.endsWith('healthScore')) return scope.exports
    if (name.endsWith('supabase/client')) return { supabase: { from(table) {
      const query = { select() { return this }, eq() { return this }, order() { return this }, limit() { return this }, maybeSingle() { return this }, then(resolve) { return Promise.resolve({ data: tables[table] ?? null, error: null }).then(resolve) } }
      return query
    } } }
    throw new Error(name)
  } }
  vm.runInNewContext(clientOutput, clientScope)
  return clientScope.exports.loadHealthScore('fixture-user')
}
test('loader finds paired BP behind unrelated vitals and exposes dated provenance', async () => {
  const result = await loadFixture({ biomarkers: [], vitals: [{ recorded_at: '2025-01-11', systolic_bp: null, diastolic_bp: null }, { recorded_at: day, systolic_bp: 115, diastolic_bp: 75 }], profiles: {}, intake_responses: null })
  assert.equal(result.components.find(c => c.key === 'bp').score, 100)
  assert.equal(result.provenance.bp.date, day)
  assert.equal(result.pheno, null)
  assert.match(result.phenoUnavailableReason, /same-panel/)
})
test('loader does not splice BP visits or infer exercise duration; undated intake is excluded', async () => {
  const result = await loadFixture({ biomarkers: [lab('Glucose', 90)], vitals: [{ recorded_at: '2025-01-11', systolic_bp: 115 }, { recorded_at: day, systolic_bp: 115, diastolic_bp: 75 }], profiles: {}, intake_responses: { nicotine: 'Never', sleep_hours: 8, exercise_days: 7 } })
  assert.equal(result.measured, 0)
  for (const key of ['bp', 'activity', 'sleep', 'nicotine', 'glucose']) assert.equal(result.components.find(c => c.key === key).score, null)
})
