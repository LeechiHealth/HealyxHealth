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

test('printed lab dates are converted in code, keeping the printed year', () => {
  const { parsePrintedDate } = loadTs('lib/printedDate.ts')
  const now = new Date('2026-11-09T12:00:00Z')
  assert.equal(parsePrintedDate('Collected: 10/14/2026', now), '2026-10-14')
  assert.equal(parsePrintedDate('2026-10-14', now), '2026-10-14')
  assert.equal(parsePrintedDate('Oct 14, 2026', now), '2026-10-14')
  assert.equal(parsePrintedDate('14-Oct-2026', now), '2026-10-14')
  assert.equal(parsePrintedDate('10/14/26', now), '2026-10-14')
  assert.equal(parsePrintedDate('02/30/2026', now), null)
  assert.equal(parsePrintedDate(null, now), null)
  assert.equal(parsePrintedDate('no date here', now), null)
})

test('the agent brain falls through to the next provider on a rate limit', async () => {
  const calls = []
  const llm = loadTs('lib/agents/llm.ts', { globals: { fetch: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    if (url.includes('groq')) return { ok: false, status: 429, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'from gemini' } }] }) }
  } } })
  const env = { GROQ_API_KEY: 'synthetic-groq', GEMINI_API_KEY: 'synthetic-gemini' }
  assert.deepEqual([...llm.agentProviders(env).map(p => p.name)], ['groq', 'gemini:gemini-3.5-flash-lite', 'gemini:gemini-3.5-flash'])
  const result = await llm.chat({ messages: [{ role: 'assistant', content: null, reasoning: 'hidden', tool_calls: [{ id: 't', type: 'function', function: { name: 'x', arguments: '{}' } }] }] }, env)
  assert.equal(result.provider, 'gemini:gemini-3.5-flash-lite')
  assert.equal(result.message.content, 'from gemini')
  assert.equal(calls.length, 2)
  assert.equal('reasoning' in calls[1].body.messages[0], false)
  assert.equal(calls[1].body.model, 'gemini-3.5-flash-lite')
  const custom = llm.agentProviders({ ...env, AGENT_LLM_URL: 'http://localhost:11434/v1/chat/completions', AGENT_LLM_KEY: 'k', AGENT_LLM_MODEL: 'open-model' })
  assert.equal(custom[0].name, 'custom')
  await assert.rejects(() => llm.chat({ messages: [] }, {}), /AI_NOT_CONFIGURED/)
})

test('web findings keep their source links and drop citation markers', () => {
  const web = loadTs('lib/agents/web.ts')
  const sources = web.extractSources('Open 9-6【1†L16-L19】 per https://www.baycare.org/locations/x. Also https://baycare.org/locations/x and https://solv.example/clinic).')
  assert.deepEqual([...sources.map(s => s.title)], ['baycare.org', 'solv.example'])
  assert.equal(sources[0].url, 'https://www.baycare.org/locations/x')
})

test('agent replies are kept plain text', () => {
  assert.equal(safety.honestReply('Here are options:\n\n*   **MedExpress** open 8-8\n- BayCare 9-6\n\n\n## Next'), 'Here are options:\n\n• MedExpress open 8-8\n• BayCare 9-6\n\nNext')
})

test('condition names keep their numbers when matched against labels', () => {
  assert.deepEqual([...research.searchTerms(['Type 2 diabetes', 'Metformin 500 mg'])], ['type 2 diabetes', 'metformin'])
})

test('Gemini gets thought signatures back; other providers never see them', () => {
  const llm = loadTs('lib/agents/llm.ts')
  const signed = { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'x', arguments: '{}' }, extra_content: { google: { thought_signature: 'sig-1' } } }] }
  const unsigned = { role: 'assistant', content: null, tool_calls: [{ id: 'b', type: 'function', function: { name: 'x', arguments: '{}' } }] }
  assert.equal(llm.cleanMessage(signed, true).tool_calls[0].extra_content.google.thought_signature, 'sig-1')
  assert.equal(llm.cleanMessage(unsigned, true).tool_calls[0].extra_content.google.thought_signature, 'skip_thought_signature_validator')
  assert.equal('extra_content' in llm.cleanMessage(signed, false).tool_calls[0], false)
})
