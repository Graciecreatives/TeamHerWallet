<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BrandMark from './BrandMark.vue'
import StudioIcon from './StudioIcon.vue'
import { connectFreighter } from '../utils/creator'
import { isStellarPublicKey, shortAddress, type CreatorProfile } from '#shared/profile'

const props = defineProps<{ profile: CreatorProfile | null }>()
const emit = defineEmits<{ studio: []; home: []; signOut: []; profileChanged: [profile: CreatorProfile] }>()

type Sale = { courseId: string; title: string; studentTx: string; student: string; at: string; gross: string; fee: string; net: string; status: 'paid' | 'pending' | 'direct'; payoutTx?: string }
type Activity = { hash: string; from: string; to: string; amount: string; memo: string; at: string; direction: 'in' | 'out' }
type WalletData = {
  address: string | null; balance: { funded: boolean; xlm: string; usdc: string | null; trustline: boolean } | null
  feePercent: number; treasury: string | null
  totals: { sales: number; gross: string; fees: string; earned: string; received: string; pending: string; pendingCount: number }
  otherWallets: string[]; sales: Sale[]; activity: Activity[]
}

const data = ref<WalletData | null>(null)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref<'' | 'retry' | 'trustline' | 'send' | 'wallet'>('')
const send = ref({ to: '', amount: '', memo: '' })
const sendOpen = ref(false)
const editWallet = ref(false)
const newWallet = ref('')

const explorer = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`
const accountLink = (address: string) => `https://stellar.expert/explorer/testnet/account/${address}`
const money = (value: string | number | null | undefined) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const who = (activity: Activity) => {
  const other = activity.direction === 'in' ? activity.from : activity.to
  if (data.value?.treasury && other === data.value.treasury) return 'LearnPurse payout'
  return shortAddress(other)
}
const setupNeeded = computed(() => !!data.value?.address && (!data.value.balance?.funded || !data.value.balance.trustline))

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, { method: init?.method ?? 'GET', credentials: 'include', headers: { 'content-type': 'application/json' }, body: init?.body ? JSON.stringify(init.body) : undefined })
  const body = await response.json().catch(() => ({}))
  if (response.status === 401) { emit('signOut'); throw new Error('Please sign in again.') }
  if (!response.ok) throw new Error(body?.statusMessage || body?.message || 'Something went wrong. Try again.')
  return body as T
}

async function load() {
  error.value = ''
  try { data.value = await api<WalletData>('/api/creator/wallet') } catch (cause: any) { error.value = cause.message }
  loading.value = false
}

async function retryPayouts() {
  busy.value = 'retry'; notice.value = ''; error.value = ''
  try {
    const result = await api<{ paid: { amount: string }[]; failed: { error: string }[] }>('/api/creator/wallet/retry', { method: 'POST' })
    if (result.paid.length) notice.value = `Sent ${result.paid.length} payout${result.paid.length === 1 ? '' : 's'} to your wallet.`
    if (result.failed.length) error.value = /no_trust/.test(result.failed[0]!.error) ? 'Your wallet cannot receive USDC yet. Click “Enable USDC” first.' : /no_destination/.test(result.failed[0]!.error) ? 'Your wallet is not active on Testnet yet. Fund it with test XLM first.' : 'Some payouts could not be sent yet. Try again in a minute.'
    if (!result.paid.length && !result.failed.length) notice.value = 'Nothing is waiting. You are all paid up.'
  } catch (cause: any) { error.value = cause.message }
  busy.value = ''
  await load()
}

/** Ask the server for an unsigned transaction, sign it in Freighter, then submit it. The key never leaves Freighter. */
async function signAndSubmit(body: Record<string, unknown>): Promise<string> {
  const { xdr } = await api<{ xdr: string }>('/api/creator/wallet/prepare', { method: 'POST', body })
  const module = await import('@stellar/freighter-api')
  const freighter = (typeof module.isConnected === 'function' ? module : (module as any).default) as typeof import('@stellar/freighter-api')
  const connected = await freighter.isConnected().catch(() => ({ isConnected: false }))
  if (!connected.isConnected) throw new Error('Freighter isn’t installed or unlocked in this browser. Install it from freighter.app, then try again.')
  const access = await freighter.requestAccess()
  if (access.error || !access.address) throw new Error('The connection was cancelled in Freighter.')
  if (access.address !== data.value?.address) throw new Error(`Freighter is on ${shortAddress(access.address)}, but your payout wallet is ${shortAddress(data.value?.address ?? '')}. Switch account in Freighter, or change your payout wallet below.`)
  const signed = await freighter.signTransaction(xdr, { networkPassphrase: 'Test SDF Network ; September 2015', address: access.address })
  if (signed.error || !signed.signedTxXdr) throw new Error('You cancelled the signature in Freighter. Nothing was sent.')
  const { transaction } = await api<{ transaction: string }>('/api/creator/wallet/submit', { method: 'POST', body: { xdr: signed.signedTxXdr } })
  return transaction
}

async function enableUsdc() {
  busy.value = 'trustline'; notice.value = ''; error.value = ''
  try { await signAndSubmit({ kind: 'trustline' }); notice.value = 'USDC is enabled. Your wallet can now receive payouts.' } catch (cause: any) { error.value = cause.message }
  busy.value = ''
  await load()
}

async function sendUsdc() {
  error.value = ''; notice.value = ''
  if (!isStellarPublicKey(send.value.to.trim())) { error.value = 'Enter a valid Stellar address (starts with G, 56 characters).'; return }
  if (!(Number(send.value.amount) > 0)) { error.value = 'Enter an amount to send.'; return }
  if (Number(send.value.amount) > Number(data.value?.balance?.usdc ?? 0)) { error.value = 'That is more than your USDC balance.'; return }
  busy.value = 'send'
  try {
    const hash = await signAndSubmit({ kind: 'send', to: send.value.to.trim(), amount: String(send.value.amount), memo: send.value.memo })
    notice.value = `Sent ${money(send.value.amount)} USDC. Transaction ${hash.slice(0, 10)}…`
    send.value = { to: '', amount: '', memo: '' }; sendOpen.value = false
  } catch (cause: any) { error.value = cause.message }
  busy.value = ''
  await load()
}

async function saveWallet(address: string) {
  error.value = ''; notice.value = ''
  if (!isStellarPublicKey(address)) { error.value = 'Enter a valid Stellar address (starts with G, 56 characters).'; return }
  busy.value = 'wallet'
  try {
    const { user } = await api<{ user: { displayName: string; email: string; focus: string; walletAddress: string; role: 'creator' } }>('/api/auth/profile', { method: 'PATCH', body: { walletAddress: address } })
    emit('profileChanged', { name: user.displayName, email: user.email, focus: user.focus, walletAddress: user.walletAddress, role: user.role })
    notice.value = 'Payout wallet updated. New classes pay this wallet. Classes you already published keep paying the wallet they were published with.'
    editWallet.value = false; newWallet.value = ''
  } catch (cause: any) { error.value = cause.message }
  busy.value = ''
  await load()
}
async function connectNewWallet() {
  busy.value = 'wallet'
  const result = await connectFreighter()
  busy.value = ''
  if (!result.ok) { error.value = result.message; return }
  newWallet.value = result.address
}
async function copyAddress() {
  if (!data.value?.address) return
  try { await navigator.clipboard.writeText(data.value.address); notice.value = 'Address copied.' } catch { notice.value = data.value.address }
}

onMounted(load)
</script>

<template>
  <div class="cw">
    <header class="topnav glass studio-nav">
      <button type="button" class="brand brand-button" aria-label="LearnPurse home" @click="emit('home')"><BrandMark /><span>LearnPurse</span></button>
      <div class="nav-actions">
        <button type="button" class="btn btn-glass btn-nav" @click="emit('studio')"><StudioIcon name="arrowLeft" :size="16" /><span>Back to studio</span></button>
      </div>
    </header>

    <main class="cw-main">
      <div class="cw-heading">
        <p class="cw-eyebrow">YOUR MONEY · STELLAR TESTNET</p>
        <h1>Wallet & earnings</h1>
        <p>When a student or their AI agent pays for your class, LearnPurse keeps a {{ data?.feePercent ?? 5 }}% fee and sends the rest straight to this wallet in USDC.</p>
      </div>

      <p v-if="loading" class="cw-loading" role="status">Loading your wallet from Stellar…</p>
      <p v-if="error" class="cw-alert cw-error" role="alert"><StudioIcon name="alert" :size="16" />{{ error }}</p>
      <p v-if="notice" class="cw-alert cw-ok" role="status"><StudioIcon name="check" :size="16" />{{ notice }}</p>

      <template v-if="data">
        <section v-if="!data.address" class="cw-card cw-empty">
          <StudioIcon name="wallet" :size="28" />
          <h2>Add a payout wallet</h2>
          <p>You need a Stellar wallet to get paid. Connect Freighter or paste your public address (it starts with G).</p>
          <div class="cw-row"><button type="button" class="btn btn-dark btn-sm" :disabled="!!busy" @click="connectNewWallet">Connect Freighter</button></div>
          <div class="cw-row"><input v-model="newWallet" class="cw-input" placeholder="G…" aria-label="Wallet address"><button type="button" class="btn btn-glass btn-sm" :disabled="!!busy || !newWallet" @click="saveWallet(newWallet.trim())">Save wallet</button></div>
        </section>

        <template v-else>
          <section class="cw-hero">
            <div>
              <span class="cw-label">Available in your wallet</span>
              <strong class="cw-big">{{ data.balance?.usdc !== null && data.balance?.usdc !== undefined ? money(data.balance.usdc) : '0.00' }} <small>USDC</small></strong>
              <span class="cw-sub">{{ money(data.balance?.xlm) }} XLM for network fees</span>
            </div>
            <div class="cw-address">
              <span class="cw-label">Payout wallet</span>
              <a :href="accountLink(data.address)" target="_blank" rel="noopener" class="cw-mono">{{ shortAddress(data.address) }}<StudioIcon name="external" :size="13" /></a>
              <div class="cw-row">
                <button type="button" class="btn btn-light btn-sm" @click="copyAddress"><StudioIcon name="copy" :size="14" />Copy</button>
                <button type="button" class="btn btn-light btn-sm" :disabled="!data.balance?.trustline" @click="sendOpen = !sendOpen"><StudioIcon name="arrowUp" :size="14" />Send</button>
                <button type="button" class="btn btn-light btn-sm" @click="editWallet = !editWallet"><StudioIcon name="pen" :size="14" />Change</button>
              </div>
            </div>
          </section>

          <section v-if="setupNeeded" class="cw-card cw-setup">
            <StudioIcon name="alert" :size="20" />
            <div>
              <h2>{{ !data.balance?.funded ? 'Activate your wallet' : 'Enable USDC to receive payouts' }}</h2>
              <p v-if="!data.balance?.funded">This wallet doesn’t exist on Stellar Testnet yet. Fund it with free test XLM, then come back and enable USDC.</p>
              <p v-else>Stellar wallets must opt in to USDC before they can receive it. It takes one signature in Freighter.</p>
              <div class="cw-row">
                <a v-if="!data.balance?.funded" class="btn btn-dark btn-sm" :href="`https://friendbot.stellar.org/?addr=${data.address}`" target="_blank" rel="noopener">Get test XLM</a>
                <button v-if="!data.balance?.funded" type="button" class="btn btn-glass btn-sm" @click="load">I’ve funded it</button>
                <button v-else type="button" class="btn btn-dark btn-sm" :disabled="!!busy" @click="enableUsdc">{{ busy === 'trustline' ? 'Waiting for Freighter…' : 'Enable USDC' }}</button>
              </div>
            </div>
          </section>

          <section v-if="editWallet" class="cw-card">
            <h2>Change payout wallet</h2>
            <p class="cw-muted">New classes will pay this wallet. Classes already published keep their original wallet.</p>
            <div class="cw-row"><button type="button" class="btn btn-glass btn-sm" :disabled="!!busy" @click="connectNewWallet">Use Freighter</button></div>
            <div class="cw-row"><input v-model="newWallet" class="cw-input" placeholder="G…" aria-label="New wallet address"><button type="button" class="btn btn-dark btn-sm" :disabled="!!busy || !newWallet" @click="saveWallet(newWallet.trim())">Save</button><button type="button" class="btn btn-ghost btn-sm" @click="editWallet = false">Cancel</button></div>
          </section>

          <form v-if="sendOpen" class="cw-card cw-send" @submit.prevent="sendUsdc">
            <h2>Send USDC</h2>
            <p class="cw-muted">You sign this in Freighter. LearnPurse never sees your secret key.</p>
            <label>To<input v-model="send.to" class="cw-input" placeholder="G…" required></label>
            <label>Amount (USDC)<input v-model="send.amount" class="cw-input" inputmode="decimal" placeholder="0.00" required></label>
            <label>Note (optional)<input v-model="send.memo" class="cw-input" maxlength="28" placeholder="e.g. rent"></label>
            <div class="cw-row"><button type="submit" class="btn btn-dark btn-sm" :disabled="!!busy">{{ busy === 'send' ? 'Waiting for Freighter…' : 'Review in Freighter' }}</button><button type="button" class="btn btn-ghost btn-sm" @click="sendOpen = false">Cancel</button></div>
          </form>

          <section class="cw-stats" aria-label="Earnings summary">
            <div class="cw-stat"><span>Total sales</span><strong>{{ money(data.totals.gross) }} <small>USDC</small></strong><em>{{ data.totals.sales }} payment{{ data.totals.sales === 1 ? '' : 's' }}</em></div>
            <div class="cw-stat"><span>Your earnings</span><strong>{{ money(data.totals.earned) }} <small>USDC</small></strong><em>after {{ money(data.totals.fees) }} platform fee</em></div>
            <div class="cw-stat"><span>Received</span><strong>{{ money(data.totals.received) }} <small>USDC</small></strong><em>in your wallet</em></div>
            <div class="cw-stat" :class="{ 'cw-stat-warn': data.totals.pendingCount }">
              <span>On the way</span><strong>{{ money(data.totals.pending) }} <small>USDC</small></strong>
              <em v-if="!data.totals.pendingCount">nothing waiting</em>
              <button v-else type="button" class="cw-link" :disabled="!!busy" @click="retryPayouts">{{ busy === 'retry' ? 'Sending…' : `Send ${data.totals.pendingCount} now` }}</button>
            </div>
          </section>

          <p v-if="data.otherWallets.length" class="cw-muted cw-note"><StudioIcon name="help" :size="14" />Some of your classes pay a different wallet ({{ data.otherWallets.map(shortAddress).join(', ') }}). Their sales are counted here, but that money is in that wallet.</p>

          <section class="cw-card cw-table-card">
            <div class="cw-card-head"><h2>Sales & payouts</h2><button type="button" class="btn btn-glass btn-sm" @click="load"><StudioIcon name="arrowDown" :size="14" />Refresh</button></div>
            <p v-if="!data.sales.length" class="cw-muted cw-pad">No sales yet. Share your class link, and payments will show up here.</p>
            <div v-else class="cw-table-wrap">
              <table class="cw-table">
                <thead><tr><th>Class</th><th>Paid by</th><th>Price</th><th>Fee</th><th>You get</th><th>Status</th></tr></thead>
                <tbody>
                  <tr v-for="sale in data.sales" :key="sale.studentTx">
                    <td><strong>{{ sale.title }}</strong><small>{{ when(sale.at) }}</small></td>
                    <td><a :href="explorer(sale.studentTx)" target="_blank" rel="noopener" class="cw-mono">{{ sale.student }}</a></td>
                    <td>{{ money(sale.gross) }}</td>
                    <td>{{ money(sale.fee) }}</td>
                    <td><strong>{{ money(sale.net) }}</strong></td>
                    <td>
                      <a v-if="sale.status === 'paid'" class="cw-pill cw-pill-ok" :href="explorer(sale.payoutTx!)" target="_blank" rel="noopener"><StudioIcon name="check" :size="12" />Paid out</a>
                      <a v-else-if="sale.status === 'direct'" class="cw-pill cw-pill-ok" :href="explorer(sale.payoutTx!)" target="_blank" rel="noopener"><StudioIcon name="check" :size="12" />Paid direct</a>
                      <span v-else class="cw-pill cw-pill-wait"><StudioIcon name="clock" :size="12" />On the way</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="cw-card">
            <div class="cw-card-head"><h2>Wallet activity</h2></div>
            <p v-if="!data.activity.length" class="cw-muted cw-pad">No USDC movements yet.</p>
            <ul v-else class="cw-activity">
              <li v-for="item in data.activity" :key="item.hash + item.direction + item.amount">
                <span class="cw-dir" :class="item.direction"><StudioIcon :name="item.direction === 'in' ? 'arrowDown' : 'arrowUp'" :size="15" /></span>
                <div><strong>{{ item.direction === 'in' ? 'Received from' : 'Sent to' }} {{ who(item) }}</strong><small>{{ when(item.at) }}{{ item.memo ? ` · ${item.memo}` : '' }}</small></div>
                <a :href="explorer(item.hash)" target="_blank" rel="noopener" class="cw-amount" :class="item.direction">{{ item.direction === 'in' ? '+' : '−' }}{{ money(item.amount) }} USDC</a>
              </li>
            </ul>
          </section>
        </template>
      </template>
    </main>
  </div>
</template>

<style>
.cw { min-height: 100vh; }
.cw-main { max-width: 1080px; margin: 0 auto; padding: 28px 22px 60px; display: grid; gap: 18px; }
.cw-heading h1 { font-family: 'Outfit Variable', Outfit, sans-serif; font-size: clamp(30px, 4vw, 40px); font-weight: 600; letter-spacing: -1px; margin: 4px 0 8px; }
.cw-heading p { color: var(--muted); max-width: 640px; line-height: 1.6; margin: 0; }
.cw-eyebrow { font-size: 11px !important; letter-spacing: 1.6px; font-weight: 700; color: var(--accent) !important; }
.cw-loading { color: var(--muted); }
.cw-alert { display: flex; gap: 8px; align-items: center; padding: 12px 14px; border-radius: 12px; margin: 0; font-size: 14px; }
.cw-error { background: #fff0f2; color: #9b2343; }
.cw-ok { background: #edf8f1; color: #1d6b3f; }
.cw-hero { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding: 28px; border-radius: 22px; background: linear-gradient(135deg, #2f1730, #7b2a55); color: #fff; }
.cw-label { display: block; font-size: 12px; letter-spacing: .4px; opacity: .8; margin-bottom: 6px; }
.cw-big { display: block; font-family: 'Outfit Variable', Outfit, sans-serif; font-size: clamp(38px, 6vw, 54px); font-weight: 600; line-height: 1.05; }
.cw-big small { font-size: 18px; font-weight: 500; opacity: .8; }
.cw-sub { display: block; font-size: 13px; opacity: .75; margin-top: 6px; }
.cw-address { display: grid; gap: 8px; align-content: start; }
.cw-address .cw-mono { color: #fff; display: inline-flex; gap: 6px; align-items: center; font-size: 15px; }
.cw-mono { font-family: ui-monospace, Menlo, monospace; }
.cw-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.btn-light { background: rgba(255,255,255,.14); color: #fff; border: 1px solid rgba(255,255,255,.25); }
.btn-light:hover { background: rgba(255,255,255,.22); }
.btn-light:disabled { opacity: .5; }
.cw-card { background: #fff; border: 1px solid rgb(0 0 0 / .07); border-radius: 18px; padding: 22px; }
.cw-card h2 { font-family: 'Outfit Variable', Outfit, sans-serif; font-size: 19px; font-weight: 600; margin: 0 0 6px; }
.cw-card-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
.cw-muted { color: var(--muted); font-size: 14px; line-height: 1.6; margin: 0 0 12px; }
.cw-note { display: flex; gap: 6px; align-items: center; margin: 0; }
.cw-pad { padding: 10px 0; }
.cw-empty { text-align: center; display: grid; justify-items: center; gap: 10px; }
.cw-setup { display: flex; gap: 14px; background: #fff8ec; border-color: #f2dfb8; color: #6d4c12; }
.cw-setup p { margin: 0 0 12px; line-height: 1.6; }
.cw-input { flex: 1; min-width: 200px; padding: 11px 13px; border-radius: 12px; border: 1px solid rgb(0 0 0 / .12); font: inherit; font-size: 15px; background: #fff; }
.cw-send { display: grid; gap: 12px; }
.cw-send label { display: grid; gap: 6px; font-size: 14px; font-weight: 500; color: var(--muted); }
.cw-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.cw-stat { background: #fff; border: 1px solid rgb(0 0 0 / .07); border-radius: 16px; padding: 16px; display: grid; gap: 4px; }
.cw-stat span { font-size: 13px; color: var(--muted); }
.cw-stat strong { font-family: 'Outfit Variable', Outfit, sans-serif; font-size: 26px; font-weight: 600; }
.cw-stat strong small { font-size: 13px; color: var(--muted); font-weight: 500; }
.cw-stat em { font-style: normal; font-size: 12px; color: var(--muted); }
.cw-stat-warn { border-color: #f2dfb8; background: #fffaf0; }
.cw-link { background: none; border: 0; padding: 0; color: var(--accent); font-weight: 600; font-size: 13px; text-align: left; text-decoration: underline; cursor: pointer; }
.cw-table-wrap { overflow-x: auto; }
.cw-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.cw-table th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); padding: 10px 8px; border-bottom: 1px solid rgb(0 0 0 / .08); white-space: nowrap; }
.cw-table td { padding: 12px 8px; border-bottom: 1px solid rgb(0 0 0 / .05); vertical-align: middle; white-space: nowrap; }
.cw-table td:first-child { white-space: normal; min-width: 180px; }
.cw-table td small { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; }
.cw-table a { color: inherit; }
.cw-pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; text-decoration: none; }
.cw-pill-ok { background: #e7f6ec; color: #1d6b3f !important; }
.cw-pill-wait { background: #fff3dc; color: #8a5a00; }
.cw-activity { list-style: none; margin: 0; padding: 0; }
.cw-activity li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgb(0 0 0 / .05); }
.cw-activity li:last-child { border: 0; }
.cw-activity li > div { flex: 1; min-width: 0; }
.cw-activity strong { font-size: 14px; font-weight: 600; display: block; }
.cw-activity small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.cw-dir { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; }
.cw-dir.in { background: #e7f6ec; color: #1d6b3f; }
.cw-dir.out { background: #f4ecf3; color: #7b2a55; }
.cw-amount { font-weight: 650; font-size: 14px; white-space: nowrap; text-decoration: none; }
.cw-amount.in { color: #1d6b3f; }
.cw-amount.out { color: #7b2a55; }
@media (max-width: 760px) { .cw-stats { grid-template-columns: 1fr 1fr; } .cw-hero { padding: 22px; } }
</style>
