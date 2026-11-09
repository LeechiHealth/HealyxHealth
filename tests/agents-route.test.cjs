const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')

// Synthetic records only. No real health data in tests.
const MEDS = [
  { name: 'Levothyroxine 50 mcg', dosage: '50 mcg', frequency: 'once daily', status: 'active', pharmacy: 'Synthetic Pharmacy', prescribing_doctor: 'Dr. Test' },
  { name: 'Old Med', status: 'stopped' },
]
const CONDITIONS = [{ name: 'Hypothyroidism', status: 'active' }]

function fakeDb({ missingTables = false } = {}) {
  const inserted = { agent_messages: [], agent_tasks: [] }
  return {
    inserted,
    from(table) {
      const rows = table === 'medications' ? MEDS : table === 'conditions' ? CONDITIONS : []
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: async () => ({ data: rows, error: null }),
        insert: list => {
          const result = missingTables
            ? { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.agent_tasks' in the schema cache" } }
            : (inserted[table].push(...list), { data: list.map((row, i) => ({ id: `${table}-${i}`, created_at: '2026-11-09T12:00:00Z', ...row })), error: null })
          const promise = Promise.resolve(result)
          promise.select = async () => result
          return promise
        },
      }
      return chain
    },
  }
}

function loadRoute({ authenticated = true, outputs = [], fetchImpl, db = fakeDb() } = {}) {
  const prompts = []
  const fetched = []
  const route = loadTs('app/api/agents/run/route.ts', {
    stubs: {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      '@/lib/serverAuth': { authenticateRequest: async () => (authenticated ? { user: { id: 'synthetic-user' }, supabase: db } : { response: { status: 401 } }) },
      '@/lib/groq/client': { GROQ_MODEL: 'test', groq: { chat: { completions: { create: async request => {
        prompts.push(request)
        const next = outputs.shift()
        if (next instanceof Error || (next && next.status)) throw next
        return { choices: [{ message: { content: typeof next === 'string' ? next : JSON.stringify(next) } }] }
      } } } } },
    },
    globals: {
      process: { env: { GROQ_API_KEY: 'synthetic-test-key' } },
      fetch: async (url, options) => { fetched.push(String(url)); if (!fetchImpl) throw new Error('offline'); return fetchImpl(String(url), options) },
    },
  })
  return { post: route.POST, prompts, fetched, db }
}

const body = extra => ({ json: async () => ({ agent: 'medications', message: 'Remind me to take my thyroid pill', now: '2026-11-09T21:30', tz: 'America/New_York', tzOffsetMinutes: 300, ...extra }) })

test('unauthenticated requests never reach the provider', async () => {
  const route = loadRoute({ authenticated: false })
  assert.equal((await route.post(body())).status, 401)
  assert.equal(route.prompts.length, 0)
})

test('invalid agent or message is rejected before the provider', async () => {
  const route = loadRoute()
  assert.equal((await route.post(body({ agent: 'billing' }))).status, 400)
  assert.equal((await route.post(body({ message: '' }))).status, 400)
  assert.equal((await route.post(body({ now: 'tomorrow' }))).status, 400)
  assert.equal(route.prompts.length, 0)
})

test('a crisis gets 988 guidance and nothing is stored or sent to the provider', async () => {
  const route = loadRoute()
  const result = await route.post(body({ message: 'I want to end my life' }))
  assert.equal(result.status, 200)
  assert.equal(result.body.urgent, 'crisis')
  assert.match(result.body.reply, /988/)
  assert.equal(route.prompts.length, 0)
  assert.equal(route.db.inserted.agent_messages.length, 0)
})

test('a present emergency leads with 911 and the agent still helps', async () => {
  const route = loadRoute({ outputs: [{ reply: 'I drafted a request for a same-day visit.', actions: [] }] })
  const result = await route.post(body({ agent: 'appointments', message: "I'm having chest pain right now. Get me in with my doctor." }))
  assert.equal(result.body.urgent, 'emergency')
  assert.match(result.body.reply, /^If this is happening now.*911/)
  assert.match(result.body.reply, /I drafted a request/)
})

test('medication agent receives dose records; refill dates are computed server-side', async () => {
  const route = loadRoute({ outputs: [{
    reply: 'I prepared a reminder and a refill request.',
    actions: [
      { kind: 'med_reminder', medication: 'Levothyroxine', dose: '50 mcg', times: ['07:00'], days: [], times_confirmed: true },
      { kind: 'refill_request', medication: 'Levothyroxine', dose: '50 mcg', pharmacy: 'Synthetic Pharmacy', message: 'Hello, this is [Your name].', supply_remaining: 10, doses_per_day: 1 },
      { kind: 'shopping_list', title: 'Not allowed here', items: [] },
    ],
  }] })
  const result = await route.post(body())
  assert.equal(result.status, 200)
  assert.equal(result.body.persisted, true)
  assert.equal(result.body.tasks.length, 2)
  const refill = result.body.tasks.find(task => task.kind === 'refill_request')
  assert.equal(refill.payload.runs_out_on, '2026-11-19')
  assert.equal(refill.payload.remind_on, '2026-11-14')
  assert.equal(refill.due_at, '2026-11-14T14:00:00.000Z')
  assert.equal(refill.user_id, 'synthetic-user')
  const recordPrompt = route.prompts[0].messages[1].content
  assert.match(recordPrompt, /Levothyroxine/)
  assert.match(route.prompts[0].messages[0].content, /2026-11-09T21:30 local time, Monday/)
  assert.equal(route.db.inserted.agent_messages.length, 2)
})

test('a reply claiming something was booked or sent is replaced with an honest one', async () => {
  const route = loadRoute({ outputs: [{ reply: "Done! I've booked your physical with Dr. Test for Friday.", actions: [{ kind: 'appointment', title: 'Physical', reason: 'Annual checkup', starts_at: '2026-11-13T09:00', request_message: 'Hi, I would like to book a physical.' }] }] })
  const result = await route.post(body({ agent: 'appointments', message: 'Book my physical for Friday 9am' }))
  assert.match(result.body.reply, /Nothing has been sent, booked or bought/)
  assert.equal(result.body.tasks[0].due_at, '2026-11-13T14:00:00.000Z')
})

test('when agent tables are missing, tasks come back unsaved instead of failing', async () => {
  const route = loadRoute({ db: fakeDb({ missingTables: true }), outputs: [{ reply: 'I prepared a reminder.', actions: [{ kind: 'med_reminder', medication: 'Levothyroxine', times: ['07:00'] }] }] })
  const result = await route.post(body())
  assert.equal(result.status, 200)
  assert.equal(result.body.persisted, false)
  assert.equal(result.body.tasks[0].local, true)
  assert.match(result.body.tasks[0].id, /^local-/)
})

test('research cites only retrieved sources and flags label mentions of saved records', async () => {
  const fetchImpl = async url => {
    const json = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) })
    if (url.includes('esearch.fcgi')) return json({ esearchresult: { idlist: ['111', '222'] } })
    if (url.includes('esummary.fcgi')) return json({ result: { 111: { title: 'Magnesium for sleep: a systematic review.', pubdate: '2021 Mar', source: 'Synthetic J', pubtype: ['Systematic Review'] }, 222: { title: 'A trial of magnesium.', pubdate: '2019', source: 'Synthetic J', pubtype: ['Randomized Controlled Trial'] } } })
    if (url.includes('efetch.fcgi')) return { ok: true, status: 200, text: async () => '<PubmedArticle><PMID>111</PMID><AbstractText>Synthetic abstract one.</AbstractText></PubmedArticle><PubmedArticle><PMID>222</PMID><AbstractText>Synthetic abstract two.</AbstractText></PubmedArticle>' }
    if (url.includes('api.fda.gov')) return json({ results: [{ set_id: 'set-1', openfda: { brand_name: ['Synthetic Mag'], generic_name: ['magnesium oxide'], product_type: ['HUMAN OTC DRUG'] }, ask_doctor_or_pharmacist: ['Ask a doctor or pharmacist before use if you are taking levothyroxine. Separate doses by 4 hours.'] }] })
    throw new Error(`Unexpected URL ${url}`)
  }
  const route = loadRoute({ fetchImpl, outputs: [
    { topic: 'Magnesium for sleep', pubmed_query: 'magnesium sleep', drug_names: ['magnesium oxide'], trial_query: null },
    { reply: 'Evidence is limited.', points: [{ text: 'Supported point', cites: [2] }, { text: 'Invented citation', cites: [9] }, { text: 'Uncited', cites: [] }], ask_clinician: ['Is it safe with my thyroid medicine?'], limits: 'Small studies.' },
  ] })
  const result = await route.post(body({ agent: 'research', message: 'Does magnesium help sleep?' }))
  assert.equal(result.status, 200)
  const brief = result.body.tasks[0]
  assert.equal(brief.kind, 'research_brief')
  assert.equal(brief.payload.sources.length, 3)
  assert.deepEqual(brief.payload.points.map(p => p.text), ['Supported point'])
  assert.equal(brief.payload.label_mentions.length, 1)
  assert.equal(brief.payload.label_mentions[0].term, 'levothyroxine')
  assert.match(result.body.reply, /FDA label names one of your saved medications/)
  for (const url of route.fetched) assert.equal(/synthetic-user|Hypothyroidism|Dr\.?%20Test/i.test(url), false, url)
})

test('research reports an outage instead of claiming there is no evidence', async () => {
  const route = loadRoute({ outputs: [{ topic: 'Sleep', pubmed_query: 'sleep', drug_names: [], trial_query: null }] })
  const result = await route.post(body({ agent: 'research', message: 'Sleep research' }))
  assert.match(result.body.reply, /PubMed didn't respond/)
  assert.equal(result.body.tasks.length, 0)
})

test('provider failures return controlled errors without leaking details', async () => {
  const route = loadRoute({ outputs: [Object.assign(new Error('Synthetic secret context'), { status: 500 })] })
  const result = await route.post(body())
  assert.equal(result.status, 503)
  assert.equal(JSON.stringify(result.body).includes('Synthetic secret'), false)
  const limited = loadRoute({ outputs: [Object.assign(new Error('rate'), { status: 429 })] })
  assert.equal((await limited.post(body())).status, 429)
  const garbled = loadRoute({ outputs: ['not json'] })
  assert.equal((await garbled.post(body())).status, 502)
})

test('shopping label results are described by code, never by the model', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ results: [{ set_id: 's', openfda: { generic_name: ['ibuprofen'], brand_name: ['Ibuprofen'], product_type: ['HUMAN OTC DRUG'] }, ask_doctor: ['Ask a doctor before use if you take levothyroxine.'] }] }) })
  const route = loadRoute({ fetchImpl, outputs: [{ reply: 'Here is a list.', actions: [{ kind: 'shopping_list', title: 'Pain relief', items: [{ name: 'Ibuprofen', why: 'Aches', look_for: 'Single ingredient', active_ingredient: 'ibuprofen', search_terms: 'ibuprofen' }, { name: 'Heating pad', why: 'Aches', look_for: 'Auto shut-off', search_terms: 'heating pad' }] }] }] })
  const result = await route.post(body({ agent: 'shopping', message: 'Can I take ibuprofen?' }))
  assert.match(result.body.reply, /I checked the FDA label for ibuprofen.*mentions something in your records/)
  assert.match(result.body.reply, /Ask a pharmacist/)
  const items = result.body.tasks[0].payload.items
  assert.equal(items[1].label_check, undefined)
})
