<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BrandMark from './BrandMark.vue'
import StudioIcon from './StudioIcon.vue'
import MarkdownText from './MarkdownText.vue'

// Learning agent: an AI that buys classes for a learner over x402 on Stellar Testnet,
// inside rules the owner sets. /agent (setup) or /agent/:id#key=... (console).
const props = defineProps<{ id: string }>()
const emit = defineEmits<{ home: [] }>()
const KEY_STORE = 'learnpurse.learning-agents'

type Policy = { perClassMax: number; totalBudget: number; approvalAbove: number; maxPerRun: number; autoApprove?: boolean }
type AgentEvent = { id?: number; kind: string; message: string; data?: Record<string, any>; amount?: number | null; courseId?: string | null; createdAt?: string }
type State = { agent: { id: string; name: string; learner: string; goal: string; publicKey: string; purseId?: string | null; policy: Policy }; balance: { usdc: string; xlm: string; ready: boolean; purse?: number; wallet?: number }; purse?: { spent: number; balance: number; paused: boolean; limits: Policy } | null; spent: number; pending: AgentEvent[]; library: { courseId: string; title: string; amount: number; transaction: string; url: string }[]; events: AgentEvent[] }

const form = ref({ name: '', learner: '', goal: '', policy: { perClassMax: 5, totalBudget: 10, approvalAbove: 3, maxPerRun: 2, autoApprove: false } as Policy })
const ownerKey = ref('')
const state = ref<State | null>(null)
const busy = ref<'' | 'creating' | 'running' | 'deciding' | 'saving'>('')
const error = ref('')
const missing = ref(false)
const goalDraft = ref('')
const editingRules = ref(false)
const rulesDraft = ref<Policy>({ ...form.value.policy })
const copied = ref(false)

const examples = [
  { name: 'Ada’s learning agent', learner: 'Ada, 9, growing up in London with Nigerian parents', goal: 'Ada wants to speak Yoruba with her grandma.' },
  { name: 'My growth agent', learner: 'A woman artisan who makes beadwork', goal: 'I want to learn to sell my crafts online and get paid in stablecoins.' },
]
const timeline = computed(() => [...(state.value?.events ?? [])].reverse())
const remaining = computed(() => state.value ? Math.max(state.value.agent.policy.totalBudget - state.value.spent, 0) : 0)
const usedPercent = computed(() => state.value?.agent.policy.totalBudget ? Math.min(100, (state.value.spent / state.value.agent.policy.totalBudget) * 100) : 0)
const icon = (kind: string) => ({ created: 'wallet', funded: 'coins', thinking: 'idea', note: 'sparkles', pick: 'eye', paid: 'check', blocked: 'shield', approval_needed: 'help', approved: 'check', declined: 'close', failed: 'alert', skip: 'arrowRight', requested: 'mail', resources: 'book', fulfilled: 'graduation', purse: 'lock', released: 'coins' } as Record<string, any>)[kind] ?? 'sparkles'
const label = (kind: string) => ({ created: 'Wallet created', funded: 'Funded', thinking: 'Thinking', note: 'Reasoning', pick: 'Shortlisted', paid: 'Paid via x402', blocked: 'Stopped by a rule', approval_needed: 'Needs your OK', approved: 'You approved', declined: 'You declined', failed: 'Payment failed', skip: 'Nothing to buy', requested: 'Asked creators for a class', resources: 'Free resources', fulfilled: 'A creator answered', purse: 'Soroban purse', released: 'Released on-chain' } as Record<string, string>)[kind] ?? kind
const contractLink = (id?: string | null) => id ? `https://stellar.expert/explorer/testnet/contract/${id}` : ''
const tx = (hash?: string) => hash ? `https://stellar.expert/explorer/testnet/tx/${hash}` : ''
const short = (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`

function savedKeys(): Record<string, string> { try { return JSON.parse(localStorage.getItem(KEY_STORE) || '{}') } catch { return {} } }
function rememberKey(id: string, key: string) { try { localStorage.setItem(KEY_STORE, JSON.stringify({ ...savedKeys(), [id]: key })) } catch {} }

async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, { method: options.method ?? 'GET', headers: { 'content-type': 'application/json', ...(ownerKey.value ? { 'x-agent-key': ownerKey.value } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.statusMessage || body?.message || `Request failed (${response.status})`)
  return body as T
}
let linkTried = false
async function refresh() {
  try { state.value = await api<State>(`/api/learning-agents/${props.id}`); goalDraft.value ||= state.value.agent.goal; rulesDraft.value = { ...state.value.agent.policy } }
  catch { missing.value = true; return }
  // Signed in as a learner? Link this agent to the account so its classes show in the dashboard.
  if (!linkTried) { linkTried = true; void fetch(`/api/learning-agents/${props.id}/link`, { method: 'POST', credentials: 'include', headers: { 'x-agent-key': ownerKey.value } }).catch(() => {}) }
}

async function create() {
  error.value = ''
  if (!form.value.goal.trim()) { error.value = 'Tell the agent what to learn.'; return }
  busy.value = 'creating'
  try {
    const created = await api<{ agent: { id: string }; ownerKey: string }>('/api/learning-agents', { method: 'POST', body: form.value })
    rememberKey(created.agent.id, created.ownerKey)
    window.location.assign(`/agent/${created.agent.id}#key=${created.ownerKey}`)
  } catch (cause: any) { error.value = cause.message; busy.value = '' }
}
async function run() {
  error.value = ''; busy.value = 'running'
  try {
    if (goalDraft.value.trim() && goalDraft.value.trim() !== state.value?.agent.goal) await api(`/api/learning-agents/${props.id}`, { method: 'PATCH', body: { goal: goalDraft.value } })
    await api(`/api/learning-agents/${props.id}/run`, { method: 'POST' })
  } catch (cause: any) { error.value = cause.message }
  await refresh(); busy.value = ''
}
async function decide(courseId: string, approve: boolean, always = false) {
  error.value = ''; busy.value = 'deciding'
  try { await api(`/api/learning-agents/${props.id}/decide`, { method: 'POST', body: { courseId, approve, always } }) } catch (cause: any) { error.value = cause.message }
  await refresh(); busy.value = ''
}
async function saveRules() {
  error.value = ''; busy.value = 'saving'
  try { await api(`/api/learning-agents/${props.id}`, { method: 'PATCH', body: { policy: rulesDraft.value } }); editingRules.value = false } catch (cause: any) { error.value = cause.message }
  await refresh(); busy.value = ''
}
async function copyLink() {
  try { await navigator.clipboard.writeText(`${window.location.origin}/agent/${props.id}#key=${ownerKey.value}`); copied.value = true; setTimeout(() => { copied.value = false }, 2000) } catch {}
}

onMounted(async () => {
  if (!props.id) return
  // While a class request is open, check now and then whether a creator answered and the agent bought it.
  setInterval(() => { if (state.value && !busy.value && document.visibilityState === 'visible' && state.value.events.some(event => event.kind === 'requested')) void refresh() }, 10000)
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('key')
  ownerKey.value = fromHash || savedKeys()[props.id] || ''
  if (fromHash) rememberKey(props.id, fromHash)
  if (!ownerKey.value) { missing.value = true; return }
  await refresh()
})
</script>

<template>
  <div class="class-page learning-agent">
    <header class="site-header class-header">
      <button type="button" class="brand brand-button" aria-label="LearnPurse home" @click="emit('home')"><BrandMark /><span>LearnPurse</span></button>
      <button v-if="state" type="button" class="btn btn-glass btn-nav" @click="copyLink"><StudioIcon :name="copied ? 'check' : 'copy'" :size="16" />{{ copied ? 'Owner link copied' : 'Copy owner link' }}</button>
    </header>

    <!-- Setup -->
    <main v-if="!id" class="la-setup">
      <section class="la-intro">
        <p class="class-by">Learning agent · Stellar Testnet</p>
        <h1>An agent that pays for learning, inside your rules.</h1>
        <p class="class-lead">Tell it who is learning and what they need. It gets its own wallet, compares the classes on LearnPurse, and pays creators by itself over x402. You set the limits. Code enforces them, not the AI.</p>
        <ul class="la-layers">
          <li><StudioIcon name="shield" :size="18" /><div><strong>Rules locked in a Soroban contract</strong><span>Per-class limit, total budget, each class once, your signature above the ask-first amount. Enforced on Stellar, not by us.</span></div></li>
          <li><StudioIcon name="lock" :size="18" /><div><strong>Exact x402 offers only</strong><span>It signs only the listed price, to the listed creator, on Testnet.</span></div></li>
          <li><StudioIcon name="wallet" :size="18" /><div><strong>The agent holds nothing</strong><span>The budget sits in the purse. The agent gets one class price at a time.</span></div></li>
        </ul>
      </section>
      <form class="enrol-card glass la-form" @submit.prevent="create">
        <h2>Set up the agent</h2>
        <div class="agent-prompts"><button v-for="example in examples" :key="example.name" type="button" class="btn btn-glass btn-sm" @click="Object.assign(form, example)">{{ example.goal.split(' ').slice(0, 5).join(' ') }}…</button></div>
        <label>Name<input v-model="form.name" maxlength="60" placeholder="Ada’s learning agent"></label>
        <label>Who is learning?<input v-model="form.learner" maxlength="200" placeholder="Ada, 9, lives in London"></label>
        <label>What should they learn?<textarea v-model="form.goal" rows="3" maxlength="600" placeholder="Speak Yoruba with her grandma" /></label>
        <fieldset class="la-rules">
          <legend>Spending rules (USDC)</legend>
          <label>Per class, at most<input v-model.number="form.policy.perClassMax" type="number" min="0" step="0.5"></label>
          <label>Total budget<input v-model.number="form.policy.totalBudget" type="number" min="0" step="1"></label>
          <label>Ask me first above<input v-model.number="form.policy.approvalAbove" type="number" min="0" step="0.5"></label>
          <label>Classes per run<input v-model.number="form.policy.maxPerRun" type="number" min="1" max="5"></label>
          <label class="la-check"><input v-model="form.policy.autoApprove" type="checkbox"> Don’t ask me. Pay automatically within this budget</label>
        </fieldset>
        <div class="la-wallet">
          <strong>Approve here. The agent handles payment.</strong>
          <p>A dedicated Testnet wallet signs payments automatically within your spending rules. Above your ask-first limit, click Approve in this app. No Freighter confirmation or personal wallet secret is needed.</p>
          <small>The server stores encrypted signing keys, including the approval co-signing key. Keep your agent owner link private: it authorizes approvals.</small>
        </div>
        <button type="submit" class="btn btn-dark btn-lg btn-block" :disabled="!!busy">{{ busy ? 'Deploying purse contract on Stellar…' : 'Create agent' }}<StudioIcon v-if="!busy" name="arrowRight" :size="18" /></button>
        <p v-if="busy === 'creating'" class="enrol-note">Creating wallets, deploying the Soroban purse with your rules and funding it. About 30 seconds.</p>
        <p v-if="error" class="field-error" role="alert"><StudioIcon name="alert" :size="15" />{{ error }}</p>
        <p class="enrol-fine"><StudioIcon name="shield" :size="15" />Testnet only. The wallet is funded with free Testnet XLM, swapped for Testnet USDC.</p>
      </form>
    </main>

    <main v-else-if="missing" class="class-missing"><h1>Agent not found.</h1><p>Open it with the owner link you saved when you created it.</p><a class="btn btn-dark" href="/agent">Create a learning agent</a></main>
    <main v-else-if="!state" class="class-missing" aria-busy="true"><p>Loading agent…</p></main>

    <!-- Console -->
    <main v-else class="la-console">
      <section class="la-main">
        <p class="class-by">{{ state.agent.learner || 'Learning agent' }}</p>
        <h1>{{ state.agent.name }}</h1>
        <form class="la-goal" @submit.prevent="run">
          <label for="la-goal">Goal</label>
          <textarea id="la-goal" v-model="goalDraft" rows="2" maxlength="600" />
          <button type="submit" class="btn btn-dark btn-lg" :disabled="!!busy">{{ busy === 'running' ? 'Agent is working…' : 'Let the agent shop' }}<StudioIcon v-if="busy !== 'running'" name="sparkles" :size="18" /></button>
        </form>
        <p v-if="error" class="field-error" role="alert"><StudioIcon name="alert" :size="15" />{{ error }}</p>

        <section v-for="item in state.pending" :key="item.courseId!" class="la-approval glass" aria-live="polite">
          <StudioIcon name="help" :size="20" />
          <div><strong>Buy “{{ item.data?.title }}” for {{ item.amount }} USDC?</strong><p>{{ item.data?.reason }}</p></div>
          <div class="la-approval-actions"><button type="button" class="btn btn-glass btn-sm" :disabled="!!busy" @click="decide(item.courseId!, false)">Decline</button><button type="button" class="btn btn-glass btn-sm" :disabled="!!busy" @click="decide(item.courseId!, true)">Approve this one</button><button type="button" class="btn btn-dark btn-sm" :disabled="!!busy" :title="`Pay this and future classes without asking, up to ${state.agent.policy.perClassMax} USDC each and ${state.agent.policy.totalBudget} USDC in total`" @click="decide(item.courseId!, true, true)">Approve &amp; don’t ask again</button></div>
        </section>

        <h2 class="class-subhead">Agent & x402 log</h2>
        <p v-if="busy === 'running'" class="la-working"><span class="agent-dots" aria-hidden="true"><i /><i /><i /></span>Comparing classes and checking your rules…</p>
        <ol class="la-log" aria-live="polite">
          <li v-for="(event, index) in timeline" :key="event.id ?? index" :class="`la-${event.kind}`">
            <span class="la-icon"><StudioIcon :name="icon(event.kind)" :size="15" /></span>
            <div>
              <strong>{{ label(event.kind) }}<em v-if="event.data?.via"> · {{ event.data.via === 'ai' ? 'AI decided' : 'keyword fallback' }}</em></strong>
              <MarkdownText :text="event.message" />
              <a v-if="event.data?.transaction" :href="tx(event.data.transaction)" target="_blank" rel="noopener">View on Stellar Expert<StudioIcon name="external" :size="13" /></a>
              <a v-if="event.data?.contractId" :href="contractLink(event.data.contractId)" target="_blank" rel="noopener">Open the contract<StudioIcon name="external" :size="13" /></a>
              <div v-if="event.data?.resources?.length" class="la-resource-list">
                <a v-for="resource in event.data.resources" :key="resource.url" :href="resource.url" target="_blank" rel="noopener">{{ resource.title }}<small>{{ resource.source === 'apify' ? 'web search' : resource.provider }}{{ resource.ages ? ` · ages ${resource.ages}` : '' }}</small><StudioIcon name="external" :size="13" /></a>
              </div>
              <p v-if="event.kind === 'requested' && event.data?.brief" class="la-brief">“{{ event.data.brief }}”</p>
            </div>
            <time v-if="event.createdAt">{{ new Date(event.createdAt.endsWith('Z') ? event.createdAt : event.createdAt + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</time>
          </li>
        </ol>
      </section>

      <aside class="enrol-card glass la-side">
        <h2>Wallet</h2>
        <dl class="enrol-receipt">
          <div><dt>{{ state.purse ? 'In the purse' : 'Balance' }}</dt><dd>{{ (state.purse ? state.purse.balance : Number(state.balance.usdc)).toFixed(2) }} USDC</dd></div>
          <div v-if="state.purse"><dt>Agent wallet</dt><dd>{{ Number(state.balance.wallet ?? 0).toFixed(2) }} USDC</dd></div>
          <div><dt>Agent</dt><dd><a :href="`https://stellar.expert/explorer/testnet/account/${state.agent.publicKey}`" target="_blank" rel="noopener">{{ short(state.agent.publicKey) }}</a></dd></div>
          <div v-if="state.agent.purseId"><dt>Purse contract</dt><dd><a :href="contractLink(state.agent.purseId)" target="_blank" rel="noopener">{{ short(state.agent.purseId) }}</a></dd></div>
          <div><dt>Network</dt><dd>Stellar Testnet</dd></div>
        </dl>
        <p v-if="state.purse" class="la-onchain"><StudioIcon name="shield" :size="14" />On-chain: {{ state.purse.spent.toFixed(2) }} of {{ state.purse.limits.totalBudget }} USDC released{{ state.purse.paused ? ' · paused' : '' }}</p>
        <div class="la-budget"><div class="la-budget-bar"><span :style="{ width: `${usedPercent}%` }" /></div><p>{{ state.spent.toFixed(2) }} of {{ state.agent.policy.totalBudget }} USDC spent · {{ remaining.toFixed(2) }} left</p></div>

        <h2>Rules</h2>
        <dl v-if="!editingRules" class="enrol-receipt">
          <div><dt>Per class</dt><dd>≤ {{ state.agent.policy.perClassMax }} USDC</dd></div>
          <div><dt>Total budget</dt><dd>{{ state.agent.policy.totalBudget }} USDC</dd></div>
          <div><dt>Ask first above</dt><dd>{{ state.agent.policy.autoApprove ? 'Never (auto-pay within budget)' : `${state.agent.policy.approvalAbove} USDC` }}</dd></div>
          <div><dt>Per run</dt><dd>{{ state.agent.policy.maxPerRun }} class{{ state.agent.policy.maxPerRun === 1 ? '' : 'es' }}</dd></div>
        </dl>
        <form v-else class="la-rules" @submit.prevent="saveRules">
          <label>Per class<input v-model.number="rulesDraft.perClassMax" type="number" min="0" step="0.5"></label>
          <label>Total budget<input v-model.number="rulesDraft.totalBudget" type="number" min="0" step="1"></label>
          <label>Ask first above<input v-model.number="rulesDraft.approvalAbove" type="number" min="0" step="0.5"></label>
          <label>Per run<input v-model.number="rulesDraft.maxPerRun" type="number" min="1" max="5"></label>
          <label class="la-check"><input v-model="rulesDraft.autoApprove" type="checkbox"> Don’t ask me. Pay automatically within budget</label>
          <button type="submit" class="btn btn-dark btn-sm" :disabled="!!busy">Save rules</button>
        </form>
        <button v-if="!editingRules" type="button" class="btn btn-glass btn-sm" @click="editingRules = true"><StudioIcon name="pen" :size="14" />Change rules</button>

        <h2>Library</h2>
        <p v-if="!state.library.length" class="enrol-note">Nothing bought yet.</p>
        <ul class="la-library">
          <li v-for="item in state.library" :key="item.courseId"><a :href="item.url">{{ item.title }}</a><span>{{ item.amount }} USDC · <a :href="tx(item.transaction)" target="_blank" rel="noopener">tx</a></span></li>
        </ul>
      </aside>
    </main>
  </div>
</template>
