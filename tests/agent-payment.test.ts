import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { cleanPolicy, policyBlock, spentFrom, pendingApprovals } from '../shared/agent-policy.ts'

const source = await readFile(new URL('../server/utils/learning-agent.ts', import.meta.url), 'utf8')
const buySource = source.slice(source.indexOf('async function buy('), source.indexOf('/** One autonomous run:'))
const decideSource = source.slice(source.indexOf('export async function decide('), source.indexOf('// ---- Class requests:')).replace('export ', '')
function harness(options: { noKey?: boolean; noPurse?: boolean; price?: number; releaseFails?: boolean } = {}) {
  const events: any[] = [{ kind: 'approval_needed', courseId: 'class-1', amount: 4, data: { title: 'Yoruba' } }]
  const calls: string[] = []
  const agent = { id: 'agent-1', secretEnc: options.noKey ? '' : 'encrypted-agent', ownerSecretEnc: 'encrypted-owner', purseId: options.noPurse ? null : 'purse-1', policy: { perClassMax: 5, totalBudget: 6, approvalAbove: 3, maxPerRun: 2 } as any }
  const course = { id: 'class-1', draft: { title: 'Yoruba', priceAmount: String(options.price ?? 4) } }
  const bindings = {
    usingUserWallet: (value: any) => !value.secretEnc,
    logEvent: async (_id: string, event: any) => { events.unshift(event); return event },
    Keypair: { fromSecret: (secret: string) => secret },
    unseal: (value: string) => value,
    listEvents: async () => events,
    releaseFromPurse: async (_key: string, _purse: string, _course: string, _price: number, owner: string) => { calls.push(`release:${owner}`); if (options.releaseFails) throw new Error('refused'); return 'release-tx' },
    payForCourse: async () => { calls.push('payment'); return { transaction: 'payment-tx', accessToken: 'paid-token' } },
    purseError: () => 'Purse refused',
    pendingApprovals, policyBlock, spentFrom, cleanPolicy,
    cloud: async (path: string, init: any) => { calls.push(`cloud:${path}:${init?.body?.policy?.autoApprove}`) },
    listCourses: async () => [course],
    createError: (details: any) => Object.assign(new Error(details.statusMessage), details),
  }
  const decide = new Function(...Object.keys(bindings), `${stripTypeScriptTypes(buySource + decideSource)}\nreturn decide`)(...Object.values(bindings))
  return { events, calls, agent, decide: (approve = true, always = false) => decide(agent, 'https://app.test', course.id, approve, always) }
}

test('one in-app approval co-signs the purse release and pays without a browser wallet', async () => {
  const h = harness()
  const result = await h.decide()
  assert.deepEqual(h.calls, ['release:encrypted-owner', 'payment'])
  assert.equal(result.at(-1).kind, 'paid')
  await assert.rejects(h.decide(), /Nothing is waiting/)
  assert.equal(h.calls.length, 2, 'repeated approval does not pay again')
})

test('decline and budget violations never release or pay', async () => {
  for (const [options, approve] of [[{}, false], [{ price: 7 }, true]] as const) {
    const h = harness(options)
    await h.decide(approve)
    assert.deepEqual(h.calls, [])
  }
})

test('missing signing key, missing purse and purse refusal cannot reach payment', async () => {
  for (const options of [{ noKey: true }, { noPurse: true }, { releaseFails: true }]) {
    const h = harness(options)
    const result = await h.decide()
    assert.equal(result.at(-1).kind, 'blocked')
    assert.ok(!h.calls.includes('payment'))
  }
})

test('approve and do not ask again turns on standing approval; later releases are co-signed automatically', async () => {
  const run = harness()
  await run.decide(true, true)
  assert.equal(run.agent.policy.autoApprove, true)
  assert.ok(run.calls.includes('cloud:/agents/agent-1:true'), 'standing approval is saved')
  assert.deepEqual(run.calls.filter(call => call.startsWith('release') || call === 'payment'), ['release:encrypted-owner', 'payment'])
  assert.ok(run.events.some(event => /Standing approval is on/.test(event.message ?? '')))
})
