<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EnrolledClassroom from './EnrolledClassroom.vue'
import { emptySchedule } from '#shared/classroom'
import BrandMark from './BrandMark.vue'
import StudioIcon from './StudioIcon.vue'
import { enrolWithX402, reopenClass, savedAccess, type Classroom, type PayStage } from '../utils/x402-pay'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ home: [] }>()
const student = ref<{ id: string; role: string } | null>(null)
const course = ref<Record<string, any> | null>(null)
const missing = ref(false)
const schedule = ref(emptySchedule())
const classroom = ref<Classroom | null>(null)
const documentDownloading = ref(false)
const documentDownloadError = ref('')
async function downloadDocument() {
  if (!classroom.value) return
  documentDownloading.value = true
  documentDownloadError.value = ''
  try {
    const response = await fetch(`/api/courses/${props.id}/document`, { headers: { authorization: `Bearer ${classroom.value.accessToken}` } })
    if (!response.ok) throw new Error('The PDF could not be downloaded. Reopen your paid access and try again.')
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = course.value?.document?.name || 'document.pdf'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch (failure) { documentDownloadError.value = (failure as Error).message }
  finally { documentDownloading.value = false }
}
const stage = ref<PayStage>('idle')
const error = ref('')
const copied = ref(false)
const chatInput = ref('')
const chatBusy = ref(false)
const paymentConfirmed = ref(false)
const chatMessages = ref<{ role: 'student' | 'assistant'; text: string }[]>([])

const busy = computed(() => ['requesting', 'connecting', 'signing', 'settling'].includes(stage.value))
const full = computed(() => course.value?.seatsLeft === 0)
const cover = computed(() => course.value?.image?.startsWith('http') ? course.value.image : course.value?.image === 'creator-workspace' ? '/images/creator-workspace-1200.webp' : `/images/${course.value?.image ?? 'creator-home'}-960.webp`)
const accentStyle = computed(() => /^#[0-9a-f]{6}$/i.test(course.value?.accent ?? '') ? { '--accent': course.value!.accent, '--accent-ink': course.value!.accent } : undefined)
const steps = [
  { id: 'requesting', label: 'Class asks for payment', detail: 'HTTP 402 with the exact USDC amount' },
  { id: 'connecting', label: 'Connect your wallet', detail: 'Freighter on Stellar Testnet' },
  { id: 'signing', label: 'Approve in your wallet', detail: 'You sign one exact transfer' },
  { id: 'settling', label: 'Settled on Stellar', detail: 'Paid straight to the creator' },
] as const
const stageIndex = computed(() => stage.value === 'done' ? steps.length : steps.findIndex(step => step.id === stage.value))
const explorer = computed(() => classroom.value ? `https://stellar.expert/explorer/testnet/tx/${classroom.value.enrolment.transaction}` : '')
const accessLink = computed(() => classroom.value && typeof window !== 'undefined' ? `${window.location.origin}/class/${props.id}?access=${encodeURIComponent(classroom.value.accessToken)}` : '')
const paymentSummary = computed(() => course.value ? `${course.value.title} · ${course.value.priceAmount} USDC · Stellar Testnet` : '')

onMounted(async () => {
  fetch('/api/auth/me').then(response => response.ok ? response.json() : null).then(account => { student.value = account?.user ?? null }).catch(() => {})
  const response = await fetch(`/api/courses/${props.id}`)
  if (!response.ok) { missing.value = true; return }
  const loadedCourse = await response.json()
  course.value = loadedCourse
  fetch(`/api/courses/${props.id}/schedule`).then(response => response.ok ? response.json() : null).then(value => { if (value) schedule.value = value }).catch(() => {})
  chatMessages.value = [{ role: 'assistant', text: `I can answer questions about ${loadedCourse.title}, including what you’ll learn, who it is for, the duration, available places and payment.` }]
  const token = new URLSearchParams(window.location.search).get('access') || savedAccess(props.id)
  if (token) classroom.value = await reopenClass(props.id, token)
})

async function enrol() {
  error.value = ''
  try {
    classroom.value = await enrolWithX402(props.id, next => { stage.value = next })
    course.value = classroom.value.course
    chatMessages.value.push({ role: 'assistant', text: `Payment verified on Stellar. You’re enrolled in ${course.value.title}, and the lessons are now unlocked.` })
  } catch (failure) { error.value = (failure as Error).message }
}
const suggestions = ['What will I learn?', 'Is this for beginners?', 'Do I need an account?', 'I don’t have a wallet. What do I do?']
function askSuggestion(text: string) { chatInput.value = text; void askAssistant() }
async function askAssistant() {
  const message = chatInput.value.trim()
  if (!message || chatBusy.value) return
  chatInput.value = ''
  const history = chatMessages.value.slice(1).map(entry => ({ role: entry.role === 'student' ? 'user' : 'assistant', content: entry.text }))
  chatMessages.value.push({ role: 'student', text: message })
  chatBusy.value = true
  try {
    const response = await fetch(`/api/courses/${props.id}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, history }) })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.statusMessage ?? 'The assistant could not answer that.')
    chatMessages.value.push({ role: 'assistant', text: body.answer })
  } catch (failure) { chatMessages.value.push({ role: 'assistant', text: (failure as Error).message }) }
  finally { chatBusy.value = false }
}
function confirmPayment() {
  paymentConfirmed.value = true
  chatMessages.value.push({ role: 'student', text: 'I understand the payment details. Continue to payment.' })
  chatMessages.value.push({ role: 'assistant', text: 'The exact payment request is ready. Review the summary, then approve the transaction in Freighter.' })
}
function startAnotherPayment() {
  if (course.value?.paymentPolicy?.mode === 'single') return
  classroom.value = null
  paymentConfirmed.value = false
  stage.value = 'idle'
  error.value = ''
  chatMessages.value.push({ role: 'assistant', text: course.value?.paymentPolicy?.mode === 'installments' ? 'You can make the next installment now. Review the exact amount, then approve it in Freighter.' : 'You can make another payment for this class. Review the exact amount, then approve it in Freighter.' })
}
async function share() {
  try { await navigator.clipboard.writeText(location.href); copied.value = true; setTimeout(() => { copied.value = false }, 2000) } catch { /* Clipboard blocked. The URL is visible in the address bar. */ }
}
async function copyAccessLink() {
  if (!accessLink.value) return
  try { await navigator.clipboard.writeText(accessLink.value); copied.value = true; setTimeout(() => { copied.value = false }, 2000) } catch { /* The link remains available in the address bar. */ }
}
</script>

<template>
  <div class="class-page" :style="accentStyle">
    <header class="site-header class-header">
      <button type="button" class="brand brand-button" aria-label="LearnPurse home" @click="emit('home')"><BrandMark /><span>LearnPurse</span></button>
      <a v-if="student" class="btn btn-glass btn-nav" href="/library"><StudioIcon name="book" :size="16" />My classes</a>
      <button type="button" class="btn btn-glass btn-nav" @click="share"><StudioIcon :name="copied ? 'check' : 'copy'" :size="16" />{{ copied ? 'Link copied' : 'Share class' }}</button>
    </header>

    <main v-if="missing" class="class-missing"><h1>This class isn’t available.</h1><p>The link may be wrong, or the class was removed.</p><button type="button" class="btn btn-dark" @click="emit('home')">Go to LearnPurse</button></main>
    <main v-else-if="!course" class="class-missing" aria-busy="true"><p>Loading class…</p></main>

    <main v-else class="class-layout">
      <section class="class-hero">
        <figure class="class-cover"><img :src="cover" alt="" width="960" height="640"></figure>
        <p class="class-by">{{ course.productType === 'pdf' ? 'A PDF by' : course.productType === 'bundle' ? 'A class + PDF bundle by' : 'A class by' }} {{ course.creatorName }}</p>
        <h1 id="class-title">{{ course.title }}</h1>
        <p v-if="course.tagline" class="class-tagline">{{ course.tagline }}</p>
        <p class="class-lead">{{ course.description }}</p>
        <p v-if="course.document" class="class-schedule-summary"><strong>PDF included:</strong> {{ course.document.name }} ({{ Math.max(1, Math.ceil(course.document.size / 1024)) }} KB). Your private download unlocks after payment.</p>
        <ul class="class-facts">
          <li><StudioIcon name="clock" :size="18" />{{ course.duration }}</li>
          <li><StudioIcon name="layers" :size="18" />{{ course.modules.length }} lessons</li>
          <li><StudioIcon name="users" :size="18" />{{ course.seatsLeft === null ? 'Open enrolment' : `${course.seatsLeft} of ${course.capacity} places left` }}</li>
        </ul>
        <EnrolledClassroom v-if="classroom && course.productType !== 'pdf'" :id="id" :token="classroom.accessToken" />
        <p v-else-if="course.productType !== 'pdf'" class="class-schedule-summary"><strong>{{ schedule.mode === 'live' ? 'Live class' : 'Self-paced class' }}</strong> · {{ schedule.mode === 'live' && schedule.startsAt ? new Date(schedule.startsAt).toLocaleString() + ' (your local time)' : 'Start after payment' }}. {{ schedule.mode === 'live' ? 'Payment unlocks joining instructions, the meeting link and teacher messages.' : 'Payment unlocks lessons and private teacher messages.' }}</p>
        <h2 class="class-subhead">What you’ll learn</h2>
        <ol class="class-lessons">
          <li v-for="(module, index) in (classroom?.modules ?? course.modules)" :key="index">
            <span>{{ Number(index) + 1 }}</span>
            <div><strong>{{ module.title }}</strong><p v-if="classroom">{{ (module as any).description }}</p></div>
            <StudioIcon v-if="!classroom" name="lock" :size="16" />
          </li>
        </ol>
      </section>

      <aside class="enrol-card glass" aria-labelledby="enrol-title">
        <template v-if="classroom">
          <section v-if="course.document" class="glass-inset" aria-label="Your PDF download">
            <h2>Your private PDF</h2>
            <p>{{ course.document.name }}</p>
            <button type="button" class="btn btn-dark btn-block" :disabled="documentDownloading" @click="downloadDocument">{{ documentDownloading ? 'Downloading…' : 'Download PDF' }}</button>
            <p v-if="documentDownloadError" class="field-error" role="alert">{{ documentDownloadError }}</p>
          </section>
          <span class="enrol-badge"><StudioIcon name="check" :size="18" />You’re enrolled</span>
          <h2 id="enrol-title">{{ course.productType === 'pdf' ? 'Your PDF is ready.' : 'Welcome to the class.' }}</h2>
          <p>Payment settled on Stellar and your access was granted automatically. All lessons are now unlocked.</p>
          <dl class="enrol-receipt">
            <div><dt>Paid</dt><dd>{{ course.priceAmount }} USDC</dd></div>
            <div><dt>From</dt><dd>{{ classroom.enrolment.student.slice(0, 6) }}…{{ classroom.enrolment.student.slice(-4) }}</dd></div>
            <div><dt>Network</dt><dd>Stellar Testnet</dd></div>
          </dl>
          <a class="btn btn-glass btn-block" :href="explorer" target="_blank" rel="noopener">View transaction<StudioIcon name="external" :size="16" /></a>
          <button type="button" class="btn btn-dark btn-block" @click="copyAccessLink"><StudioIcon name="copy" :size="16" />{{ copied ? 'Access link copied' : 'Copy paid access link' }}</button>
          <button v-if="course.paymentPolicy?.mode !== 'single'" type="button" class="btn btn-glass btn-block" @click="startAnotherPayment">{{ course.paymentPolicy?.mode === 'installments' ? 'Pay next installment' : 'Make another payment' }}</button>
        </template>
        <template v-else>
          <section class="student-assistant" aria-labelledby="assistant-title">
            <div class="assistant-title"><span class="agent-icon"><StudioIcon name="sparkles" :size="17" /></span><div><h2 id="assistant-title">Ask about this class</h2><p>Answers come from the published course only.</p></div></div>
            <div class="assistant-messages" aria-live="polite">
              <p v-for="(message, index) in chatMessages" :key="index" class="assistant-message" :class="message.role"><strong>{{ message.role === 'student' ? 'You' : 'LearnPurse AI' }}</strong>{{ message.text }}</p>
            </div>
            <p v-if="chatBusy" class="assistant-message assistant"><strong>LearnPurse AI</strong>Thinking…</p>
            <div v-if="chatMessages.length < 3 && !paymentConfirmed" class="agent-prompts"><button v-for="text in suggestions" :key="text" type="button" class="btn btn-glass btn-sm" :disabled="chatBusy" @click="askSuggestion(text)">{{ text }}</button></div>
            <form class="assistant-form" @submit.prevent="askAssistant"><input v-model="chatInput" aria-label="Ask about this class" maxlength="500" placeholder="What will I learn?" :disabled="chatBusy || paymentConfirmed"><button type="submit" class="icon-btn" aria-label="Ask assistant" :disabled="chatBusy || !chatInput.trim()"><StudioIcon name="arrowRight" :size="17" /></button></form>
          </section>
          <section class="payment-panel" aria-labelledby="payment-summary-title">
            <p class="payment-kicker">{{ paymentConfirmed ? 'Payment confirmed by you' : 'Before you pay' }}</p>
            <h2 id="payment-summary-title">{{ paymentConfirmed ? 'Ready for your wallet.' : 'Understand the payment.' }}</h2>
            <p class="enrol-note">{{ paymentConfirmed ? 'Freighter will show the exact transaction. LearnPurse cannot approve it for you.' : 'LearnPurse will show the exact request before Freighter opens.' }}</p>
            <dl class="payment-summary"><div><dt>Course</dt><dd>{{ course.title }}</dd></div><div><dt>Amount</dt><dd>{{ course.priceAmount }} USDC</dd></div><div><dt>Network</dt><dd>Stellar Testnet</dd></div><div><dt>Creator wallet</dt><dd>{{ course.payTo }}</dd></div></dl>
            <button v-if="!paymentConfirmed" type="button" class="btn btn-dark btn-block" :disabled="full" @click="confirmPayment">Continue to payment<StudioIcon name="arrowRight" :size="17" /></button>
          </section>
          <p class="enrol-price"><strong>{{ course.priceAmount }}</strong> USDC</p>
          <h2 id="enrol-title" class="sr-only">Enrol</h2>
          <p class="enrol-note">One payment. Paid directly to {{ course.creatorName }}’s Stellar wallet.</p>
          <button type="button" class="btn btn-dark btn-lg btn-block" :disabled="!paymentConfirmed || busy || full" @click="enrol">{{ full ? 'Class is full' : busy ? 'Waiting for wallet…' : 'Approve in Freighter' }}</button>
          <ol class="pay-steps agent-timeline" aria-label="Payment activity">
            <li v-for="(step, index) in steps" :key="step.id" :class="{ active: stageIndex === index && busy, done: stageIndex > index }">
              <span class="pay-dot"><StudioIcon v-if="stageIndex > index" name="check" :size="13" /></span>
              <div><strong>{{ step.label }}</strong><span>{{ step.detail }}</span></div>
            </li>
          </ol>
          <p v-if="error" class="field-error" role="alert"><StudioIcon name="alert" :size="15" />{{ error }}</p>
          <p class="enrol-fine"><StudioIcon name="shield" :size="15" />Powered by x402 on Stellar Testnet. Needs Freighter and Testnet USDC.</p>
        </template>
      </aside>
    </main>
  </div>
</template>
