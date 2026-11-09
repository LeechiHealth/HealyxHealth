const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')

// Synthetic records only. No real health data in tests.
const MEDS = [
  { name: 'Levothyroxine 50 mcg', dosage: '50 mcg', frequency: 'once daily', status: 'active', pharmacy: 'Synthetic Pharmacy', prescribing_doctor: 'Dr. Test' },
  { name: 'Old Med', status: 'stopped' },
]
const CONDITIONS = [{ name: 'Hypothyroidism', status: 'active' }]

function fakeDb({ missingTables = false, missingMeta = false } = {}) {
  const inserted = { agent_messages: [], agent_tasks: [] }
  const updated = []
  const db = {
    inserted, updated,
    from(table) {
      const rows = table === 'medications' ? MEDS : table === 'conditions' ? CONDITIONS : table === 'agent_tasks' ? [{ id: 'task-1', agent: 'medications', kind: 'refill_request', title: 'Refill Levothyroxine', status: 'todo' }] : []
      const filters = []
      const chain = {
        select: () => chain,
        eq: (column, value) => { filters.push([column, value]); return chain },
        neq: () => chain,
        order: () => chain,
        limit: async () => ({ data: rows, error: null }),
        single: async () => ({ data: { id: 'task-1', title: 'Refill Levothyroxine' }, error: null }),
        update: patch => { updated.push({ table, patch, filters }); return chain },
        insert: list => {
          let result
          if (missingTables) result = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.agent_tasks' in the schema cache" } }
          else if (missingMeta && table === 'agent_messages' && list.some(row => 'meta' in row)) result = { data: null, error: { code: 'PGRST204', message: "Could not find the 'meta' column of 'agent_messages'" } }
          else { inserted[table].push(...list); result = { data: list.map((row, i) => ({ id: `${table}-${i}`, created_at: '2026-11-09T12:00:00Z', ...row })), error: null } }
          const promise = Promise.resolve(result)
          promise.select = async () => result
          return promise
        },
      }
      return chain
    },
  }
  return db
}

const call = (name, args, id = `${name}-${Math.random().toString(36).slice(2, 7)}`) => ({ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } })
const toolTurn = (...calls) => ({ role: 'assistant', content: null, tool_calls: calls })
const finalTurn = content => ({ role: 'assistant', content })

function loadRoute({ authenticated = true, turns = [], providers = ['groq'], fetchImpl, web, db = fakeDb() } = {}) {
  const requests = []
  const route = loadTs('app/api/agents/run/route.ts', {
    stubs: {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      '@/lib/serverAuth': { authenticateRequest: async () => (authenticated ? { user: { id: 'synthetic-user' }, supabase: db } : { response: { status: 401 } }) },
      '@/lib/agents/llm': {
        agentProviders: () => providers,
        chat: async request => {
          requests.push(JSON.parse(JSON.stringify(request)))
          const next = turns.shift()
          if (!next) throw Object.assign(new Error('no scripted turn'), { status: 500 })
          if (next instanceof Error) throw next
          return { message: typeof next === 'function' ? next(request) : next, provider: 'scripted' }
        },
      },
      '@/lib/agents/web': { browseWeb: web || (async () => { throw new Error('WEB_UNAVAILABLE') }) },
    },
    globals: {
      process: { env: {} }, Response, ReadableStream, TextEncoder, TextDecoder,
      fetch: async url => { if (!fetchImpl) throw new Error('offline'); return fetchImpl(String(url)) },
    },
  })
  return { post: route.POST, requests, db }
}

const body = extra => ({ json: async () => ({ agent: 'medications', message: 'Remind me to take my thyroid pill at 7', now: '2026-11-09T21:30', tz: 'America/New_York', tzOffsetMinutes: 300, ...extra }) })

async function events(result) {
  const text = await result.text()
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

test('unauthenticated requests never reach the provider', async () => {
  const route = loadRoute({ authenticated: false })
  assert.equal((await route.post(body())).status, 401)
  assert.equal(route.requests.length, 0)
})

test('invalid input is rejected before the provider', async () => {
  const route = loadRoute()
  for (const extra of [{ agent: 'billing' }, { message: '' }, { now: 'tomorrow' }]) assert.equal((await route.post(body(extra))).status, 400)
  assert.equal(route.requests.length, 0)
})

test('a crisis gets 988 guidance; nothing is stored or sent to the provider', async () => {
  const route = loadRoute()
  const result = await route.post(body({ message: 'I want to end my life' }))
  assert.equal(result.body.urgent, 'crisis')
  assert.match(result.body.reply, /988/)
  assert.equal(route.requests.length, 0)
  assert.equal(route.db.inserted.agent_messages.length, 0)
})

test('no configured provider returns a controlled error', async () => {
  const result = await loadRoute({ providers: [] }).post(body())
  assert.equal(result.status, 503)
})

test('the agent chains tools, fixes its own mistakes, and streams each step', async () => {
  const route = loadRoute({ turns: [
    toolTurn(call('set_medication_reminder', { medication: 'Levothyroxine', dose: '50 mcg', times: ['7am'] }, 'c1')),
    request => {
      const toolReply = request.messages.find(m => m.role === 'tool' && m.tool_call_id === 'c1')
      assert.match(toolReply.content, /Not saved/)
      return toolTurn(
        call('set_medication_reminder', { medication: 'Levothyroxine', dose: '50 mcg', times: ['07:00'], times_confirmed: true }, 'c2'),
        call('prepare_refill_request', { medication: 'Levothyroxine', dose: '50 mcg', message: 'Hello, this is [Your name].', supply_remaining: 10, doses_per_day: 1 }, 'c3'),
      )
    },
    finalTurn('Your 7:00 AM reminder and a refill request are in your queue.'),
  ] })
  const result = await route.post(body())
  assert.equal(result.headers.get('content-type'), 'application/x-ndjson; charset=utf-8')
  const all = await events(result)
  const steps = all.filter(e => e.type === 'step').map(e => `${e.step.label}:${e.step.status}`)
  assert.deepEqual(steps, [
    'Setting a reminder for Levothyroxine:running', 'Setting a reminder for Levothyroxine:error',
    'Setting a reminder for Levothyroxine:running', 'Setting a reminder for Levothyroxine:done',
    'Drafting a refill request for Levothyroxine:running', 'Drafting a refill request for Levothyroxine:done',
  ])
  const done = all.find(e => e.type === 'done')
  assert.equal(done.tasks.length, 2)
  const refill = done.tasks.find(t => t.kind === 'refill_request')
  assert.equal(refill.payload.runs_out_on, '2026-11-19')
  assert.equal(refill.payload.remind_on, '2026-11-14')
  assert.equal(done.meta.steps.length, 3)
  assert.equal(route.requests.length, 3)
  assert.match(route.requests[0].messages[0].content, /You are Medications/)
  assert.match(route.requests[0].messages[0].content, /Monday 2026-11-09 \(today\)/)
  assert.match(route.requests[0].messages[1].content, /Levothyroxine/)
  assert.ok(route.requests[0].tools.some(t => t.function.name === 'set_medication_reminder'))
  assert.equal(route.db.inserted.agent_messages[1].meta.steps.length, 3)
})

test('research briefs keep only points that cite sources the agent actually retrieved', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ results: [{ set_id: 'set-1', openfda: { generic_name: ['magnesium oxide'], brand_name: ['Synthetic Mag'], product_type: ['HUMAN OTC DRUG'] }, ask_doctor_or_pharmacist: ['Ask a doctor or pharmacist before use if you are taking levothyroxine.'] }] }) })
  const web = async () => ({ answer: 'A sleep society page says evidence is limited.', sources: [{ title: 'sleep.example', url: 'https://sleep.example/magnesium' }], engine: 'test' })
  const route = loadRoute({ fetchImpl, web, turns: [
    toolTurn(call('get_fda_label', { drug: 'magnesium oxide' }), call('web_browse', { question: 'magnesium for sleep guidelines' })),
    toolTurn(call('save_research_brief', { topic: 'Magnesium for sleep', points: [{ text: 'Label says ask first if on levothyroxine', cites: [1] }, { text: 'Invented claim', cites: [9] }, { text: 'Uncited claim', cites: [] }] })),
    finalTurn('Evidence is limited. Details are in your queue.'),
  ] })
  const done = (await events(await route.post(body({ agent: 'research', message: 'Does magnesium help sleep?' })))).find(e => e.type === 'done')
  const brief = done.tasks[0]
  assert.equal(brief.kind, 'research_brief')
  assert.deepEqual(brief.payload.points.map(p => p.text), ['Label says ask first if on levothyroxine'])
  assert.equal(brief.payload.sources.length, 2)
  assert.equal(brief.payload.label_mentions[0].term, 'levothyroxine')
  assert.deepEqual(done.meta.sources, [{ title: 'sleep.example', url: 'https://sleep.example/magnesium' }])
})

test('unknown tools, bad JSON and failing tools are reported back to the model', async () => {
  const route = loadRoute({ turns: [
    toolTurn(call('book_appointment', {}, 'u1'), call('web_browse', '{not json', 'u2'), call('web_browse', { question: 'clinic hours' }, 'u3')),
    request => {
      const results = Object.fromEntries(request.messages.filter(m => m.role === 'tool').map(m => [m.tool_call_id, m.content]))
      assert.match(results.u1, /Unknown tool/)
      assert.match(results.u2, /not valid JSON/)
      assert.match(results.u3, /unavailable/)
      return finalTurn('I could not reach the web just now.')
    },
  ] })
  const done = (await events(await route.post(body({ agent: 'appointments', message: 'Find a clinic' })))).find(e => e.type === 'done')
  assert.match(done.reply, /could not reach/)
})

test('the loop stops after the round limit and asks for a final answer without tools', async () => {
  const turns = Array.from({ length: 8 }, () => toolTurn(call('list_my_tasks', {})))
  turns.push(request => { assert.equal(request.tool_choice, 'none'); return finalTurn('Here is where things stand.') })
  const route = loadRoute({ turns })
  const done = (await events(await route.post(body()))).find(e => e.type === 'done')
  assert.equal(done.reply, 'Here is where things stand.')
  assert.equal(route.requests.length, 9)
})

test('agents can move tasks in the person\'s own queue', async () => {
  const route = loadRoute({ turns: [toolTurn(call('update_task_status', { task_id: 'task-1', status: 'done' })), finalTurn('Marked your refill as picked up.')] })
  const done = (await events(await route.post(body({ message: 'I picked up my refill' })))).find(e => e.type === 'done')
  assert.deepEqual(done.updates, [{ id: 'task-1', status: 'done' }])
  assert.deepEqual(route.db.updated[0].filters, [['id', 'task-1'], ['user_id', 'synthetic-user']])
})

test('a reply claiming something was booked or sent is replaced', async () => {
  const route = loadRoute({ turns: [finalTurn("Done! I've booked your physical for Friday.")] })
  const done = (await events(await route.post(body({ agent: 'appointments', message: 'Book my physical' })))).find(e => e.type === 'done')
  assert.match(done.reply, /Nothing has been sent, booked or bought/)
})

test('a present emergency leads with 911 and the agent still helps', async () => {
  const route = loadRoute({ turns: [finalTurn('I can find the nearest ER.')] })
  const done = (await events(await route.post(body({ agent: 'appointments', message: "I'm having chest pain right now" })))).find(e => e.type === 'done')
  assert.equal(done.urgent, 'emergency')
  assert.match(done.reply, /^If this is happening now.*911/)
})

test('missing tables return unsaved tasks; a missing meta column still saves the conversation', async () => {
  const reminder = () => toolTurn(call('set_medication_reminder', { medication: 'Levothyroxine', times: ['07:00'] }))
  const noTables = (await events(await loadRoute({ db: fakeDb({ missingTables: true }), turns: [reminder(), finalTurn('Added.')] }).post(body()))).find(e => e.type === 'done')
  assert.equal(noTables.persisted, false)
  assert.match(noTables.tasks[0].id, /^local-/)
  const db = fakeDb({ missingMeta: true })
  const noMeta = (await events(await loadRoute({ db, turns: [reminder(), finalTurn('Added.')] }).post(body()))).find(e => e.type === 'done')
  assert.equal(noMeta.persisted, true)
  assert.equal(db.inserted.agent_messages.length, 2)
  assert.equal('meta' in db.inserted.agent_messages[1], false)
})

test('provider failures end the stream with a controlled error and no leaked details', async () => {
  const route = loadRoute({ turns: [Object.assign(new Error('Synthetic secret context'), { status: 500 })] })
  const all = await events(await route.post(body()))
  assert.equal(all.at(-1).type, 'error')
  assert.equal(JSON.stringify(all).includes('Synthetic secret'), false)
  const limited = await events(await loadRoute({ turns: [Object.assign(new Error('rate'), { status: 429 })] }).post(body()))
  assert.match(limited.at(-1).error, /limit/)
})
