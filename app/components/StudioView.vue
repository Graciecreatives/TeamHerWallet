<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue'
import Dialog from 'primevue/dialog'
import BrandMark from './BrandMark.vue'
import StudioIcon from './StudioIcon.vue'
import FloatField from './FloatField.vue'
import CoursePreview from './CoursePreview.vue'
import EnrolledClassroom from './EnrolledClassroom.vue'
import ClassScheduleFields from './ClassScheduleFields.vue'
import { emptySchedule, cleanSchedule } from '#shared/classroom'
import AgentComposer from './AgentComposer.vue'
import type { AgentAction } from '#shared/agent'
import { validateCourseDraft } from '#shared/course'
import { emptyCourseDraft, decodeStoredDraft, encodeStoredDraft, DRAFT_STORAGE_KEY } from '#shared/draft-storage'
import { studioSteps, errorsForStep, completedStepCount, starterExamples, hasDraftContent, moveModule, type StudioStep } from '#shared/studio-flow'
import { shortAddress, type CreatorProfile } from '#shared/profile'

const props = defineProps<{ profile: CreatorProfile | null }>()
const emit = defineEmits<{ home: []; signOut: []; signedOut: []; wallet: [] }>()

const productType = ref<'class' | 'pdf' | 'bundle'>('class')
const productDocument = ref<{ key: string; name: string; size: number; receipt: string } | null>(null)
const documentBusy = ref(false)
const documentError = ref('')
async function uploadDocument(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  documentError.value = ''
  if (file.size > 20 * 1024 * 1024) { documentError.value = 'PDFs must be 20 MB or smaller.'; return }
  documentBusy.value = true
  try {
    const form = new FormData()
    form.append('document', file)
    const response = await fetch('/api/uploads/document', { method: 'POST', credentials: 'include', body: form })
    const result = await response.json()
    if (!response.ok) throw new Error(result.statusMessage || 'PDF upload failed.')
    productDocument.value = result
  } catch (failure) { documentError.value = (failure as Error).message }
  finally { documentBusy.value = false }
}
const draft = reactive(emptyCourseDraft())
const classroomSchedule = ref(emptySchedule())
watch(classroomSchedule, value => { if (mounted.value) try { localStorage.setItem('learnpurse.classroom-draft', JSON.stringify(value)) } catch {} }, { deep: true })
const openClassroom = ref('')
const currentStep = ref<StudioStep>('details')
const checkedSteps = ref(new Set<StudioStep>())
const mounted = ref(false)
const productStorageKey = computed(() => `learnpurse.product-draft.v1.${props.profile?.email || 'creator'}`)
function applyPdfDefaults() {
  if (productType.value !== 'pdf') return
  if (!draft.duration.trim()) draft.duration = 'Instant download'
  draft.capacity = ''
  if (draft.modules.length === 1) {
    const module = draft.modules[0]!
    if (!module.title.trim()) module.title = 'Download your PDF guide'
    if (!module.description.trim()) module.description = 'After payment, download your private PDF guide and read it at your own pace.'
  }
}
function persistProductDraft() {
  if (!mounted.value) return
  try { localStorage.setItem(productStorageKey.value, JSON.stringify({ version: 1, productType: productType.value, document: productDocument.value })) }
  catch { /* Product remains usable in this session when browser storage is blocked. */ }
}
watch(productType, () => { applyPdfDefaults(); persistProductDraft() })
watch(productDocument, persistProductDraft, { deep: true })
const savedSnapshot = ref(encodeStoredDraft(draft))
const hasSavedDraft = ref(false)
const previewOpen = ref(false)
const examplesOpen = ref(false)
const confirmOpen = ref(false)
const leaveOpen = ref(false)
const leaveTarget = ref<'home' | 'signOut'>('home')
const menuOpen = ref(false)
const pendingExample = ref<string | null>(null)
const pendingRemoval = ref<number | null>(null)
const toast = ref('')
const toastKind = ref<'info' | 'success' | 'error'>('info')
const focusErrorsAfterStep = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | undefined
let moduleSequence = 1
const moduleKeys = ref([0])

const dirty = computed(() => mounted.value && savedSnapshot.value !== encodeStoredDraft(draft))
const activeIndex = computed(() => studioSteps.findIndex(step => step.id === currentStep.value))
const completed = computed(() => completedStepCount(draft))
const validation = computed(() => validateCourseDraft(draft))
const errors = computed(() => checkedSteps.value.has(currentStep.value) ? errorsForStep(draft, currentStep.value) : {})
const stepDone = (id: StudioStep) => id !== 'review' && !Object.keys(errorsForStep(draft, id)).length
const coverDefault = computed(() => props.profile?.focus === 'Creative skills' ? 'pottery' : props.profile?.focus === 'Business & freelancing' ? 'creator-workspace' : 'creator-home')
// Creator customisation: cover image (built-in or uploaded to Cloudflare R2), accent colour and tagline.
const STYLE_KEY = 'learnpurse.class-style'
const style = reactive({ image: '', accent: '#a31c60', tagline: '' })
const coverImage = computed(() => style.image || coverDefault.value)
const builtInCovers = [{ id: 'creator-home', label: 'Home studio' }, { id: 'creator-workspace', label: 'Workspace' }, { id: 'pottery', label: 'Creative' }]
const accents = ['#a31c60', '#6d28d9', '#0f766e', '#c2410c', '#1d4ed8', '#2f1730']
const uploading = ref(false)
const uploadError = ref('')
const coverThumb = (id: string) => id.startsWith('http') ? id : `/images/${id === 'creator-workspace' ? 'creator-workspace-640' : `${id}-480`}.webp`
function saveStyle() { try { localStorage.setItem(STYLE_KEY, JSON.stringify(style)) } catch { /* Style still applies for this session. */ } }
async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploadError.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) { uploadError.value = 'Use a JPG, PNG, WebP, GIF or AVIF image.'; return }
  if (file.size > 5 * 1024 * 1024) { uploadError.value = 'Images must be 5 MB or smaller.'; return }
  uploading.value = true
  try {
    const form = new FormData()
    form.append('image', file)
    const response = await fetch('/api/uploads/image', { method: 'POST', body: form })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.statusMessage ?? 'Upload failed.')
    style.image = body.url
    saveStyle()
    notify('Cover image uploaded.', 'success')
  } catch (failure) { uploadError.value = (failure as Error).message }
  finally { uploading.value = false }
}
function pickCover(id: string) { style.image = id; saveStyle() }
function pickAccent(color: string) { style.accent = color; saveStyle() }
const creatorName = computed(() => props.profile?.name || '')
const initials = computed(() => (props.profile?.name || 'You').split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase())
const headings: Record<StudioStep, [string, string]> = {
  details: ['What’s your course about?', 'A clear title and promise help learners say yes.'],
  curriculum: ['Plan the modules.', 'Short, focused steps from start to finish.'],
  pricing: ['Set your price.', 'Students pay this in USDC on Stellar, straight to your wallet.'],
  review: ['Looking good.', 'Check everything, then publish your class.'],
}
const nextLabel = computed(() => currentStep.value === 'review' ? 'Save draft' : 'Continue')
const dialogPt = { mask: { class: 'sheet-mask' }, root: { class: 'sheet' }, header: { class: 'sheet-header' }, title: { class: 'sheet-title' }, content: { class: 'sheet-content' }, footer: { class: 'sheet-footer' } }

function notify(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  toast.value = message
  toastKind.value = kind
  clearTimeout(toastTimer)
  if (kind !== 'error') toastTimer = setTimeout(() => { toast.value = '' }, 4200)
}
function rebuildModuleKeys() { moduleKeys.value = draft.modules.map(() => moduleSequence++) }
function focusPanel() {
  if (focusErrorsAfterStep.value) {
    document.querySelector<HTMLElement>('#course-editor [aria-invalid="true"]')?.focus()
    focusErrorsAfterStep.value = false
  } else document.getElementById('step-heading')?.focus({ preventScroll: true })
}
function setStep(target: StudioStep) {
  // Instant swap: whole-page snapshots made tab changes slow and flashed white.
  currentStep.value = target
  nextTick(focusPanel)
}
function goToStep(target: StudioStep) {
  const targetIndex = studioSteps.findIndex(step => step.id === target)
  if (targetIndex > activeIndex.value) {
    for (const step of studioSteps.slice(0, targetIndex)) {
      if (Object.keys(errorsForStep(draft, step.id)).length) {
        checkedSteps.value = new Set(checkedSteps.value).add(step.id)
        notify('A few details need your attention.', 'error')
        focusErrorsAfterStep.value = true
        if (currentStep.value === step.id) nextTick(focusPanel)
        else setStep(step.id)
        return
      }
    }
  }
  setStep(target)
}
function continueFlow() {
  if (currentStep.value === 'review') { saveDraft(); return }
  const next = studioSteps[activeIndex.value + 1]
  if (next) goToStep(next.id)
}
function saveDraft() {
  if (!mounted.value) return
  try {
    const snapshot = encodeStoredDraft(draft)
    localStorage.setItem(DRAFT_STORAGE_KEY, snapshot)
    persistProductDraft()
    savedSnapshot.value = snapshot
    hasSavedDraft.value = true
    notify('Draft saved on this device.', 'success')
    return true
  } catch { notify('We couldn’t save this draft. Storage may be full or blocked. Export a copy instead.', 'error'); return false }
}
function requestLeave(target: 'home' | 'signOut') {
  menuOpen.value = false
  leaveTarget.value = target
  if (dirty.value) leaveOpen.value = true
  else leaveStudio()
}
function leaveStudio(save = false) {
  if (save && !saveDraft()) return
  leaveOpen.value = false
  if (leaveTarget.value === 'home') emit('home')
  else emit('signOut')
}
function exportDraft() {
  let url: string | undefined
  try {
    url = URL.createObjectURL(new Blob([encodeStoredDraft(draft)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'learnpurse-course-draft.json'
    link.click()
    notify('Draft download started.', 'success')
  } catch { notify('We couldn’t export this draft. Allow downloads, or save on this device.', 'error') }
  finally { if (url) { const downloadUrl = url; setTimeout(() => URL.revokeObjectURL(downloadUrl), 100) } }
}
function addModule() {
  if (draft.modules.length >= 30) return
  draft.modules.push({ title: '', description: '' })
  moduleKeys.value.push(moduleSequence++)
  nextTick(() => document.getElementById(`module-title-${draft.modules.length - 1}`)?.focus())
}
function reorderModule(index: number, step: -1 | 1) {
  if (moveModule(draft, index, step)) {
    const [key] = moduleKeys.value.splice(index, 1)
    moduleKeys.value.splice(index + step, 0, key!)
  }
}
function requestRemove(index: number) {
  if (draft.modules.length <= 1) return
  const module = draft.modules[index]
  if (module?.title.trim() || module?.description.trim()) { pendingRemoval.value = index; pendingExample.value = null; confirmOpen.value = true }
  else removeModule(index)
}
function removeModule(index: number) {
  if (draft.modules.length <= 1) return
  draft.modules.splice(index, 1)
  moduleKeys.value.splice(index, 1)
  nextTick(() => document.getElementById(`module-title-${Math.min(index, draft.modules.length - 1)}`)?.focus())
}
function chooseExample(id: string) {
  examplesOpen.value = false
  if (hasDraftContent(draft)) { pendingExample.value = id; pendingRemoval.value = null; confirmOpen.value = true }
  else applyExample(id)
}
function applyExample(id: string) {
  const example = starterExamples.find(item => item.id === id)
  if (!example) return
  Object.assign(draft, structuredClone(example.draft))
  rebuildModuleKeys()
  checkedSteps.value = new Set()
  setStep('details')
  notify('Example loaded. Make it your own.')
}
type Listing = { id: string; title: string; url: string; priceAmount: string; capacity: string; enrolled: number; seatsLeft: number | null; revenue: string; recent: { student: string; transaction: string; enrolledAt: string }[] }
const published = ref<Listing | null>(null)
const listings = ref<Listing[]>([])
const publishing = ref(false)
const publishError = ref('')
const paymentMode = ref<'single' | 'repeat' | 'installments'>('single')
const installmentCount = ref('2')
let pollTimer: ReturnType<typeof setInterval> | undefined
// Learners' agents ask for classes that don't exist yet. Building one links it to the request,
// and when it is published the requesting agent buys it inside its owner's rules.
type ClassRequest = { id: string; topic: string; brief: string; maxPrice: number; createdAt: string }
const requests = ref<ClassRequest[]>([])
const activeRequest = ref<ClassRequest | null>(null)
const composer = ref<InstanceType<typeof AgentComposer> | null>(null)
async function refreshRequests() {
  try { const response = await fetch('/api/requests'); if (response.ok) requests.value = await response.json() } catch { /* Offline. */ }
}
function buildForRequest(request: ClassRequest) {
  activeRequest.value = request
  window.scrollTo({ top: 0, behavior: 'smooth' })
  void composer.value?.send(`A learner's agent asked for this class. Build it: ${request.brief} Keep the price at or under ${request.maxPrice} USDC.`)
}
async function refreshListings() {
  void refreshRequests()
  if (!props.profile) return
  try {
    const response = await fetch('/api/courses?mine=1', { credentials: 'include' })
    if (response.status === 401) { emit('signedOut'); return }
    if (response.ok) listings.value = await response.json()
  } catch { /* Offline. The last known numbers stay visible. */ }
}
async function publishClass() {
  publishError.value = ''
  if (!validation.value.valid) { goToStep('review'); return }
  if (!props.profile?.walletAddress) { publishError.value = 'Add a Stellar wallet in your profile so students can pay you.'; return }
  if (productType.value !== 'class' && !productDocument.value) { publishError.value = 'Upload a PDF before publishing.'; return }
  publishing.value = true
  try {
    const response = await fetch('/api/courses', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draft, classroom: productType.value === 'pdf' ? emptySchedule() : cleanSchedule(classroomSchedule.value), productType: productType.value, document: productType.value === 'class' ? undefined : productDocument.value, requestId: activeRequest.value?.id, image: coverImage.value, accent: style.accent, tagline: style.tagline, paymentPolicy: { mode: paymentMode.value, installments: paymentMode.value === 'installments' ? Number(installmentCount.value) : undefined } }) })
    const body = await response.json()
    if (response.status === 401) { emit('signedOut'); throw new Error('Your session ended. Sign in again to publish.') }
    if (!response.ok) throw new Error(body?.statusMessage ?? 'Publishing failed.')
    published.value = { ...body, revenue: '0.00', recent: [] }
    if (activeRequest.value) { notify(`Published for a learner’s request. Their agent is buying it now.`, 'success'); activeRequest.value = null; void refreshRequests() }
    saveDraft()
    void refreshListings()
    notify('Your class is live. Share the payment page with students.', 'success')
  } catch (failure) { publishError.value = (failure as Error).message }
  finally { publishing.value = false }
}
const classLink = (listing: Listing) => (typeof window === 'undefined' ? '' : window.location.origin) + listing.url

// ---- Creator agent bridge: the agent reads this state and its actions edit the real draft. ----
function agentState() {
  return { draft: structuredClone(toRaw(draft)), paymentMode: paymentMode.value, installments: Number(installmentCount.value), style: { ...style }, step: currentStep.value, hasWallet: Boolean(props.profile?.walletAddress), creatorName: creatorName.value }
}
function applyAgentAction(action: AgentAction): string | null {
  published.value = null
  switch (action.type) {
    case 'set_details': {
      const changed: string[] = []
      for (const key of ['title', 'description', 'targetAudience', 'duration'] as const) if (typeof action[key] === 'string') { draft[key] = action[key]; changed.push(key === 'targetAudience' ? 'audience' : key) }
      return changed.length ? `Updated ${changed.join(', ')}` : null
    }
    case 'set_modules':
      draft.modules = action.modules.map((module: any) => ({ title: module.title, description: module.description }))
      rebuildModuleKeys()
      return `Wrote ${draft.modules.length} lessons`
    case 'add_module': {
      const position = typeof action.position === 'number' ? action.position : draft.modules.length
      draft.modules.splice(position, 0, { title: action.title, description: action.description })
      rebuildModuleKeys()
      return `Added lesson “${action.title}”`
    }
    case 'update_module': {
      const module = draft.modules[action.index]
      if (!module) return null
      if (action.title) module.title = action.title
      if (action.description) module.description = action.description
      return `Edited lesson ${action.index + 1}`
    }
    case 'remove_module': {
      const [removed] = draft.modules.splice(action.index, 1)
      rebuildModuleKeys()
      return removed ? `Removed lesson “${removed.title}”` : null
    }
    case 'set_pricing': {
      const changed: string[] = []
      if (action.priceAmount) { draft.priceAmount = action.priceAmount; changed.push(`price ${action.priceAmount} USDC`) }
      if (typeof action.capacity === 'string') { draft.capacity = action.capacity; changed.push(action.capacity ? `${action.capacity} places` : 'unlimited places') }
      if (action.paymentMode) { paymentMode.value = action.paymentMode; changed.push(action.paymentMode === 'installments' ? 'installments' : action.paymentMode === 'repeat' ? 'repeat payments' : 'one payment') }
      if (action.installments) installmentCount.value = String(action.installments)
      return changed.length ? `Set ${changed.join(', ')}` : null
    }
    case 'set_style': {
      const changed: string[] = []
      if (action.accent) { style.accent = action.accent; changed.push('accent colour') }
      if (typeof action.tagline === 'string') { style.tagline = action.tagline; changed.push('tagline') }
      if (action.cover) { style.image = action.cover; changed.push('cover image') }
      saveStyle()
      return changed.length ? `Styled ${changed.join(', ')}` : null
    }
    case 'go_to_step':
      setStep(action.step)
      return null
  }
  return null
}
async function agentPublish(): Promise<string | null> {
  if (!validation.value.valid) { setStep('review'); return 'A few details still need fixing before I can publish. I opened the Review step.' }
  if (!props.profile?.walletAddress) return 'Add a Stellar Testnet wallet to your profile first, so students can pay you.'
  await publishClass()
  if (published.value) return `Your class is live. Share this link with students: ${classLink(published.value)}`
  return publishError.value || null
}
async function copyLink(listing: Listing) {
  try { await navigator.clipboard.writeText(classLink(listing)); notify('Class link copied.', 'success') } catch { notify(classLink(listing)) }
}
function confirmChange() {
  if (pendingExample.value) applyExample(pendingExample.value)
  else if (pendingRemoval.value !== null) removeModule(pendingRemoval.value)
  confirmOpen.value = false
  pendingExample.value = null
  pendingRemoval.value = null
}
function warnBeforeLeaving(event: BeforeUnloadEvent) {
  if (dirty.value) { event.preventDefault(); event.returnValue = '' }
}
function closeMenu(event: MouseEvent) {
  if (menuOpen.value && !(event.target as HTMLElement).closest('.account')) menuOpen.value = false
}
onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeLeaving)
  document.addEventListener('click', closeMenu)
  try {
    const savedSchedule = JSON.parse(localStorage.getItem('learnpurse.classroom-draft') || 'null')
    if (savedSchedule) classroomSchedule.value = { ...emptySchedule(), ...savedSchedule }
    const savedStyle = JSON.parse(localStorage.getItem(STYLE_KEY) || 'null')
    if (savedStyle && typeof savedStyle === 'object') Object.assign(style, { image: String(savedStyle.image ?? ''), accent: /^#[0-9a-f]{6}$/i.test(savedStyle.accent) ? savedStyle.accent : style.accent, tagline: String(savedStyle.tagline ?? '').slice(0, 120) })
  } catch { /* Ignore unreadable style. */ }
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (raw) {
      const restored = decodeStoredDraft(raw)
      if (restored) {
        Object.assign(draft, restored)
        rebuildModuleKeys()
        savedSnapshot.value = encodeStoredDraft(draft)
        hasSavedDraft.value = true
        notify('Welcome back. Your draft is restored.', 'success')
      } else notify('Your saved draft couldn’t be read. It hasn’t been replaced.', 'error')
    }
  } catch { notify('Browser storage is blocked. You can still create and export.', 'error') }
  try {
    const savedProduct = JSON.parse(localStorage.getItem(productStorageKey.value) || 'null')
    if (savedProduct?.version === 1 && ['class', 'pdf', 'bundle'].includes(savedProduct.productType)) {
      productType.value = savedProduct.productType
      const file = savedProduct.document
      if (file && /^documents\/[a-f0-9]{40}\.pdf$/.test(file.key) && typeof file.name === 'string' && file.name.length > 0 && file.name.length <= 120 && Number.isInteger(file.size) && file.size > 5 && file.size <= 20 * 1024 * 1024 && /^[a-f0-9]{64}$/.test(file.receipt)) productDocument.value = { key: file.key, name: file.name, size: file.size, receipt: file.receipt }
    }
  } catch { /* Ignore unreadable product preferences, never replace valid course fields. */ }
  applyPdfDefaults()
  nextTick(() => { mounted.value = true })
  void refreshListings()
  // Enrolments arrive from students paying elsewhere. Refresh quietly while the studio is open.
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') void refreshListings() }, 8000)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeLeaving)
  document.removeEventListener('click', closeMenu)
  clearTimeout(toastTimer)
  clearInterval(pollTimer)
})
</script>

<template>
  <div class="studio">
    <a class="skip-link" href="#course-editor">Skip to editor</a>
    <header class="topnav glass studio-nav">
      <button type="button" class="brand brand-button" aria-label="LearnPurse home" @click="requestLeave('home')"><BrandMark /><span>LearnPurse</span></button>
      <div class="nav-actions">
        <button type="button" class="btn btn-glass btn-nav" aria-label="Wallet and earnings" @click="emit('wallet')"><StudioIcon name="wallet" :size="17" /><span>Wallet</span></button>
        <button type="button" class="btn btn-glass btn-nav preview-toggle" aria-label="Preview course" @click="previewOpen = true"><StudioIcon name="eye" :size="17" /><span>Preview</span></button>
        <button type="button" class="btn btn-dark btn-nav" aria-label="Save draft" :disabled="!mounted" @click="saveDraft"><StudioIcon :name="hasSavedDraft && !dirty ? 'check' : 'save'" :size="16" /><span>{{ hasSavedDraft && !dirty ? 'Saved' : 'Save draft' }}</span></button>
        <div class="account">
          <button type="button" class="avatar" :aria-expanded="menuOpen" aria-haspopup="menu" aria-label="Account" @click="menuOpen = !menuOpen">{{ initials }}</button>
          <Transition name="pop">
            <div v-if="menuOpen" class="menu glass" role="menu">
              <div class="menu-head"><strong>{{ profile?.name || 'Guest creator' }}</strong><span>{{ profile?.walletAddress ? shortAddress(profile.walletAddress) : 'No wallet connected' }}</span></div>
              <button type="button" role="menuitem" @click="menuOpen = false; emit('wallet')"><StudioIcon name="wallet" :size="16" />Wallet & earnings</button>
              <button type="button" role="menuitem" @click="menuOpen = false; examplesOpen = true"><StudioIcon name="sparkles" :size="16" />Start from an example</button>
              <button type="button" role="menuitem" @click="menuOpen = false; exportDraft()"><StudioIcon name="download" :size="16" />Export draft</button>
              <button v-if="profile" type="button" role="menuitem" @click="requestLeave('signOut')"><StudioIcon name="arrowLeft" :size="16" />Sign out</button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <main class="studio-main">
      <AgentComposer ref="composer" :get-state="agentState" :apply-action="applyAgentAction" :publish="agentPublish" />

      <section v-if="requests.length" class="class-requests" aria-labelledby="requests-title">
        <div class="class-requests-head"><h2 id="requests-title">Learners are asking for</h2><p>Learning agents posted these because no class fits yet. Build one and the agent that asked buys it when you publish.</p></div>
        <div class="request-grid">
          <article v-for="request in requests.slice(0, 6)" :key="request.id" class="request-card glass" :class="{ active: activeRequest?.id === request.id }">
            <span class="request-budget">Up to {{ request.maxPrice }} USDC</span>
            <h3>{{ request.topic }}</h3>
            <p>{{ request.brief }}</p>
            <button type="button" class="btn btn-dark btn-sm" :disabled="activeRequest?.id === request.id" @click="buildForRequest(request)"><StudioIcon name="sparkles" :size="15" />{{ activeRequest?.id === request.id ? 'Building with AI…' : 'Build this class' }}</button>
          </article>
        </div>
      </section>

      <section v-if="listings.length" class="listings" aria-labelledby="listings-title">
        <h2 id="listings-title">Your live classes</h2>
        <div class="listing-grid">
          <article v-for="listing in listings" :key="listing.id" class="listing glass">
            <h3>{{ listing.title }}</h3>
            <dl>
              <div><dt>Enrolled</dt><dd>{{ listing.enrolled }}{{ listing.capacity ? ` / ${listing.capacity}` : '' }}</dd></div>
              <div><dt>Earned</dt><dd>{{ listing.revenue }} USDC</dd></div>
              <div><dt>Price</dt><dd>{{ listing.priceAmount }} USDC</dd></div>
            </dl>
            <ul v-if="listing.recent.length" class="listing-recent"><li v-for="item in listing.recent" :key="item.transaction"><StudioIcon name="user" :size="14" />{{ item.student }} enrolled<a :href="`https://stellar.expert/explorer/testnet/tx/${item.transaction}`" target="_blank" rel="noopener">tx</a></li></ul>
            <p v-else class="listing-empty">No students yet. Share your link.</p>
            <button type="button" class="btn btn-dark btn-sm" @click="openClassroom = openClassroom === listing.id ? '' : listing.id">{{ openClassroom === listing.id ? 'Close classroom' : 'Classroom & learner messages' }}</button>
            <EnrolledClassroom v-if="openClassroom === listing.id" :id="listing.id" teacher />
            <div class="listing-actions"><button type="button" class="btn btn-glass btn-sm" @click="copyLink(listing)"><StudioIcon name="copy" :size="15" />Copy link</button><a class="btn btn-ghost btn-sm" :href="listing.url" target="_blank" rel="noopener">View page</a></div>
          </article>
        </div>
      </section>
      <nav class="segmented glass" aria-label="Course steps">
        <span class="seg-indicator" :style="{ transform: `translateX(${activeIndex * 100}%)` }" aria-hidden="true" />
        <button v-for="step in studioSteps" :key="step.id" type="button" class="seg" :class="{ active: step.id === currentStep }" :aria-current="step.id === currentStep ? 'step' : undefined" @click="goToStep(step.id)">
          <span class="seg-check" :class="{ on: stepDone(step.id) }" aria-hidden="true"><StudioIcon name="check" :size="11" /></span>{{ step.shortLabel }}
        </button>
      </nav>

      <div class="studio-grid">
        <form id="course-editor" class="editor glass" novalidate @submit.prevent="continueFlow">
          <section :key="currentStep" class="editor-step step-swap" aria-labelledby="step-heading">
              <h1 id="step-heading" tabindex="-1">{{ headings[currentStep][0] }}</h1>
              <p class="lead">{{ headings[currentStep][1] }}</p>

              <div v-if="currentStep === 'details'" class="fields">
                <section class="glass-inset" aria-label="Product format">
                  <h2>What are you selling?</h2>
                  <label>Product type <select v-model="productType"><option value="class">Class</option><option value="pdf">PDF document</option><option value="bundle">Class + PDF bundle</option></select></label>
                  <template v-if="productType !== 'class'">
                    <p>Your PDF stays private. Only buyers with paid access can download it.</p>
                    <label>Private PDF (up to 20 MB) <input type="file" accept="application/pdf,.pdf" :disabled="documentBusy" @change="uploadDocument"></label>
                    <p v-if="documentBusy" role="status">Uploading private PDF…</p>
                    <p v-else-if="productDocument" role="status">Ready: {{ productDocument.name }}</p>
                    <p v-if="documentError" class="field-error" role="alert">{{ documentError }}</p>
                  </template>
                </section>
                <button v-if="!hasDraftContent(draft)" type="button" class="example-pill" @click="examplesOpen = true"><StudioIcon name="sparkles" :size="15" />Start from an example</button>
                <div class="class-cover-upload" :aria-busy="uploading">
                  <img :src="coverThumb(coverImage)" :alt="style.image.startsWith('http') ? 'Your class cover' : 'Sample class cover'">
                  <div>
                    <h2>Your class cover image</h2>
                    <p>Replace the sample photo with your own. This image appears on your class page and learner preview.</p>
                    <label class="btn btn-dark btn-sm upload-cover-label">
                      <input type="file" aria-label="Upload class cover image" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" :disabled="uploading" @change="uploadCover">
                      <StudioIcon name="plus" :size="16" />{{ uploading ? 'Uploading image…' : style.image.startsWith('http') ? 'Change class image' : 'Upload class image' }}
                    </label>
                    <p class="cover-file-hint">JPG, PNG, WebP, GIF or AVIF · up to 5 MB</p>
                    <p v-if="style.image.startsWith('http') && !uploading" role="status">Your uploaded image is selected.</p>
                    <p v-if="uploadError" class="field-error" role="alert">{{ uploadError }}</p>
                  </div>
                </div>
                <ClassScheduleFields v-if="productType !== 'pdf'" v-model="classroomSchedule" />
                <FloatField id="title" v-model="draft.title" label="Course title" :maxlength="100" counter :error="errors.title" />
                <FloatField id="description" v-model="draft.description" label="What will learners achieve?" multiline :rows="4" :maxlength="5000" :error="errors.description" />
                <FloatField id="audience" v-model="draft.targetAudience" label="Who is it for?" :maxlength="500" :error="errors.targetAudience" />
                <FloatField id="duration" v-model="draft.duration" label="Duration, e.g. 3 weeks" :maxlength="100" :error="errors.duration" />
                <fieldset class="customize">
                  <legend>Make it yours</legend>
                  <p class="customize-hint">Cover image</p>
                  <div class="cover-picker">
                    <button v-for="cover in builtInCovers" :key="cover.id" type="button" class="cover-option" :class="{ selected: coverImage === cover.id }" :aria-pressed="coverImage === cover.id" @click="pickCover(cover.id)"><img :src="coverThumb(cover.id)" :alt="cover.label"></button>
                    <button v-if="style.image.startsWith('http')" type="button" class="cover-option selected" aria-pressed="true"><img :src="style.image" alt="Your uploaded cover"></button>
                    <label class="cover-option cover-upload" :class="{ busy: uploading }"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" class="sr-only" :disabled="uploading" @change="uploadCover"><StudioIcon name="plus" :size="18" /><span>{{ uploading ? 'Uploading…' : 'Upload' }}</span></label>
                  </div>
                  <p v-if="uploadError" class="field-error" role="alert"><StudioIcon name="alert" :size="15" />{{ uploadError }}</p>
                  <p class="customize-hint">Accent colour</p>
                  <div class="accent-picker">
                    <button v-for="color in accents" :key="color" type="button" class="accent-swatch" :class="{ selected: style.accent === color }" :style="{ background: color }" :aria-label="`Accent ${color}`" :aria-pressed="style.accent === color" @click="pickAccent(color)" />
                    <label class="accent-swatch accent-custom" :style="{ background: style.accent }"><input type="color" :value="style.accent" aria-label="Custom accent colour" @input="pickAccent(($event.target as HTMLInputElement).value)"></label>
                  </div>
                  <FloatField id="tagline" v-model="style.tagline" label="Short tagline (optional)" :maxlength="120" @update:model-value="saveStyle" />
                </fieldset>
              </div>

              <div v-else-if="currentStep === 'curriculum'" class="fields">
                <TransitionGroup name="list" tag="div" class="module-list">
                  <fieldset v-for="(module, index) in draft.modules" :key="moduleKeys[index]" class="module">
                    <legend class="sr-only">Module {{ index + 1 }}</legend>
                    <div class="module-head">
                      <span class="module-num">{{ index + 1 }}</span>
                      <div class="module-tools">
                        <button type="button" class="icon-btn" :disabled="index === 0" :aria-label="`Move module ${index + 1} up`" @click="reorderModule(index, -1)"><StudioIcon name="arrowUp" :size="16" /></button>
                        <button type="button" class="icon-btn" :disabled="index === draft.modules.length - 1" :aria-label="`Move module ${index + 1} down`" @click="reorderModule(index, 1)"><StudioIcon name="arrowDown" :size="16" /></button>
                        <button type="button" class="icon-btn danger" :disabled="draft.modules.length === 1" :aria-label="`Remove module ${index + 1}`" @click="requestRemove(index)"><StudioIcon name="trash" :size="16" /></button>
                      </div>
                    </div>
                    <FloatField :id="`module-title-${index}`" v-model="module.title" label="Module title" :maxlength="100" :error="errors[`modules.${index}.title`]" />
                    <FloatField :id="`module-description-${index}`" v-model="module.description" label="What happens in this module?" multiline :rows="2" :maxlength="2000" :error="errors[`modules.${index}.description`]" />
                  </fieldset>
                </TransitionGroup>
                <p v-if="errors.modules" class="field-error"><StudioIcon name="alert" :size="15" />{{ errors.modules }}</p>
                <button type="button" class="add-module" :disabled="draft.modules.length >= 30" @click="addModule"><StudioIcon name="plus" :size="18" />Add module</button>
              </div>

              <div v-else-if="currentStep === 'pricing'" class="fields">
                <div class="price-field">
                  <FloatField id="price" v-model="draft.priceAmount" label="Price" inputmode="decimal" :maxlength="30" suffix="USDC" :error="errors.priceAmount" hint="Up to 7 decimal places. Never rounded." />
                </div>
                <FloatField id="capacity" v-model="draft.capacity" label="Learner limit" inputmode="numeric" :maxlength="10" optional :error="errors.capacity" hint="Leave blank for unlimited." />
                <div class="payout glass-inset">
                  <span class="chip-icon chip-accent"><StudioIcon name="wallet" :size="16" /></span>
                  <div><strong>{{ profile?.walletAddress ? `Paid to ${shortAddress(profile.walletAddress)}` : 'No payout wallet yet' }}</strong><span>{{ profile?.walletAddress ? 'Stellar Testnet · USDC' : 'Connect one when you sign up. Needed before publishing.' }}</span></div>
                </div>
                <div class="payment-plan glass-inset">
                  <div><strong>Payment plan</strong><span>Choose how students can pay for access.</span></div>
                  <select v-model="paymentMode" aria-label="Payment plan">
                    <option value="single">One payment</option>
                    <option value="repeat">Allow repeat payments</option>
                    <option value="installments">Installments</option>
                  </select>
                  <FloatField v-if="paymentMode === 'installments'" id="installment-count" v-model="installmentCount" label="Number of payments" inputmode="numeric" :maxlength="2" hint="2 to 12 payments." />
                </div>
              </div>

              <div v-else class="review">
                <div class="review-status" :class="{ ok: validation.valid }">
                  <StudioIcon :name="validation.valid ? 'check' : 'alert'" :size="18" />
                  <span>{{ validation.valid ? 'Ready to save' : 'Some details are missing' }}</span>
                  <span class="review-count">{{ completed }}/3</span>
                </div>
                <dl class="review-list">
                  <div><dt>Title</dt><dd>{{ draft.title || 'Not set' }}</dd><button type="button" class="link-btn" @click="goToStep('details')">Edit</button></div>
                  <div><dt>For</dt><dd>{{ draft.targetAudience || 'Not set' }}</dd><button type="button" class="link-btn" @click="goToStep('details')">Edit</button></div>
                  <div><dt>Modules</dt><dd>{{ draft.modules.length }} · {{ draft.modules.map(module => module.title).filter(Boolean).join(', ') || 'Not set' }}</dd><button type="button" class="link-btn" @click="goToStep('curriculum')">Edit</button></div>
                  <div><dt>Price</dt><dd>{{ draft.priceAmount ? `${draft.priceAmount} USDC` : 'Not set' }}{{ draft.capacity ? ` · ${draft.capacity} places` : '' }} · {{ paymentMode === 'single' ? 'one payment' : paymentMode === 'repeat' ? 'repeat payments' : `${installmentCount} installments` }}</dd><button type="button" class="link-btn" @click="goToStep('pricing')">Edit</button></div>
                </dl>
                <p class="glass-inset"><strong>{{ productType === 'pdf' ? 'PDF document' : productType === 'bundle' ? 'Class + PDF bundle' : 'Class' }}</strong><template v-if="productType !== 'class'"> · {{ productDocument?.name || 'PDF not uploaded yet' }}</template> <button type="button" class="link-btn" @click="goToStep('details')">Edit product</button></p>
                <div class="publish-live glass-inset">
                  <template v-if="published">
                    <span class="chip-icon chip-accent"><StudioIcon name="check" :size="16" /></span>
                    <div><strong>Your class is live.</strong><span>Students pay {{ published.priceAmount }} USDC on Stellar and are enrolled automatically.</span></div>
                    <div class="publish-actions"><button type="button" class="btn btn-glass btn-sm" @click="copyLink(published)"><StudioIcon name="copy" :size="15" />Copy link</button><a class="btn btn-dark btn-sm" :href="published.url" target="_blank" rel="noopener">Open payment page<StudioIcon name="external" :size="15" /></a></div>
                  </template>
                  <template v-else>
                    <span class="chip-icon chip-accent"><StudioIcon name="zap" :size="16" /></span>
                    <div><strong>Publish and get paid</strong><span>Creates your class page and an x402 payment endpoint that pays {{ profile?.walletAddress ? shortAddress(profile.walletAddress) : 'your wallet' }}.</span></div>
                    <button type="button" class="btn btn-dark btn-sm" :disabled="publishing || documentBusy || (productType !== 'class' && !productDocument) || !validation.valid" @click="publishClass">{{ publishing ? 'Publishing…' : 'Publish' }}</button>
                  </template>
                  <p v-if="publishError" class="field-error" role="alert"><StudioIcon name="alert" :size="15" />{{ publishError }}</p>
                </div>
              </div>
            </section>

          <footer class="editor-actions">
            <button type="button" class="btn btn-ghost" :disabled="activeIndex === 0" @click="goToStep(studioSteps[activeIndex - 1]!.id)"><StudioIcon name="arrowLeft" :size="17" />Back</button>
            <button type="submit" class="btn btn-dark" :disabled="!mounted">{{ nextLabel }}<StudioIcon :name="currentStep === 'review' ? 'save' : 'arrowRight'" :size="17" /></button>
          </footer>
        </form>

        <aside class="preview-pane" aria-label="Live preview">
          <p class="pane-label"><span class="live-dot" />Live preview</p>
          <CoursePreview :draft="draft" :creator="creatorName" :image="coverImage" :accent="style.accent" :tagline="style.tagline" />
        </aside>
      </div>
    </main>

    <Dialog v-model:visible="previewOpen" header="Preview" modal dismissable-mask :pt="dialogPt">
      <CoursePreview :draft="draft" :creator="creatorName" :image="coverImage" :accent="style.accent" :tagline="style.tagline" expanded />
      <template #footer><button type="button" class="btn btn-glass" @click="exportDraft"><StudioIcon name="download" :size="16" />Export draft</button><button type="button" class="btn btn-dark" @click="previewOpen = false">Done</button></template>
    </Dialog>
    <Dialog v-model:visible="examplesOpen" header="Start from an example" modal dismissable-mask :pt="dialogPt">
      <p class="sheet-lead">Pick one, then make it yours.</p>
      <div class="example-list">
        <button v-for="(example, index) in starterExamples" :key="example.id" type="button" class="example-option" @click="chooseExample(example.id)">
          <span class="choice-icon"><StudioIcon :name="index === 0 ? 'piggy' : index === 1 ? 'coins' : 'briefcase'" :size="20" /></span>
          <span><strong>{{ example.name }}</strong><span>{{ example.description }}</span></span>
          <StudioIcon name="arrowRight" :size="17" />
        </button>
      </div>
    </Dialog>
    <Dialog v-model:visible="leaveOpen" header="Keep your latest changes?" modal :pt="dialogPt">
      <p class="sheet-lead">Your draft has changes that are only on this screen. Save them on this device before you leave.</p>
      <div class="leave-options"><button type="button" class="btn btn-dark btn-block" @click="leaveStudio(true)">Save and leave</button><button type="button" class="btn btn-glass btn-block" @click="leaveOpen = false">Stay here</button><button type="button" class="btn btn-ghost btn-block" @click="leaveStudio()">Leave without saving</button></div>
    </Dialog>
    <Dialog v-model:visible="confirmOpen" :header="pendingExample ? 'Replace your current draft?' : 'Remove this module?'" modal :pt="dialogPt">
      <p class="sheet-lead">{{ pendingExample ? 'The example replaces what you’re editing. Your saved draft stays until you save again.' : 'Its title and description will be removed.' }}</p>
      <template #footer><button type="button" class="btn btn-glass" @click="confirmOpen = false">Keep my work</button><button type="button" class="btn" :class="pendingExample ? 'btn-dark' : 'btn-danger'" @click="confirmChange">{{ pendingExample ? 'Use this example' : 'Remove module' }}</button></template>
    </Dialog>

    <Transition name="toast">
      <div v-if="toast" class="toast glass" :class="`toast-${toastKind}`" role="status" aria-live="polite">
        <StudioIcon :name="toastKind === 'success' ? 'check' : toastKind === 'error' ? 'alert' : 'sparkles'" :size="17" />
        <p>{{ toast }}</p>
        <button type="button" class="icon-btn icon-btn-sm" aria-label="Dismiss notification" @click="toast = ''"><StudioIcon name="close" :size="15" /></button>
      </div>
    </Transition>
  </div>
</template>
