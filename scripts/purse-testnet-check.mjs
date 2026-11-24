// Deploys the learning purse on Stellar Testnet and proves the on-chain rules:
// release within limits works, over-limit / over-budget / double-pay / missing owner signature fail.
// Usage: node scripts/purse-testnet-check.mjs   (needs contracts built: npm run contract:build)
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { Address, Asset, Contract, Horizon, Keypair, nativeToScVal, Networks, Operation, rpc, scValToNative, TransactionBuilder, xdr, authorizeEntry, inspectAuthEntry } from '@stellar/stellar-sdk'

const NET = Networks.TESTNET
const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org')
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
const SAC = USDC.contractId(NET)
const u = n => BigInt(Math.round(n * 1e7))

async function classic(kp, ops) {
  const acc = await horizon.loadAccount(kp.publicKey()); const b = new TransactionBuilder(acc, { fee: '1000', networkPassphrase: NET }).setTimeout(60)
  ops.forEach(o => b.addOperation(o)); const tx = b.build(); tx.sign(kp); return horizon.submitTransaction(tx)
}
async function invoke(source, op, signers = []) {
  let tx = new TransactionBuilder(await rpcServer.getAccount(source.publicKey()), { fee: '1000000', networkPassphrase: NET }).addOperation(op).setTimeout(120).build()
  let sim = await rpcServer.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  if (signers.length) {
    const latest = (await rpcServer.getLatestLedger()).sequence
    const auth = []
    for (const entry of sim.result.auth) {
      const who = inspectAuthEntry(entry).address
      const signer = who ? signers.find(k => k.publicKey() === who) : undefined
      auth.push(signer ? await authorizeEntry(entry, signer, latest + 60, NET, who) : entry)
    }
    tx = new TransactionBuilder(await rpcServer.getAccount(source.publicKey()), { fee: '1000000', networkPassphrase: NET }).addOperation(Operation.invokeHostFunction({ func: tx.operations[0].func, auth })).setTimeout(120).build()
    sim = await rpcServer.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  }
  tx = rpc.assembleTransaction(tx, sim).build(); tx.sign(source)
  const sent = await rpcServer.sendTransaction(tx)
  if (sent.status === 'ERROR') throw new Error('send failed')
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1500)); const s = await rpcServer.getTransaction(sent.hash); if (s.status === 'SUCCESS') return { hash: sent.hash, result: s.returnValue ? scValToNative(s.returnValue) : null }; if (s.status === 'FAILED') throw new Error('failed ' + sent.hash) }
  throw new Error('timeout')
}
const limits = (per, total, approve) => xdr.ScVal.scvMap([
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('approval_above'), val: nativeToScVal(u(approve), { type: 'i128' }) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('per_class_max'), val: nativeToScVal(u(per), { type: 'i128' }) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('total_budget'), val: nativeToScVal(u(total), { type: 'i128' }) }),
])
const expectFail = async (label, promise, pattern) => { try { await promise; assert.fail(`${label} should fail`) } catch (e) { assert.match(String(e.message), pattern, label); console.log(`  ✓ refused: ${label}`) } }

const owner = Keypair.random(), agent = Keypair.random()
await Promise.all([owner, agent].map(k => fetch(`https://friendbot.stellar.org?addr=${k.publicKey()}`)))
await classic(owner, [Operation.changeTrust({ asset: USDC }), Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: '9000', destination: owner.publicKey(), destAsset: USDC, destAmount: '6', path: [] })])
await classic(agent, [Operation.changeTrust({ asset: USDC })])
const wasm = await readFile('contracts/target/wasm32v1-none/release/learnpurse.wasm')
try { await invoke(owner, Operation.uploadContractWasm({ wasm })) } catch (e) { if (!/exist/i.test(String(e))) throw e }
const deployed = await invoke(owner, Operation.createCustomContract({ address: Address.fromString(owner.publicKey()), wasmHash: createHash('sha256').update(wasm).digest(), salt: randomBytes(32), constructorArgs: [Address.fromString(owner.publicKey()).toScVal(), Address.fromString(agent.publicKey()).toScVal(), Address.fromString(SAC).toScVal(), limits(5, 6, 3)] }))
const purse = deployed.result
console.log('purse', purse, 'deploy tx', deployed.hash)
await invoke(owner, new Contract(SAC).call('transfer', Address.fromString(owner.publicKey()).toScVal(), Address.fromString(purse).toScVal(), nativeToScVal(u(6), { type: 'i128' })))
const release = (course, amount, signers = []) => invoke(agent, new Contract(purse).call('release', nativeToScVal(course, { type: 'string' }), nativeToScVal(u(amount), { type: 'i128' })), signers)

const ok = await release('class-a', 2); console.log('  ✓ released 2 USDC, tx', ok.hash)
await expectFail('over per-class limit (5.5 > 5)', release('class-b', 5.5), /#2/)
await expectFail('same class twice', release('class-a', 1), /#4/)
await expectFail('4 USDC above ask-first 3 without owner', release('class-c', 4), /auth|Auth|failed [0-9a-f]{64}/)
const approved = await release('class-c', 4, [owner]); console.log('  ✓ released 4 USDC with owner signature, tx', approved.hash)
await expectFail('over total budget (6 + 0.5)', release('class-d', 0.5), /#3/)
const agentUsdc = (await horizon.loadAccount(agent.publicKey())).balances.find(b => b.asset_code === 'USDC').balance
assert.equal(agentUsdc, '6.0000000')
console.log(`PASS: purse ${purse} enforced every rule on Stellar Testnet. https://stellar.expert/explorer/testnet/contract/${purse}`)
