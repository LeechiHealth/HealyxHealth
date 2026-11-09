const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const output = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../lib/healthBrief.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const scope = { exports: {} }; vm.runInNewContext(output, scope)
const { buildHealthBrief } = scope.exports
const now = new Date('2026-11-07T12:00:00Z')
const row = (values = {}) => ({ id: 'a', name: 'Glucose', value: 100, unit: 'mg/dL', test_date: '2026-11-01', ...values })

test('missing status and a range never imply normal', () => {
 const brief = buildHealthBrief([row({ reference_range_text: '70–100' })], now)
 assert.equal(brief.inRange, 0); assert.equal(brief.unknown, 1)
})
test('only recorded statuses classify results; a descending value is not optimal', () => {
 const brief = buildHealthBrief([row({value: 90}), row({id:'b', value:100, test_date:'2026-10-01'})], now)
 assert.equal(brief.latest[0].classification, 'unknown')
 assert.equal(brief.latest[0].change, 'Down 10 mg/dL since 2026-10-01')
 assert.equal(buildHealthBrief([row({status:'HIGH'})],now).flagged,1)
})
test('normalizes exact names without combining different analytes', () => {
 const brief=buildHealthBrief([row(),row({name:' glucose ',id:'b',test_date:'2026-10-01'}),row({id:'c',name:'Fasting glucose'})],now)
 assert.equal(brief.latest.length,2)
})
test('future and invalid dates cannot supersede trustworthy dated records', () => {
 const brief=buildHealthBrief([row({id:'future',test_date:'2099-01-01',status:'normal'}),row({id:'invalid',test_date:'2026-02-30'}),row({status:'high'})],now)
 assert.equal(brief.latest[0].id,'a'); assert.equal(brief.undatedCount,2)
 const undated=buildHealthBrief([row({test_date:null,status:'normal'})],now)
 assert.equal(undated.unknown,1);assert.equal(undated.lastRecorded,null)
})
test('unit changes, comparator values, and same-day conflicts suppress trend claims', () => {
 for(const older of [{unit:'mmol/L'},{value:'<100'},{test_date:'2026-11-01',value:110}]) {
  const brief=buildHealthBrief([row(),row({id:'b',value:110,test_date:'2026-10-01',...older})],now)
  assert.equal(brief.latest[0].change,null)
 }
 const conflicting=buildHealthBrief([row({status:'normal'}),row({id:'b',value:105,status:'high'})],now)
 assert.equal(conflicting.unknown,1)
})
test('previous same-day conflicts also suppress trend claims', () => {
 const brief=buildHealthBrief([row(),row({id:'b',value:110,test_date:'2026-10-01'}),row({id:'c',value:115,test_date:'2026-10-01'})],now)
 assert.equal(brief.latest[0].change,null)
})
