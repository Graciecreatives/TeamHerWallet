/**
 * Soroban learning purse (contracts/learning-purse) on Stellar Testnet.
 *
 * Each learning agent gets its own purse contract. The purse holds the budget in USDC and releases one
 * class price at a time to the agent wallet. Limits are enforced by the contract, not by this server:
 * per-class cap, total budget, one payment per class, and the owner's signature above the ask-first limit.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { Address, Asset, Contract, Keypair, nativeToScVal, Networks, Operation, rpc, scValToNative, TransactionBuilder, xdr, authorizeEntry, inspectAuthEntry } from '@stellar/stellar-sdk'
import type { AgentPolicy } from '#shared/agent-policy'

const NETWORK = Networks.TESTNET
const USDC_ASSET = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
export const USDC_CONTRACT = USDC_ASSET.contractId(NETWORK)
const WASM_PATH = resolve(process.cwd(), 'contracts/target/wasm32v1-none/release/learnpurse.wasm')
const units = (usdc: number) => BigInt(Math.round(usdc * 1e7))

function server() { return new rpc.Server(String(useRuntimeConfig().stellarRpcUrl || 'https://soroban-testnet.stellar.org')) }

export const PURSE_ERRORS: Record<number, string> = {
  1: 'invalid amount', 2: 'over the per-class limit', 3: 'over the total budget', 4: 'this class was already paid for',
  5: 'the purse is paused', 6: 'invalid limits', 7: 'the purse does not hold enough USDC',
}
export function purseError(error: unknown): string {
  const text = String((error as Error)?.message ?? error)
  const code = Number(text.match(/Error\(Contract, #(\d+)\)/)?.[1])
  if (code && PURSE_ERRORS[code]) return `Purse contract refused: ${PURSE_ERRORS[code]}.`
  if (/require_auth|Auth, InvalidAction|authorization/i.test(text)) return 'Purse contract refused: the owner has not signed this payment.'
  return `Purse contract call failed: ${text.slice(0, 160)}`
}

/** Simulate, attach auth, sign and submit. Extra signers authorise their own Soroban auth entries. */
async function invoke(source: Keypair, operation: xdr.Operation, authSigners: Keypair[] = []): Promise<{ hash: string; result: any }> {
  const rpcServer = server()
  const account = await rpcServer.getAccount(source.publicKey())
  let tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase: NETWORK }).addOperation(operation).setTimeout(120).build()
  const simulation = await rpcServer.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simulation)) throw new Error(simulation.error)
  if (authSigners.length) {
    // Sign the address-credential auth entries for non-source signers (e.g. the purse owner).
    const latest = (await rpcServer.getLatestLedger()).sequence
    const entries = simulation.result?.auth ?? []
    const signed: xdr.SorobanAuthorizationEntry[] = []
    for (const entry of entries as xdr.SorobanAuthorizationEntry[]) {
      const address = inspectAuthEntry(entry).address
      const signer = address ? authSigners.find(keypair => keypair.publicKey() === address) : undefined
      signed.push(signer ? await authorizeEntry(entry, signer, latest + 60, NETWORK, address!) : entry)
    }
    const op = tx.operations[0] as Operation.InvokeHostFunction
    tx = new TransactionBuilder(await rpcServer.getAccount(source.publicKey()), { fee: '1000000', networkPassphrase: NETWORK })
      .addOperation(Operation.invokeHostFunction({ func: op.func, auth: signed }))
      .setTimeout(120).build()
    const resimulated = await rpcServer.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(resimulated)) throw new Error(resimulated.error)
    tx = rpc.assembleTransaction(tx, resimulated).build()
  } else {
    tx = rpc.assembleTransaction(tx, simulation).build()
  }
  tx.sign(source)
  const sent = await rpcServer.sendTransaction(tx)
  if (sent.status === 'ERROR') throw new Error(`send failed: ${JSON.stringify((sent.errorResult as any)?.result?.()?.switch?.()?.name ?? sent.status)}`)
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(done => setTimeout(done, 1500))
    const status = await rpcServer.getTransaction(sent.hash)
    if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash: sent.hash, result: status.returnValue ? scValToNative(status.returnValue) : null }
    if (status.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`transaction failed ${sent.hash}`)
  }
  throw new Error(`transaction not confirmed ${sent.hash}`)
}

/** Upload the purse wasm once per process and remember its hash. */
let wasmHash: Buffer | null = null
async function ensureWasm(payer: Keypair): Promise<Buffer> {
  if (wasmHash) return wasmHash
  const wasm = await readFile(WASM_PATH).catch(() => { throw new Error('Purse contract is not built. Run npm run contract:build.') })
  const hash = createHash('sha256').update(wasm).digest()
  // Upload is idempotent on-chain. Simulation fails only if it can't be uploaded at all.
  try { await invoke(payer, Operation.uploadContractWasm({ wasm })) } catch (error) { if (!/exist/i.test(String(error))) throw error }
  wasmHash = hash
  return hash
}

const limitsVal = (policy: AgentPolicy) => xdr.ScVal.scvMap([
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('approval_above'), val: nativeToScVal(units(policy.approvalAbove), { type: 'i128' }) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('per_class_max'), val: nativeToScVal(units(policy.perClassMax), { type: 'i128' }) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('total_budget'), val: nativeToScVal(units(policy.totalBudget), { type: 'i128' }) }),
])

/** Deploy a purse for an agent. The owner key deploys (and pays fees); the agent is the only spender. */
export async function deployPurse(owner: Keypair, agent: string, policy: AgentPolicy): Promise<{ contractId: string; transaction: string }> {
  const hash = await ensureWasm(owner)
  const deployed = await invoke(owner, Operation.createCustomContract({
    address: Address.fromString(owner.publicKey()),
    wasmHash: hash,
    salt: randomBytes(32),
    constructorArgs: [Address.fromString(owner.publicKey()).toScVal(), Address.fromString(agent).toScVal(), Address.fromString(USDC_CONTRACT).toScVal(), limitsVal(policy)],
  }))
  return { contractId: String(deployed.result), transaction: deployed.hash }
}

/** Owner moves USDC into the purse (a normal SAC transfer). */
export async function fundPurse(owner: Keypair, contractId: string, usdc: number): Promise<string> {
  const op = new Contract(USDC_CONTRACT).call('transfer', Address.fromString(owner.publicKey()).toScVal(), Address.fromString(contractId).toScVal(), nativeToScVal(units(usdc), { type: 'i128' }))
  return (await invoke(owner, op)).hash
}

/** Agent asks the purse for exactly one class price. Pass the owner when the price needs approval. */
export async function releaseFromPurse(agent: Keypair, contractId: string, courseId: string, usdc: number, owner?: Keypair): Promise<string> {
  const op = new Contract(contractId).call('release', nativeToScVal(courseId, { type: 'string' }), nativeToScVal(units(usdc), { type: 'i128' }))
  return (await invoke(agent, op, owner ? [owner] : [])).hash
}

export async function setPurseLimits(owner: Keypair, contractId: string, policy: AgentPolicy): Promise<string> {
  return (await invoke(owner, new Contract(contractId).call('set_limits', limitsVal(policy)))).hash
}

/** Read-only state (no fees). */
export async function purseState(contractId: string, sourceKey: string): Promise<{ spent: number; balance: number; paused: boolean; limits: AgentPolicy } | null> {
  try {
    const rpcServer = server()
    const account = await rpcServer.getAccount(sourceKey)
    const read = async (method: string) => {
      const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK }).addOperation(new Contract(contractId).call(method)).setTimeout(30).build()
      const simulation = await rpcServer.simulateTransaction(tx)
      if (rpc.Api.isSimulationError(simulation) || !simulation.result) throw new Error('read failed')
      return scValToNative(simulation.result.retval)
    }
    const [state, balance] = await Promise.all([read('state'), read('balance')])
    const usdc = (value: bigint) => Number(value) / 1e7
    return { spent: usdc(state.spent), balance: usdc(balance), paused: state.paused, limits: { perClassMax: usdc(state.limits.per_class_max), totalBudget: usdc(state.limits.total_budget), approvalAbove: usdc(state.limits.approval_above), maxPerRun: 0 } }
  } catch { return null }
}
