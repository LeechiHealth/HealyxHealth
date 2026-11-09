const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')

const ics = loadTs('lib/agents/ics.ts')
const dates = loadTs('lib/agents/dates.ts')
const safety = loadTs('lib/agents/safety.ts')
const schema = loadTs('lib/agents/schema.ts')
const research = loadTs('lib/agents/research.ts')

test('calendar file escapes text, repeats daily and alerts at the start time', () => {
  const file = ics.buildIcs([{ uid: 't1@healyx', title: 'Take metformin 500 mg, with food; evening', start: '2026-11-09T20:00', durationMinutes: 5, rrule: ics.recurrenceRule([]), description: 'Line one\nLine two', alarmsMinutesBefore: [0] }], new Date('2026-11-09T12:00:00Z'))
  assert.match(file, /^BEGIN:VCALENDAR\r\n/)
  assert.ok(file.endsWith('END:VCALENDAR\r\n'))
  assert.match(file, /SUMMARY:Take metformin 500 mg\\, with food\\; evening/)
  assert.match(file, /DESCRIPTION:Line one\\nLine two/)
  assert.match(file, /DTSTART:20261109T200000\r\n/)
  assert.match(file, /DTEND:20261109T200500\r\n/)
  assert.match(file, /RRULE:FREQ=DAILY/)
  assert.match(file, /TRIGGER:PT0S/)
  assert.match(file, /DTSTAMP:20261109T120000Z/)
})

test('calendar lines are folded to 75 octets and events can cross midnight', () => {
  const file = ics.buildIcs([{ uid: 'long@healyx', title: 'Appointment '.repeat(20), start: '2026-11-09T23:55', durationMinutes: 15, alarmsMinutesBefore: [1440, 60] }])
  for (const line of file.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line.length}`)
  assert.match(file, /DTEND:20261110T001000/)
  assert.match(file, /TRIGGER:-P1D/)
  assert.match(file, /TRIGGER:-PT60M/)
})

test('weekday reminders use a weekly rule; all seven days stay daily', () => {
  assert.equal(ics.recurrenceRule(['MO', 'WE', 'FR']), 'FREQ=WEEKLY;BYDAY=MO,WE,FR')
  assert.equal(ics.recurrenceRule(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']), 'FREQ=DAILY')
})

test('google calendar link carries local times and recurrence', () => {
  const url = new URL(ics.googleCalendarUrl({ uid: 'x', title: 'Take lisinopril', start: '2026-11-09T08:00', durationMinutes: 5, rrule: 'FREQ=DAILY' }))
  assert.equal(url.searchParams.get('dates'), '20261109T080000/20261109T080500')
  assert.equal(url.searchParams.get('recur'), 'RRULE:FREQ=DAILY')
})

test('refill timing is computed deterministically with a five day lead', () => {
  assert.deepEqual({ ...dates.refillDates('2026-11-09', 10, 1) }, { days_left: 10, runs_out_on: '2026-11-19', remind_on: '2026-11-14' })
  assert.deepEqual({ ...dates.refillDates('2026-11-09', 6, 2) }, { days_left: 3, runs_out_on: '2026-11-12', remind_on: '2026-11-09' })
  assert.equal(dates.refillDates('2026-11-09', 10, 0), null)
  assert.equal(dates.localToUtcIso('2026-11-09T09:00', 300), '2026-11-09T14:00:00.000Z')
  assert.equal(dates.isLocalDate('2026-02-30'), false)
  assert.equal(dates.isLocalDateTime('2026-11-09T24:00'), false)
})

test('crisis and present emergencies are detected; history and medication names are not', () => {
  assert.equal(safety.detectUrgent('I want to kill myself'), 'crisis')
  assert.equal(safety.detectUrgent("I'm feeling suicidal tonight"), 'crisis')
  assert.equal(safety.detectUrgent("I'm having chest pain right now, book me a doctor"), 'emergency')
  assert.equal(safety.detectUrgent('My throat is closing after a new pill'), 'emergency')
  assert.equal(safety.detectUrgent('Refill my seizure medication'), null)
  assert.equal(safety.detectUrgent('My dad had a seizure last year. Research epilepsy treatments.'), null)
  assert.equal(safety.detectUrgent('What does research say about stroke prevention?'), null)
  assert.equal(safety.detectUrgent('Set up reminders for my blood pressure medicine'), null)
})

test('replies that claim an action was taken are replaced', () => {
  assert.equal(safety.honestReply("I've booked your appointment with Dr. Lee."), safety.HONEST_FALLBACK_REPLY)
  assert.equal(safety.honestReply('Your refill request has been sent to CVS.'), safety.HONEST_FALLBACK_REPLY)
  assert.equal(safety.honestReply("I'll call the office tomorrow."), safety.HONEST_FALLBACK_REPLY)
  assert.equal(safety.honestReply('I drafted a request you can send. Your appointment is on Thursday.'), 'I drafted a request you can send. Your appointment is on Thursday.')
  assert.equal(safety.honestReply('**Bold** text'), 'Bold text')
  assert.deepEqual([...safety.placeholders('Hi, this is [Your name], DOB [Date of birth]. [Your name]')], ['Your name', 'Date of birth'])
})

test('agents only keep valid actions of their own kinds; bad dates are dropped, not guessed', () => {
  const appointment = { kind: 'appointment', title: 'Physical', reason: 'Annual', starts_at: '2026-13-40T10:00', request_message: 'Hello', questions_to_ask: null }
  const shopping = { kind: 'shopping_list', title: 'Kit', items: [{ name: 'Thermometer', why: 'Fever', look_for: 'Digital', search_terms: 'digital thermometer' }] }
  const kept = schema.validActions('appointments', [appointment, shopping, { kind: 'appointment' }])
  assert.equal(kept.length, 1)
  assert.equal(kept[0].kind, 'appointment')
  assert.equal(kept[0].starts_at, undefined)
  assert.deepEqual([...kept[0].questions_to_ask], [])
  assert.equal(schema.validActions('research', [appointment]).length, 0)
  assert.equal(schema.validActions('shopping', [shopping]).length, 1)
  assert.equal(schema.validActions('medications', [{ kind: 'med_reminder', medication: 'Metformin', times: ['8am'] }]).length, 0)
})

test('label mentions find record names in warning sections but skip the drug itself', () => {
  const label = { drug: 'ibuprofen', product: 'Advil', url: 'https://dailymed.example/1', otc: true, sections: [
    { section: 'ask_doctor_or_pharmacist', text: 'Ask a doctor or pharmacist before use if you are taking aspirin for heart attack or stroke, or taking lisinopril. Ibuprofen may interact.' },
    { section: 'indications_and_usage', text: 'For hypertension relief? No.' },
  ] }
  const terms = research.searchTerms(['Lisinopril 10mg', 'Hypertension', 'Ibuprofen 200 mg', null])
  assert.deepEqual([...terms], ['lisinopril', 'hypertension', 'ibuprofen'])
  const mentions = research.labelMentions(label, terms)
  assert.equal(mentions.length, 1)
  assert.equal(mentions[0].term, 'lisinopril')
  assert.equal(mentions[0].section, 'Ask a doctor or pharmacist before use')
  assert.match(mentions[0].excerpt, /taking lisinopril/)
})

test('label mentions catch common plain-language and drug-class equivalents', () => {
  const label = { drug: 'ibuprofen', product: 'Ibuprofen', url: 'https://dailymed.example/2', otc: true, sections: [
    { section: 'ask_doctor', text: 'Ask a doctor before use if you have high blood pressure, heart disease, kidney disease, or you are taking a diuretic.' },
  ] }
  const mentions = research.labelMentions(label, research.searchTerms(['Hypertension', 'Hydrochlorothiazide 25mg', 'Metformin']))
  assert.deepEqual([...mentions.map(m => `${m.term}>${m.matched}`)], ['hypertension>high blood pressure', 'hydrochlorothiazide>diuretic'])
  assert.deepEqual([...research.termVariants('metformin')], ['metformin'])
})
