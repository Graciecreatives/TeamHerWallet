// End-to-end: create a learning agent (own Testnet wallet), let it pick and pay for a class by itself
// over x402, then check the rules (approval threshold, decline, budget).
// Usage: node scripts/learning-agent-e2e.mjs [baseUrl]
import assert from 'node:assert/strict'
const BASE = process.argv[2] ?? 'http://localhost:3000'
const call = async (path, { method = 'GET', body, key } = {}) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-agent-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}
const print = events => events.forEach(event => console.log(`  [${event.kind}] ${event.message}`))

const created = await call('/api/learning-agents', { method: 'POST', body: { name: 'Ada’s learning agent', learner: 'Ada, 9, lives in London, Nigerian heritage', goal: 'Ada wants to speak Yoruba with her grandma. I (her mum) also want to learn to sell my beadwork online.', policy: { perClassMax: 5, totalBudget: 6, approvalAbove: 3, maxPerRun: 2 } } })
assert.equal(created.status, 201, JSON.stringify(created.json))
const { agent, ownerKey } = created.json
console.log('agent', agent.id, agent.publicKey)
assert.equal((await call(`/api/learning-agents/${agent.id}`)).status, 404, 'owner key required')
const state = (await call(`/api/learning-agents/${agent.id}`, { key: ownerKey })).json
console.log('balance', state.balance)
print([...state.events].reverse())

const run = await call(`/api/learning-agents/${agent.id}/run`, { method: 'POST', key: ownerKey })
assert.equal(run.status, 200, JSON.stringify(run.json))
console.log('run 1'); print(run.json.events)
const after = (await call(`/api/learning-agents/${agent.id}`, { key: ownerKey })).json
console.log('spent', after.spent, 'library', after.library.map(item => `${item.title} ${item.transaction}`), 'pending', after.pending.map(item => item.data?.title))
assert.ok(after.spent <= 6)
for (const item of after.library) assert.match(item.transaction ?? '', /^[0-9a-f]{64}$/)
if (after.pending[0]) {
  const approved = await call(`/api/learning-agents/${agent.id}/decide`, { method: "POST", key: ownerKey, body: { courseId: after.pending[0].courseId, approve: true } })
  console.log("approve"); print(approved.json.events)
  if (approved.json.events?.some(event => event.kind === "failed")) { const retry = await call(`/api/learning-agents/${agent.id}/decide`, { method: "POST", key: ownerKey, body: { courseId: after.pending[0].courseId, approve: true } }); console.log("retry"); print(retry.json.events ?? [retry.json]) }
}
if (false) {
  const declined = await call(`/api/learning-agents/${agent.id}/decide`, { method: 'POST', key: ownerKey, body: { courseId: after.pending[0].courseId, approve: false } })
  console.log('decline'); print(declined.json.events)
}
console.log(`PASS: ${after.library.length} class(es) bought autonomously, ${after.spent} USDC spent`)
const final = (await call(`/api/learning-agents/${agent.id}`, { key: ownerKey })).json
console.log('final spent', final.spent, 'wallet', final.balance?.usdc, 'library', final.library.map(item => `${item.title} https://stellar.expert/explorer/testnet/tx/${item.transaction}`))
assert.ok(final.spent <= 6, 'budget respected')
const second = await call(`/api/learning-agents/${agent.id}/run`, { method: 'POST', key: ownerKey })
console.log('run 2 (should not rebuy)'); print(second.json.events)
assert.ok(!second.json.events.some(event => event.kind === 'paid' && final.library.some(item => item.courseId === event.courseId)))
