<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CreatorProfile } from '#shared/profile'
import BrandMark from './BrandMark.vue'
import StudioIcon, { type IconName } from './StudioIcon.vue'
import '../assets/css/student.css'

type Section = 'overview' | 'chat' | 'classes' | 'analytics' | 'notifications' | 'payments' | 'settings'
type Course = { id: string; title: string; duration: string; modules: { title?: string }[]; url: string; completedModules?: number[]; schedule?: { mode: string; startsAt: string; timezone: string; meetingUrl: string; instructions: string } | null }
type Analytics = { enrolledClasses: number; completedModules: number; totalModules: number; completionPercent: number; studyDays: number; weeklyActivity: { date: string; count: number }[]; totalSpent: number }
type Notification = { id: string; title: string; message: string; url: string; createdAt: string; read: boolean }
type Learning = { courses: Course[]; analytics: Analytics; notifications: Notification[]; unreadCount: number; warnings?: string[] }
type Payment = { courseId: string; title: string; amount: number; transaction: string; enrolledAt: string }
type Recommendation = { id: string; title: string; price: string | number; url: string }
type Message = { id: string; role: 'user' | 'assistant'; content: string; courses?: Recommendation[]; createdAt: string }
const props = defineProps<{ profile: CreatorProfile | null; initialSection?: string }>()
const emit = defineEmits<{ home: []; signOut: [] }>()
const navigation: { id: Section; label: string; icon: IconName; href: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'layers', href: '/student' },
  { id: 'chat', label: 'Learning assistant', icon: 'sparkles', href: '/student/chat' },
  { id: 'classes', label: 'My classes', icon: 'book', href: '/student/classes' },
  { id: 'analytics', label: 'Learning analytics', icon: 'layers', href: '/student/analytics' },
  { id: 'notifications', label: 'Notifications', icon: 'mail', href: '/student/notifications' },
  { id: 'payments', label: 'Payments & receipts', icon: 'wallet', href: '/student/payments' },
  { id: 'settings', label: 'Account settings', icon: 'user', href: '/student/settings' },
]
const normalize = (value?: string): Section => navigation.find(item => item.id === value || item.href === value)?.id ?? 'overview'
const section = ref<Section>(normalize(props.initialSection))
const fallbackCourses = ref<Course[]>([])
const learning = ref<Learning | null>(null)
const courses = computed(() => learning.value?.courses ?? fallbackCourses.value)
const learningError = ref('')
const paymentError = ref('')
const actionError = ref('')
const actionBusy = ref(false)
const historyLoaded = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
const clearConfirm = ref(false)
const clearing = ref(false)
const retryMessage = ref<{ text: string; requestId: string } | null>(null)
const payments = ref<Payment[]>([])
const busy = ref(false)
const error = ref('')
const messages = ref<Message[]>([])
const draft = ref('')
const sending = ref(false)
const chatError = ref('')
const chatLog = ref<HTMLElement | null>(null)
const firstName = computed(() => props.profile?.name?.split(' ')[0] || 'learner')
const currentTitle = computed(() => navigation.find(item => item.id === section.value)?.label)
const totalPaid = computed(() => learning.value?.analytics.totalSpent ?? payments.value.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
const weeklyMaximum = computed(() => Math.max(1, ...(learning.value?.analytics.weeklyActivity.map(day => day.count) ?? [])))
watch(() => props.initialSection, value => { section.value = normalize(value) })
function navigate(event: MouseEvent, target: Section) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  section.value = target
  window.history.pushState({}, '', navigation.find(item => item.id === target)!.href)
}
function popstate() { section.value = normalize(window.location.pathname.replace(/\/$/, '')) }
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.statusMessage || body?.message || 'Something went wrong. Please try again.')
  return body as T
}
async function loadLearning() {
  learningError.value = ''
  try { learning.value = await request<Learning>('/api/student/learning') }
  catch (cause) { learningError.value = cause instanceof Error ? cause.message : 'Learning data could not be loaded.'; throw cause }
}
async function load() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  paymentError.value = ''
  const results = await Promise.allSettled([
    request<{ courses: Course[] }>('/api/courses/mine'),
    request<{ history: Payment[] }>('/api/payments'),
    loadLearning(),
  ])
  if (results[0].status === 'fulfilled') fallbackCourses.value = results[0].value.courses ?? []
  if (results[1].status === 'fulfilled') payments.value = results[1].value.history ?? []
  else paymentError.value = 'Payment history could not be loaded. Please retry.'
  if (results[0].status === 'rejected' && results[2].status === 'rejected') error.value = 'Your class library could not be loaded. Please retry.'
  busy.value = false
}
async function loadHistory() {
  if (historyLoading.value) return
  historyLoading.value = true
  historyLoaded.value = false
  historyError.value = ''
  try {
    const result = await request<{ messages: Message[] }>('/api/student/chat')
    messages.value = result.messages ?? []
    historyLoaded.value = true
    void scrollChat()
  } catch (cause) { historyError.value = cause instanceof Error ? cause.message : 'Saved conversation could not be loaded.' }
  finally { historyLoading.value = false }
}
async function clearHistory() {
  if (!clearConfirm.value || sending.value || clearing.value) return
  clearing.value = true
  chatError.value = ''
  try {
    await request('/api/student/chat', { method: 'DELETE' })
    messages.value = []
    retryMessage.value = null
    clearConfirm.value = false
    await loadHistory()
  } catch (cause) { chatError.value = cause instanceof Error ? cause.message : 'Conversation could not be cleared.' }
  finally { clearing.value = false }
}
async function updateProgress(courseId: string, moduleIndex: number, event: Event) {
  const input = event.target as HTMLInputElement
  const completed = input.checked
  if (actionBusy.value) { input.checked = !completed; return }
  actionBusy.value = true
  actionError.value = ''
  try {
    await request('/api/student/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId, moduleIndex, completed }) })
    await loadLearning()
  } catch (cause) { input.checked = !completed; actionError.value = cause instanceof Error ? cause.message : 'Progress could not be updated.' }
  finally { actionBusy.value = false }
}
async function markRead(ids: string[]) {
  if (!ids.length || actionBusy.value) return
  actionBusy.value = true
  actionError.value = ''
  try {
    await request('/api/student/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    await loadLearning()
  } catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Notifications could not be updated.' }
  finally { actionBusy.value = false }
}
async function scrollChat() { await nextTick(); chatLog.value?.scrollTo({ top: chatLog.value.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }
async function sendMessage() {
  const text = draft.value.trim()
  if (!text || sending.value || clearing.value || !historyLoaded.value) return
  const requestId = retryMessage.value?.text === text ? retryMessage.value.requestId : crypto.randomUUID()
  retryMessage.value = { text, requestId }
  draft.value = ''
  sending.value = true
  chatError.value = ''
  void scrollChat()
  try {
    await request<{ reply: string; courses: Recommendation[]; via: string; saved: true }>('/api/student/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, requestId }),
    })
    retryMessage.value = null
    await loadHistory()
  } catch (cause) {
    draft.value = text
    chatError.value = cause instanceof Error ? cause.message : 'Your message could not be sent. Try again.'
    await loadHistory()
  } finally { sending.value = false; void scrollChat() }
}
const money = (value: string | number) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
const safeUrl = (url: string | undefined, fallback: string) => {
  if (!url || /[\\\u0000-\u0020]/.test(url)) return fallback
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : fallback } catch { return fallback }
}
const meetingUrl = (url?: string) => {
  try { const parsed = new URL(url || ''); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null } catch { return null }
}
const sessionDate = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Time not provided' : `${parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})` }
const activityDate = (value: string) => date(value.length === 10 ? `${value}T12:00:00` : value)
let refreshTimer: ReturnType<typeof setInterval> | undefined
function refreshVisibleLearning() {
  if (document.visibilityState === 'visible' && !busy.value && !actionBusy.value) void loadLearning().catch(() => {})
}
onMounted(() => {
  window.addEventListener('popstate', popstate)
  document.addEventListener('visibilitychange', refreshVisibleLearning)
  void load()
  void loadHistory()
  refreshTimer = setInterval(refreshVisibleLearning, 60_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', popstate)
  document.removeEventListener('visibilitychange', refreshVisibleLearning)
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="sd-shell">
    <aside class="sd-sidebar" aria-label="Student navigation">
      <button class="sd-brand" type="button" aria-label="LearnPurse home" @click="emit('home')"><BrandMark /><span>LearnPurse<span class="sd-brand-sub">A little learning. More possibility.</span></span></button>
      <div class="sd-space-label">YOUR LEARNING SPACE</div>
      <nav class="sd-nav"><a v-for="item in navigation" :key="item.id" :href="item.href" :class="{ active: section === item.id }" :aria-current="section === item.id ? 'page' : undefined" @click="navigate($event, item.id)"><StudioIcon :name="item.icon" :size="19" /><span>{{ item.label }}</span><span v-if="item.id === 'chat'" class="sd-ai-label">AI</span><span v-if="item.id === 'notifications' && learning?.unreadCount" class="sd-unread-badge" :aria-label="`${learning.unreadCount} unread`">{{ learning.unreadCount }}</span></a></nav>
      <div class="sd-sidebar-bottom"><div class="sd-agent-mini"><StudioIcon name="shield" :size="24" /><strong>Your goals. Your budget.</strong><p>Give your spending agent a plan, and stay in control of approvals.</p><a href="/agent">Set up your agent <StudioIcon name="arrowRight" :size="15" /></a></div><button type="button" class="sd-signout" @click="emit('signOut')"><StudioIcon name="arrowLeft" :size="17" />Sign out</button></div>
    </aside>
    <div class="sd-workspace">
      <header class="sd-topbar"><span>My workspace <span class="sd-topbar-divider">/</span> <strong>{{ currentTitle }}</strong></span><a href="/student/settings" class="sd-account" @click="navigate($event, 'settings')"><span class="sd-avatar">{{ (profile?.name || 'L').slice(0, 1).toUpperCase() }}</span><span>{{ profile?.name || 'My account' }}<small>Student account</small></span></a></header>
      <main class="sd-main" :aria-busy="busy && section !== 'chat'">
        <div v-if="error" class="sd-error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></div>
        <div v-if="learningError && section !== 'chat' && section !== 'settings'" class="sd-error" role="alert">Learning details are unavailable: {{ learningError }} <button type="button" :disabled="busy" @click="load">Retry</button></div>
        <div v-if="paymentError && (section === 'payments' || section === 'overview')" class="sd-error" role="alert">{{ paymentError }} <button type="button" @click="load">Retry</button></div>
        <div v-if="actionError && (section === 'classes' || section === 'notifications')" class="sd-error" role="alert">{{ actionError }} <button type="button" @click="load">Refresh data</button></div>
        <div v-if="learning?.warnings?.length && (section === 'classes' || section === 'notifications')" class="sd-error" role="status"><p v-for="warning in learning.warnings" :key="warning">{{ warning }}</p><button type="button" :disabled="busy" @click="load">Retry class updates</button></div>
        <template v-if="section === 'overview'">
          <div class="sd-page-heading"><div><p class="sd-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h1>A little wiser, every day.<span>Hi, {{ firstName }}.</span></h1><p>Your classes, your goals, and a little help along the way.</p></div><span class="sd-heading-flower" aria-hidden="true">✳</span></div>
          <section class="sd-hero"><div class="sd-hero-copy"><span class="sd-pill"><StudioIcon name="sparkles" :size="14" /> YOUR LEARNING COMPANION</span><h2>Big ambitions.<br>A personal place to start.</h2><p>Tell your assistant what you want to learn. Discover classes that fit your goals before you decide what comes next.</p><a href="/student/chat" class="sd-button sd-button-light" @click="navigate($event, 'chat')">Find my next class <StudioIcon name="arrowRight" :size="17" /></a></div><div class="sd-hero-art" aria-hidden="true"><div class="sd-orbit"></div><div class="sd-art-card"><StudioIcon name="book" :size="42" /><span>A little investment<br>in yourself.</span></div><span class="sd-art-spark">✦</span></div></section>
          <div class="sd-stat-grid"><div class="sd-stat"><span class="sd-stat-icon"><StudioIcon name="book" /></span><div><span>Classes in your library</span><strong>{{ busy ? '…' : error ? 'Unavailable' : learning?.analytics.enrolledClasses ?? courses.length }}</strong></div></div><div class="sd-stat"><span class="sd-stat-icon"><StudioIcon name="wallet" /></span><div><span>Total recorded payments</span><strong>{{ busy ? '…' : !learning && paymentError ? 'Unavailable' : money(totalPaid) }} <small v-if="!busy && (learning || !paymentError)">USDC</small></strong></div></div><a class="sd-stat sd-stat-link" href="/agent"><span class="sd-stat-icon"><StudioIcon name="shield" /></span><div><span>Spend with intention</span><strong>Set a learning budget <StudioIcon name="external" :size="17" /></strong></div></a></div>
          <div class="sd-section-heading"><div><p class="sd-eyebrow">MAKE ROOM FOR GROWTH</p><h2>Your learning shelf</h2></div><a href="/student/classes" @click="navigate($event, 'classes')">All classes <StudioIcon name="arrowRight" :size="16" /></a></div>
        </template>
        <template v-if="section === 'classes'"><div class="sd-page-heading"><div><p class="sd-eyebrow">ONE STEP AT A TIME</p><h1>My classes</h1><p>Your enrolled classes, all in one thoughtful little space.</p></div></div></template>
        <section v-if="section === 'overview' || section === 'classes'" aria-label="Enrolled classes">
          <p v-if="busy" class="sd-loading" role="status">Gathering your classes…</p>
          <div v-else-if="!courses.length && !error" class="sd-empty"><span class="sd-empty-icon"><StudioIcon name="book" :size="30" /></span><h3>Your next chapter is waiting.</h3><p>Once you enroll, your classes will be right here. Let's find something that feels like you.</p><a href="/student/chat" class="sd-button" @click="navigate($event, 'chat')">Explore with your assistant <StudioIcon name="arrowRight" :size="17" /></a></div>
          <div v-else-if="courses.length" class="sd-course-grid">
            <article v-for="(course, index) in (section === 'overview' ? courses.slice(0, 3) : courses)" :key="course.id" class="sd-course">
              <a :href="safeUrl(course.url, `/class/${course.id}`)" class="sd-course-cover"><div class="sd-course-art" :class="`sd-tone-${index % 3}`"><StudioIcon name="book" :size="40" /><span>YOUR LEARNING LIBRARY</span></div><div class="sd-course-body"><span class="sd-course-label">ENROLLED CLASS</span><h3>{{ course.title || 'Untitled class' }}</h3><p><span v-if="course.duration"><StudioIcon name="clock" :size="14" />{{ course.duration }}</span><span>{{ course.modules?.length || 0 }} modules</span></p><span class="sd-course-open">Open class <StudioIcon name="arrowRight" :size="17" /></span></div></a>
              <div v-if="learning && section === 'classes'" class="sd-course-details">
                <section v-if="course.schedule" class="sd-session" aria-label="Class schedule"><h4>{{ course.schedule.mode === 'live' ? 'Live session' : 'Class schedule' }}</h4><p v-if="course.schedule.startsAt"><time :datetime="course.schedule.startsAt">{{ sessionDate(course.schedule.startsAt) }}</time></p><p v-if="course.schedule.timezone" class="sd-session-zone">Session timezone: {{ course.schedule.timezone }}</p><p v-if="course.schedule.instructions" class="sd-session-instructions">{{ course.schedule.instructions }}</p><a v-if="meetingUrl(course.schedule.meetingUrl)" :href="meetingUrl(course.schedule.meetingUrl)!" class="sd-button sd-button-outline" target="_blank" rel="noopener noreferrer">Join session <StudioIcon name="external" :size="15" /><span class="sd-sr-only"> (opens a new tab)</span></a><p v-else-if="course.schedule.mode === 'live'" class="sd-footnote">A secure meeting link has not been provided.</p></section>
                <fieldset v-if="course.modules?.length" class="sd-modules" :disabled="actionBusy || !!learningError"><legend>Module progress <span>{{ course.completedModules?.length || 0 }}/{{ course.modules.length }}</span></legend><label v-for="(module, moduleIndex) in course.modules" :key="moduleIndex"><input type="checkbox" :checked="course.completedModules?.includes(moduleIndex) ?? false" @change="updateProgress(course.id, moduleIndex, $event)" /><span>{{ module.title || `Module ${moduleIndex + 1}` }}</span></label></fieldset>
                <p v-else class="sd-footnote">No modules have been published yet.</p>
              </div>
            </article>
          </div>
        </section>
        <template v-if="section === 'chat'">
          <div class="sd-page-heading"><div><p class="sd-eyebrow">A LITTLE GUIDANCE GOES A LONG WAY</p><h1>Your learning assistant</h1><p>Find your direction. Discover a class. Keep the decision yours.</p></div></div>
          <section class="sd-chat"><div class="sd-chat-header"><span class="sd-chat-avatar"><StudioIcon name="sparkles" /></span><div><strong>Let's figure out your next step</strong><small>Saved to your account on the server</small></div><button type="button" class="sd-text-button sd-clear-chat" :disabled="!historyLoaded || sending || clearing || !messages.length" @click="clearConfirm = !clearConfirm">Clear conversation</button></div><div v-if="clearConfirm" class="sd-clear-confirm" role="group" aria-label="Confirm clearing conversation"><p>Delete this account-saved conversation? This cannot be undone.</p><button type="button" class="sd-button" :disabled="clearing || sending" @click="clearHistory">{{ clearing ? 'Clearing…' : 'Yes, delete conversation' }}</button><button type="button" class="sd-text-button" :disabled="clearing" @click="clearConfirm = false">Keep conversation</button></div><div ref="chatLog" class="sd-chat-log" role="log" aria-label="Conversation" aria-live="polite"><p v-if="historyLoading" class="sd-loading" role="status">Loading your account-saved conversation…</p><div v-if="historyError" class="sd-error" role="alert">{{ historyError }} <button type="button" :disabled="historyLoading || sending" @click="loadHistory">Retry loading conversation</button></div><div v-if="historyLoaded && !messages.length && !sending" class="sd-chat-welcome"><StudioIcon name="sparkles" :size="32" /><h2>What would you love to learn?</h2><p>Tell me your interests, available time, or budget. We'll find a place to begin.</p><div class="sd-prompts"><button v-for="prompt in ['I want to get better at budgeting', 'Help me explore creative skills', 'Find a class for a busy schedule']" :key="prompt" type="button" @click="draft = prompt">{{ prompt }} <StudioIcon name="plus" :size="14" /></button></div></div><article v-for="message in messages" :key="message.id" class="sd-message" :class="message.role"><strong>{{ message.role === 'user' ? 'You' : 'Learning assistant' }}</strong><p>{{ message.content }}</p><div v-if="message.courses?.length" class="sd-recommendations"><a v-for="course in message.courses" :key="course.id" :href="safeUrl(course.url, `/class/${course.id}`)"><StudioIcon name="book" :size="20" /><span><strong>{{ course.title }}</strong><small>{{ money(course.price) }} USDC</small></span><StudioIcon name="arrowRight" :size="17" /></a></div></article><p v-if="sending" class="sd-chat-thinking" role="status">Sending your message and saving your conversation…</p></div><div class="sd-chat-compose"><p v-if="chatError" class="sd-error" role="alert">{{ chatError }}</p><form @submit.prevent="sendMessage"><label for="student-message" class="sd-sr-only">Message your learning assistant</label><textarea id="student-message" v-model="draft" rows="2" maxlength="2000" placeholder="What do you want to learn?" :disabled="sending || clearing || !historyLoaded" @keydown.enter.exact.prevent="sendMessage" /><button type="submit" :disabled="sending || clearing || !historyLoaded || !draft.trim()" aria-label="Send message"><StudioIcon name="arrowUp" :size="20" /></button></form><p><StudioIcon name="lock" :size="12" />Chatting never pays or enrolls you. <a href="/agent">Set up your spending agent</a> for budget and approval controls.</p></div></section>
        </template>
        <template v-if="section === 'analytics'">
          <div class="sd-page-heading"><div><p class="sd-eyebrow">SMALL STEPS, REAL PROGRESS</p><h1>Learning analytics</h1><p>A clear picture of your recorded learning activity.</p></div></div>
          <p v-if="busy" class="sd-loading" role="status">Loading your learning activity…</p>
          <template v-else-if="learning">
            <div class="sd-analytics-grid"><article class="sd-metric"><span>Enrolled classes</span><strong>{{ learning.analytics.enrolledClasses }}</strong></article><article class="sd-metric"><span>Modules completed</span><strong>{{ learning.analytics.completedModules }} <small>/ {{ learning.analytics.totalModules }}</small></strong></article><article class="sd-metric"><span>Completion</span><strong>{{ learning.analytics.completionPercent }}<small>%</small></strong></article><article class="sd-metric"><span>Study days</span><strong>{{ learning.analytics.studyDays }}</strong></article><article class="sd-metric"><span>Total recorded spending</span><strong>{{ money(learning.analytics.totalSpent) }} <small>USDC</small></strong></article></div>
            <section class="sd-panel sd-progress-panel"><div class="sd-panel-heading"><h2>Your progress, one module at a time</h2><span>{{ learning.analytics.completionPercent }}%</span></div><div class="sd-progress-content"><progress :value="learning.analytics.completedModules" :max="learning.analytics.totalModules || 1" :aria-label="`${learning.analytics.completedModules} of ${learning.analytics.totalModules} modules completed`"></progress><p>{{ learning.analytics.totalModules ? `${learning.analytics.completedModules} of ${learning.analytics.totalModules} modules marked complete.` : 'No modules available in your enrolled classes yet.' }}</p></div></section>
            <section class="sd-panel sd-weekly-panel"><div class="sd-panel-heading"><h2>Weekly module completions</h2><span>Recorded activity</span></div><ul v-if="learning.analytics.weeklyActivity.length" class="sd-weekly-chart" aria-label="Daily module completions"><li v-for="day in learning.analytics.weeklyActivity" :key="day.date"><span class="sd-weekly-count">{{ day.count }}</span><div class="sd-weekly-track" aria-hidden="true"><span :style="{ height: `${Math.max(0, day.count) / weeklyMaximum * 100}%` }"></span></div><time :datetime="day.date">{{ activityDate(day.date) }}</time><span class="sd-sr-only">{{ day.count }} modules completed</span></li></ul><p v-else class="sd-loading">No weekly activity has been recorded yet.</p><p class="sd-footnote sd-chart-note">Progress reflects the modules you mark complete in My classes.</p></section>
          </template>
        </template>
        <template v-if="section === 'notifications'">
          <div class="sd-page-heading"><div><p class="sd-eyebrow">UPDATES IN YOUR LEARNING SPACE</p><h1>Notifications</h1><p>Account and class updates, right here in your workspace.</p></div><button v-if="learning" type="button" class="sd-button sd-button-outline" :disabled="actionBusy || !!learningError || !learning.unreadCount" @click="markRead(learning.notifications.filter(item => !item.read).map(item => item.id))">Mark all as read</button></div>
          <p v-if="busy" class="sd-loading" role="status">Loading your notifications…</p>
          <section v-else-if="learning" class="sd-panel"><div class="sd-panel-heading"><h2>Your updates</h2><span>{{ learning.unreadCount }} unread</span></div><div v-if="!learning.notifications.length" class="sd-empty"><StudioIcon name="mail" :size="30" /><h3>You're all caught up.</h3><p>Your account has no notifications yet.</p></div><div v-else class="sd-notifications"><article v-for="notification in learning.notifications" :key="notification.id" class="sd-notification" :class="{ 'is-unread': !notification.read }"><span class="sd-notification-dot" :aria-label="notification.read ? 'Read' : 'Unread'"></span><div class="sd-notification-copy"><h3>{{ notification.title }}</h3><p>{{ notification.message }}</p><time :datetime="notification.createdAt">{{ sessionDate(notification.createdAt) }}</time><a v-if="safeUrl(notification.url, '')" :href="safeUrl(notification.url, '')" class="sd-notification-link">View update <StudioIcon name="arrowRight" :size="15" /></a></div><button v-if="!notification.read" type="button" class="sd-text-button" :disabled="actionBusy || !!learningError" @click="markRead([notification.id])">Mark as read</button><span v-else class="sd-read-label">Read</span></article></div></section>
        </template>
        <template v-if="section === 'payments'"><div class="sd-page-heading"><div><p class="sd-eyebrow">EVERY INVESTMENT, ACCOUNTED FOR</p><h1>Payments &amp; receipts</h1><p>A clear record of your learning purchases in USDC.</p></div><a class="sd-button sd-button-outline" href="/agent"><StudioIcon name="shield" :size="17" />Manage learning budget</a></div><section class="sd-panel"><div class="sd-panel-heading"><h2>Payment history</h2><span>{{ paymentError ? 'Unavailable' : `${payments.length} recorded` }}</span></div><p v-if="busy" class="sd-loading" role="status">Loading your receipts…</p><div v-else-if="!payments.length && !paymentError" class="sd-empty"><StudioIcon name="wallet" :size="32" /><h3>A fresh start.</h3><p>No payments recorded yet. When you purchase a class, its receipt will appear here.</p></div><div v-else class="sd-receipts"><article v-for="(payment, index) in payments" :key="`${payment.transaction}-${index}`" class="sd-receipt"><span class="sd-receipt-icon"><StudioIcon name="book" /></span><div><a :href="`/class/${payment.courseId}`">{{ payment.title }}</a><p>{{ date(payment.enrolledAt) }}</p></div><div class="sd-receipt-value"><strong>{{ money(payment.amount) }} USDC</strong><a v-if="payment.transaction" :href="`https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(payment.transaction)}`" target="_blank" rel="noopener noreferrer">View receipt <StudioIcon name="external" :size="13" /><span class="sd-sr-only"> (opens a new tab)</span></a><span v-else>Transaction unavailable</span></div></article></div></section><p class="sd-footnote">Receipts open in the Stellar testnet explorer. Your spending agent manages budget and purchase approvals separately.</p></template>
        <template v-if="section === 'settings'"><div class="sd-page-heading"><div><p class="sd-eyebrow">A SPACE THAT'S YOURS</p><h1>Account settings</h1><p>Your account details, kept in one place.</p></div></div><section class="sd-panel sd-profile"><div class="sd-panel-heading"><h2>Personal profile</h2><span>Read-only</span></div><dl><div><dt>Full name</dt><dd>{{ profile?.name || 'Not provided' }}</dd></div><div><dt>Email address</dt><dd>{{ profile?.email || 'Not provided' }}</dd></div><div><dt>Learning interest</dt><dd>{{ profile?.focus || 'Not provided' }}</dd></div><div><dt>Wallet address</dt><dd class="sd-wallet-address">{{ profile?.walletAddress || 'No wallet connected' }}</dd></div></dl></section><section class="sd-settings-agent"><span class="sd-stat-icon"><StudioIcon name="shield" /></span><div><h2>Your budget stays in your hands.</h2><p>Set up your spending agent to manage learning budgets and purchase approvals. Chat recommendations alone never make a payment.</p><a href="/agent">Open spending agent <StudioIcon name="arrowRight" :size="16" /></a></div></section><button class="sd-button sd-button-outline" type="button" @click="emit('signOut')">Sign out of your account <StudioIcon name="arrowRight" :size="16" /></button></template>
        <footer class="sd-footer"><span>Learning looks good on you.</span><span>LearnPurse <span aria-hidden="true">✦</span></span></footer>
      </main>
    </div>
  </div>
</template>
