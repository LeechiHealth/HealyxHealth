const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadTs } = require('./helpers/load-ts.cjs')

// Synthetic data only. No real health data in tests.
const providers = loadTs('lib/agents/providers.ts')
const safety = loadTs('lib/agents/safety.ts')
const records = loadTs('lib/agents/records.ts')

const NPI_RESPONSE = {
  results: [
    { number: 1234567890, enumeration_type: 'NPI-1', basic: { first_name: 'JANE', last_name: 'SYNTHETIC', credential: 'M.D.' },
      addresses: [{ address_purpose: 'MAILING', address_1: 'PO BOX 1' }, { address_purpose: 'LOCATION', address_1: '100 TEST AVE', city: 'TAMPA', state: 'FL', postal_code: '336470000', telephone_number: '813-555-0100' }],
      taxonomies: [{ desc: 'Dermatology', primary: true }] },
    { number: 1999999999, enumeration_type: 'NPI-2', basic: { organization_name: 'SYNTHETIC SKIN CLINIC LLC' }, addresses: [], taxonomies: [] },
    { basic: {} },
  ],
}

test('the NPI registry URL widens a ZIP to its area and parses practice locations', () => {
  const url = new URL(providers.registryUrl({ specialty: 'Dermatology', zip: '33647', limit: 50 }))
  assert.equal(url.searchParams.get('taxonomy_description'), 'Dermatology')
  assert.equal(url.searchParams.get('postal_code'), '336*')
  assert.equal(url.searchParams.get('limit'), '20')
  const parsed = providers.parseRegistry(NPI_RESPONSE)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].name, 'Jane Synthetic')
  assert.equal(parsed[0].credential, 'MD')
  assert.equal(parsed[0].address, '100 Test Ave')
  assert.equal(parsed[0].zip, '33647')
  assert.equal(parsed[0].phone, '(813) 555-0100')
  assert.equal(parsed[1].kind, 'organization')
})

test('the honesty filter also catches claims of paying, filing or appealing', () => {
  for (const claim of ['I paid your bill.', "We've appealed the denial.", 'Your payment has been submitted.', "I'll buy it for you."]) assert.equal(safety.overclaims(claim), true, claim)
  assert.equal(safety.overclaims('Your appeal letter is ready to send.'), false)
})

test('tasks whose next step costs money are marked for the person to confirm', () => {
  assert.equal(safety.guardSpending({ kind: 'rx_savings', payload: {} }).payload.confirm_before_spending, true)
  assert.equal(safety.guardSpending({ kind: 'follow_up', payload: {} }).payload.confirm_before_spending, undefined)
})

test('Follow-Through gets age, sex and recent labs; other agents do not', () => {
  const r = { medications: [{ name: 'Synthetic Med', status: 'active' }], conditions: [{ name: 'Synthetic Condition' }], labs: [{ name: 'LDL', value: 160, unit: 'mg/dL', status: 'high', test_date: '2026-05-23T00:00:00Z' }], profile: { date_of_birth: '1990-11-21', gender: 'male', insurance_provider: 'Synthetic PPO' }, unavailable: false }
  const follow = JSON.parse(records.recordsFor('follow_through', r, '2026-11-20'))
  assert.equal(follow.age, 35)
  assert.equal(follow.recent_labs[0].date, '2026-05-23')
  const research = JSON.parse(records.recordsFor('research', r))
  assert.equal(research.recent_labs, undefined)
  assert.equal(research.age, undefined)
  assert.equal(JSON.parse(records.recordsFor('care_finder', r)).insurance_plan, 'Synthetic PPO')
})

// ─── Route-level runs ───────────────────────────────────────────────────────

function fakeDb() {
  const inserted = { agent_messages: [], agent_tasks: [] }
  const upserts = []
  const memory = [{ key: 'insurance_plan', value: { text: 'Synthetic PPO' } }]
  const db = {
    inserted, upserts,
    from(table) {
      const rows = table === 'agent_memory' ? memory : []
      const chain = {
        select: () => chain, eq: () => chain, neq: () => chain, order: () => chain,
        limit: async () => ({ data: rows, error: null }),
        upsert: async row => { upserts.push({ table, row }); return { error: null } },
        insert: list => {
          inserted[table]?.push(...list)
          const result = { data: list.map((row, i) => ({ id: `${table}-${i}`, created_at: '2026-11-20T12:00:00Z', ...row })), error: null }
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

const call = (name, args, id = `${name}-${Math.random().toString(36).slice(2, 7)}`) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
const toolTurn = (...calls) => ({ role: 'assistant', content: null, tool_calls: calls })
const finalTurn = content => ({ role: 'assistant', content })

function loadRoute({ turns = [], fetchImpl, db = fakeDb() } = {}) {
  const requests = []
  const fetched = []
  const route = loadTs('app/api/agents/run/route.ts', {
    stubs: {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      '@/lib/serverAuth': { authenticateRequest: async () => ({ user: { id: 'synthetic-user' }, supabase: db }) },
      '@/lib/agents/llm': {
        agentProviders: () => ['groq'],
        chat: async (request, _env, options) => {
          requests.push({ request: JSON.parse(JSON.stringify(request)), options })
          const next = turns.shift()
          if (!next) throw Object.assign(new Error('no scripted turn'), { status: 500 })
          return { message: typeof next === 'function' ? next(request) : next, provider: 'scripted' }
        },
      },
      '@/lib/agents/web': { browseWeb: async () => ({ answer: 'A synthetic clinic page lists new-patient openings next week.', sources: [{ title: 'clinic.example', url: 'https://clinic.example' }], engine: 'test' }) },
    },
    globals: {
      process: { env: {} }, Response, ReadableStream, TextEncoder, TextDecoder,
      fetch: async url => { fetched.push(String(url)); if (!fetchImpl) throw new Error('offline'); return fetchImpl(String(url)) },
    },
  })
  return { post: route.POST, requests, fetched, db }
}

const body = extra => ({ json: async () => ({ agent: 'care_finder', message: 'Find an in-network dermatologist near me', now: '2026-11-20T09:00', tz: 'America/New_York', tzOffsetMinutes: 300, ...extra }) })
const events = async result => (await result.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))

test('Care Finder uses memory, the device location and the NPI registry, then saves a ranked shortlist', async () => {
  const fetchImpl = async url => {
    if (url.includes('bigdatacloud')) return { ok: true, json: async () => ({ city: 'Tampa', postcode: '33647', principalSubdivisionCode: 'US-FL' }) }
    if (url.includes('npiregistry')) return { ok: true, json: async () => NPI_RESPONSE }
    throw new Error(`unexpected ${url}`)
  }
  const route = loadRoute({ fetchImpl, turns: [
    toolTurn(call('recall_facts', {}, 'm1'), call('find_providers', { specialty: 'Dermatology' }, 'n1')),
    request => {
      const memory = request.messages.find(m => m.tool_call_id === 'm1')
      assert.match(memory.content, /Synthetic PPO/)
      const npi = request.messages.find(m => m.tool_call_id === 'n1')
      assert.match(npi.content, /Jane Synthetic/)
      return toolTurn(call('prepare_care_options', {
        title: 'Dermatologists near Tampa', need: 'Skin check',
        options: [{ name: 'Jane Synthetic, MD', npi: '1234567890', phone: '(813) 555-0100', in_network: 'unknown', next_opening: 'Next week' }],
        call_script: 'Hi, do you take Synthetic PPO and have new-patient openings?',
      }))
    },
    finalTurn('Here are dermatologists near you. Call the first one to confirm your plan.'),
  ] })
  const all = await events(await route.post(body({ location: { lat: 28.1534, lon: -82.3612 } })))
  const done = all.find(e => e.type === 'done')
  assert.ok(done, JSON.stringify(all))
  assert.equal(done.tasks[0].kind, 'care_options')
  assert.equal(done.tasks[0].payload.options[0].in_network, 'unknown')
  assert.equal(done.tasks[0].payload.confirm_before_spending, true)
  assert.ok(route.fetched.some(url => url.includes('latitude=28.15') && url.includes('longitude=-82.36')))
  assert.ok(route.fetched.some(url => url.includes('postal_code=336')))
  assert.match(route.requests[0].request.messages[0].content, /You are Care Finder/)
  assert.match(route.requests[0].request.messages[0].content, /near Tampa \(ZIP 33647\)/)
  assert.match(route.requests[0].request.messages[0].content, /Never ask permission/)
})

test('a bill photo goes to a vision model and the saved message notes it without storing the image', async () => {
  const route = loadRoute({ turns: [
    toolTurn(call('prepare_bill_case', { title: 'ER bill', findings: [{ issue: 'duplicate charge', detail: 'CT billed twice', amount: 1200 }], estimated_savings: 1200, letter: 'Dear billing office, [Your name]...', letter_type: 'itemized_bill_request' })),
    finalTurn('I found a likely duplicate charge. Your itemized bill request is ready.'),
  ] })
  const all = await events(await route.post(body({ agent: 'bill_advocate', message: 'Is this bill right?', images: [{ mimeType: 'image/jpeg', data: 'AAAA' }] })))
  const done = all.find(e => e.type === 'done')
  assert.equal(done.tasks[0].kind, 'bill_case')
  assert.equal(done.tasks[0].payload.estimated_savings, 1200)
  assert.equal(route.requests[0].options.onlyGemini, true)
  const user = route.requests[0].request.messages.find(m => m.role === 'user')
  assert.equal(user.content[1].type, 'image_url')
  assert.match(route.db.inserted.agent_messages[0].content, /\[1 photo attached\]/)
  assert.equal(route.db.inserted.agent_messages[0].content.includes('AAAA'), false)
})

test('memory refuses anything that looks like an ID or account number', async () => {
  const route = loadRoute({ turns: [
    toolTurn(call('remember_fact', { key: 'insurance_plan', value: 'Member ID 123456789' }, 'r1'), call('remember_fact', { key: 'preferred_pharmacy', value: 'Publix on Bruce B Downs' }, 'r2')),
    request => {
      assert.match(request.messages.find(m => m.tool_call_id === 'r1').content, /Not saved/)
      return finalTurn('Got it, I saved your pharmacy.')
    },
  ] })
  await events(await route.post(body({ agent: 'rx_saver', message: 'My pharmacy is Publix on Bruce B Downs, member ID 123456789' })))
  assert.equal(route.db.upserts.length, 1)
  assert.equal(route.db.upserts[0].row.key, 'preferred_pharmacy')
})

test('Follow-Through adds dated follow-ups and Rx Saver never invents a price', async () => {
  const route = loadRoute({ turns: [
    toolTurn(call('add_follow_up', { title: 'Recheck LDL', due_on: '2027-01-15', why: 'LDL 160 mg/dL on 2026-05-23 had no recheck', next_step: 'Ask for a lipid panel', category: 'lab_recheck' })),
    finalTurn('One loose end: your LDL needs a recheck.'),
  ] })
  const done = (await events(await route.post(body({ agent: 'follow_through', message: 'What am I forgetting?' })))).find(e => e.type === 'done')
  assert.equal(done.tasks[0].kind, 'follow_up')
  assert.equal(done.tasks[0].due_at, '2027-01-15T14:00:00.000Z')

  const rx = loadRoute({ turns: [
    toolTurn(call('prepare_rx_savings', { medication: 'Synthetic 10 mg', prices: [{ pharmacy: 'Cost Plus Drugs', price: 6.3, url: 'https://costplusdrugs.example' }, { pharmacy: 'Publix', note: 'check' }], best: 'Cost Plus Drugs' })),
    finalTurn('Cost Plus Drugs looks cheapest at $6.30. You confirm any order yourself.'),
  ] })
  const saved = (await events(await rx.post(body({ agent: 'rx_saver', message: 'Cheapest place for my med?' })))).find(e => e.type === 'done')
  assert.equal(saved.tasks[0].title, 'Save on Synthetic 10 mg')
  assert.equal(saved.tasks[0].payload.prices[1].price, undefined)
})
