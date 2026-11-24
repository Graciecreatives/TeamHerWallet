<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import Dialog from 'primevue/dialog'
import BrandMark from './BrandMark.vue'
import StudioIcon from './StudioIcon.vue'
import CoursePreview from './CoursePreview.vue'
import { courseShowcases, landingQuestions } from '#shared/landing'
import type { CreatorProfile } from '#shared/profile'
import { transformUi } from '../utils/motion'

defineProps<{ profile: CreatorProfile | null }>()
const emit = defineEmits<{ start: []; login: [] }>()
const selected = ref<(typeof courseShowcases)[number] | null>(null)
const previewOpen = ref(false)
const sheetImage = ref<HTMLImageElement | null>(null)
const openQuestion = ref<number | null>(null)
const demoStep = ref(0)
const activeNav = ref(0)
const creatorChoiceOpen = ref(false)
function chooseCreator() { creatorChoiceOpen.value = true }
const navigation = [{ label: 'Choose your path', target: 'audiences', icon: 'user' }, { label: 'How it works', target: 'how', icon: 'sparkles' }, { label: 'For creators', target: 'features', icon: 'layers' }, { label: 'FAQ', target: 'questions', icon: 'help' }] as const
const scrolled = ref(false)
const menuOpen = ref(false)
function onScroll() { scrolled.value = window.scrollY > 12 }
let observer: IntersectionObserver | undefined
const sheetPt = { mask: { class: 'sheet-mask' }, root: { class: 'sheet course-sheet' }, header: { class: 'sheet-header' }, title: { class: 'sheet-title' }, content: { class: 'sheet-content' }, footer: { class: 'sheet-footer' } }
async function preview(course: (typeof courseShowcases)[number]) {
  selected.value = course
  await nextTick()
  void transformUi(() => { previewOpen.value = true })
}
function closePreview() {
  void transformUi(() => {
    // PrimeVue retains the leaving dialog during its exit animation. Release
    // its shared name after the old snapshot, before the card reclaims it.
    sheetImage.value?.style.removeProperty('view-transition-name')
    previewOpen.value = false
  })
}
function selectDemo(index: number) {
  demoStep.value = (index + 3) % 3
  nextTick(() => document.getElementById(`demo-tab-${demoStep.value}`)?.focus())
}
function jump(index: number) {
  activeNav.value = index
  menuOpen.value = false
  document.getElementById(navigation[index]!.target)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
}
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const index = navigation.findIndex(item => item.target === entry.target.id)
      if (index >= 0) activeNav.value = index
    }
  }, { rootMargin: '-15% 0px -55% 0px', threshold: 0 })
  for (const item of navigation) { const el = document.getElementById(item.target); if (el) observer.observe(el) }
})
onUnmounted(() => { observer?.disconnect(); window.removeEventListener('scroll', onScroll) })
const journey = [
  { who: 'The family', icon: 'user', title: 'Set the goal and the rules.', text: '“Ada, 9, wants to speak Yoruba with her grandma. Up to 5 USDC a class, 6 in total. Ask me above 3.”' },
  { who: 'Soroban purse', icon: 'wallet', title: 'The budget is locked on-chain.', text: 'LearnPurse deploys a learning purse on Stellar. The contract holds the USDC and enforces your limits. The AI never holds it.' },
  { who: 'The learning agent', icon: 'sparkles', title: 'It chooses, and says why.', text: 'The AI compares every class made by women creators and picks what fits. If nothing does, it asks creators to make one.' },
  { who: 'Stellar x402', icon: 'zap', title: 'It pays by itself.', text: 'The purse releases exactly one class price, then the agent pays the creator over x402. Big buys wait for your OK.' },
  { who: 'Women creators', icon: 'check', title: 'She learns. She gets paid.', text: 'The class unlocks for the learner, and the USDC lands straight in the creator’s own wallet. Every step has a Stellar receipt.' },
] as const
</script>

<template>
  <div class="landing">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="topbar" :class="{ scrolled, open: menuOpen }">
      <div class="topbar-inner">
        <a class="brand" href="#main-content" aria-label="LearnPurse home"><BrandMark /><span>LearnPurse</span></a>
        <nav class="topbar-links" aria-label="Main">
          <button v-for="(item, index) in navigation" :key="item.target" type="button" :aria-current="activeNav === index ? 'location' : undefined" @click="jump(index)">{{ item.label }}</button>
        </nav>
        <div class="topbar-actions">
          <button v-if="!profile" type="button" class="btn btn-ghost header-login" @click="emit('login')">Sign in</button>
          <button type="button" class="btn btn-dark header-start" @click="profile ? emit('start') : chooseCreator()">{{ profile?.role === 'student' ? 'My dashboard' : profile ? 'Open studio' : 'For creators' }}<StudioIcon name="arrowRight" :size="17" /></button>
          <button type="button" class="topbar-menu" :aria-expanded="menuOpen" aria-controls="topbar-sheet" aria-label="Menu" @click="menuOpen = !menuOpen"><StudioIcon :name="menuOpen ? 'close' : 'more'" :size="22" /></button>
        </div>
      </div>
      <nav v-show="menuOpen" id="topbar-sheet" class="topbar-sheet" aria-label="Sections">
        <button v-for="(item, index) in navigation" :key="item.target" type="button" @click="jump(index)"><StudioIcon :name="item.icon" :size="18" />{{ item.label }}</button>
      </nav>
    </header>

    <main id="main-content">
      <section class="editorial-hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="hero-eyebrow"><StudioIcon name="sparkles" :size="16" />AI-powered learning · Stellar Testnet</p>
          <h1 id="hero-title">Learn more.<br>Let your agent pay.</h1>
          <p class="editorial-lead">Tell your AI agent what you want to learn and set a budget. It finds suitable classes, asks before bigger purchases, and pays creators directly. Women turn their knowledge into income. You stay in control of every spending limit.</p>
          <div class="editorial-actions">
            <a class="btn btn-dark btn-lg journey-start" href="/signup">Sign up as a student or creator<StudioIcon name="arrowRight" :size="20" /></a>
            <a class="text-link" href="#how" @click.prevent="jump(1)">See how it works</a>
          </div>
          <button type="button" class="agent-entry" @click="chooseCreator()"><StudioIcon name="graduation" :size="17" />Want to teach? Create a class with AI<StudioIcon name="arrowRight" :size="16" /></button>
        </div>
        <div class="hero-window glass" style="view-transition-name: journey-panel">
          <figure class="hero-photograph">
            <img src="/images/creator-workspace-1200.webp" srcset="/images/creator-workspace-640.webp 640w, /images/creator-workspace-1200.webp 1200w" sizes="(max-width: 760px) calc(100vw - 64px), (max-width: 1240px) 44vw, 504px" width="1200" height="1800" alt="A creator working beside a sunlit café window" fetchpriority="high">
          </figure>
          <div class="hero-chat" aria-label="Example of a learning agent at work">
            <p class="chat-bubble chat-creator">Ada, 9, wants to speak Yoruba with her grandma. Up to 5 USDC a class, 6 in total. Ask me above 3.</p>
            <div class="chat-bubble chat-agent">
              <span class="chat-agent-label"><StudioIcon name="sparkles" :size="14" />Learning agent</span>
              <strong>Yoruba for Kids Abroad</strong>
              <span class="chat-facts"><span>2 USDC</span><span>Purse released</span><span>Paid via x402</span></span>
              <span class="chat-ready"><StudioIcon name="check" :size="14" />Enrolled · creator paid on Stellar</span>
            </div>
          </div>
        </div>
      </section>

      <section id="audiences" class="story-section audience-section" aria-labelledby="audiences-title">
        <div class="section-intro"><h2 id="audiences-title">Here to learn or teach?</h2><p>Two different paths. Students never need a creator account. Choose the one that fits you.</p></div>
        <div class="audience-grid">
          <article class="audience-card glass">
            <span class="audience-label">For students, parents and sponsors</span><h3>I want to learn</h3>
            <p>Tell an agent your learning goal, who the classes are for, and how much it can spend.</p>
            <ul><li>Your agent compares classes and explains its choices.</li><li>A Stellar purse enforces your budget and approval threshold.</li><li>No match? It requests a class and suggests free resources.</li><li>Already have a class link? Open it and pay with Freighter, no account needed.</li></ul>
            <a class="btn btn-dark" href="/agent">I'm a learner<StudioIcon name="arrowRight" :size="18" /></a>
            <p class="audience-note">No creator signup. Keep your private agent link safe.</p>
          </article>
          <article class="audience-card glass">
            <span class="audience-label">For teachers and women creators</span><h3>I want to teach</h3>
            <p>Turn your knowledge into a class that students and learning agents can buy.</p>
            <ul><li>Create a creator account and add your payout wallet.</li><li>Use AI to write your class, then edit every lesson.</li><li>Upload your own class image and set your price.</li><li>Publish a class link and receive payments directly.</li></ul>
            <button type="button" class="btn btn-glass" @click="chooseCreator()">I'm a creator<StudioIcon name="arrowRight" :size="18" /></button>
            <p class="audience-note">Creator signup is only for people publishing classes.</p>
          </article>
        </div>
      </section>

      <section id="how" class="story-section journey-section" aria-labelledby="how-title">
        <div class="section-intro"><h2 id="how-title">One goal in.<br>Classes paid, safely.</h2><p>An agent that spends for learning on its own, but only inside rules a contract on Stellar can prove. No card, no invoices, no middleman.</p></div>
        <ol class="journey">
          <li v-for="(step, index) in journey" :key="step.who" class="journey-step glass">
            <span class="journey-num">{{ index + 1 }}</span>
            <span class="journey-icon"><StudioIcon :name="step.icon" :size="22" /></span>
            <p class="journey-who">{{ step.who }}</p>
            <h3>{{ step.title }}</h3>
            <p>{{ step.text }}</p>
          </li>
        </ol>
      </section>

      <section id="features" class="story-section studio-story" aria-labelledby="studio-title">
        <div class="story-copy"><h2 id="studio-title">An assistant that<br>runs the busywork.</h2><p>Describe your class the way you’d tell a friend. The assistant turns it into a structured course with a clear promise, ordered lessons, a price and a class limit, then hands it to you to adjust and publish.</p><button type="button" class="btn btn-dark btn-lg" @click="chooseCreator()">Try the assistant<StudioIcon name="arrowRight" :size="19" /></button></div>
        <div class="studio-demonstration glass" aria-label="Interactive example of the course assistant">
          <div class="demo-tabs" role="tablist" aria-label="Explore the assistant" :style="{ '--active': demoStep }"><span class="demo-tab-selection" aria-hidden="true" /><button v-for="(tab, index) in ['You say', 'It builds', 'You publish']" :id="`demo-tab-${index}`" :key="tab" type="button" role="tab" :aria-selected="demoStep === index" :aria-controls="`demo-panel-${index}`" :tabindex="demoStep === index ? 0 : -1" @click="demoStep = index" @keydown.right.prevent="selectDemo(index + 1)" @keydown.left.prevent="selectDemo(index - 1)" @keydown.home.prevent="selectDemo(0)" @keydown.end.prevent="selectDemo(2)">{{ tab }}</button></div>
          <div class="demo-stage">
            <div v-show="demoStep === 0" id="demo-panel-0" role="tabpanel" aria-labelledby="demo-tab-0" class="demo-panel"><StudioIcon name="pen" :size="28" /><h3>Just describe it.</h3><div class="demo-input"><span>Your message</span><strong>A 2-week beginner forex programme, $15, 30 students.</strong></div><p>Subject, price, class size and length, in your own words.</p></div>
            <div v-show="demoStep === 1" id="demo-panel-1" role="tabpanel" aria-labelledby="demo-tab-1" class="demo-panel"><h3>Lessons, planned.</h3><ol class="demo-lessons"><li><span>1</span><strong>Welcome to forex trading</strong><StudioIcon name="check" :size="18" /></li><li><span>2</span><strong>The core foundations</strong><StudioIcon name="check" :size="18" /></li><li><span>3</span><strong>Guided practice</strong><StudioIcon name="check" :size="18" /></li></ol><p>Edit, reorder or rewrite anything before it goes live.</p></div>
            <div v-show="demoStep === 2" id="demo-panel-2" role="tabpanel" aria-labelledby="demo-tab-2" class="demo-panel demo-result"><span class="demo-course-icon"><StudioIcon name="zap" :size="32" /></span><h3>Live, with a<br>payment page.</h3><p>15 USDC · 30 places · paid to your wallet.</p><span class="demo-ready"><StudioIcon name="check" :size="18" />Ready to share</span></div>
          </div>
        </div>
      </section>

      <section id="courses" class="story-section courses-section" aria-labelledby="courses-title">
        <div class="section-intro"><h2 id="courses-title">What could you teach?</h2><p>Money skills, a craft, your business know-how. Turn it into a class, a paid PDF guide, or a bundle with both.</p></div>
        <div class="showcase-grid">
          <article v-for="course in courseShowcases" :key="course.id" class="showcase glass">
            <button type="button" class="showcase-photo" :aria-label="`Preview ${course.draft.title}`" @click="preview(course)">
              <img :src="`/images/${course.image}-${course.image === 'creator-workspace' ? '640' : '960'}.webp`" :srcset="course.image === 'creator-workspace' ? '/images/creator-workspace-640.webp 640w, /images/creator-workspace-1200.webp 1200w' : `/images/${course.image}-480.webp 480w, /images/${course.image}-960.webp 960w`" sizes="(max-width: 760px) calc(100vw - 64px), (max-width: 1240px) 30vw, 360px" :width="course.image === 'creator-workspace' ? 640 : 960" :height="course.image === 'creator-home' ? 540 : course.image === 'pottery' ? 1440 : 960" :alt="course.alt" :style="{ viewTransitionName: selected?.id === course.id && !previewOpen ? 'course-image' : undefined }" loading="lazy" decoding="async">
            </button>
            <div class="showcase-info"><h3>{{ course.draft.title }}</h3><p>{{ course.draft.modules.length }} lessons · {{ course.draft.priceAmount }} USDC</p><button type="button" class="showcase-open" :aria-label="`See outline for ${course.draft.title}`" @click="preview(course)">See the class<StudioIcon name="external" :size="19" /></button></div>
          </article>
        </div>
      </section>

      <section id="payments" class="story-section wallet-story" aria-labelledby="wallet-title">
        <div class="wallet-diagram">
          <ol class="x402-flow glass" aria-label="x402 payment flow">
            <li><span class="x402-code">GET</span>Student opens the class</li>
            <li><span class="x402-code x402-warn">402</span>Price, asset and your wallet returned</li>
            <li><span class="x402-code">SIGN</span>Her wallet approves the exact USDC</li>
            <li><span class="x402-code x402-ok">200</span>Settled on Stellar. Access granted.</li>
          </ol>
        </div>
        <div class="story-copy"><h2 id="wallet-title">Paid directly.<br>Enrolled automatically.</h2><p>Every class, PDF guide and bundle uses an x402-protected payment link. After the payment settles on Stellar straight to your wallet, LearnPurse unlocks the lessons or the buyer’s private PDF download.</p><p>No card processor, no payout delays and no account holding your money. Your keys stay yours.</p></div>
      </section>

      <section id="questions" class="story-section questions-section" aria-labelledby="questions-title"><h2 id="questions-title">Good questions.</h2><div class="question-list"><article v-for="(item, index) in landingQuestions" :key="item.question" class="question" :class="{ open: openQuestion === index }"><h3><button :id="`question-${index}`" type="button" :aria-expanded="openQuestion === index" :aria-controls="`answer-${index}`" @click="openQuestion = openQuestion === index ? null : index"><span>{{ item.question }}</span><span class="question-toggle"><StudioIcon name="plus" :size="20" /></span></button></h3><div :id="`answer-${index}`" role="region" :aria-labelledby="`question-${index}`" class="question-answer" :inert="openQuestion !== index" :aria-hidden="openQuestion !== index"><div><p>{{ item.answer }}</p></div></div></article></div></section>

      <section class="closing-section"><h2>Your goal.<br>Your budget. Your choice.</h2><div class="editorial-actions"><a class="btn btn-dark btn-lg" href="/agent">I want to learn<StudioIcon name="arrowRight" :size="20" /></a><button type="button" class="btn btn-glass btn-lg" @click="chooseCreator()">I want to teach</button></div></section>
    </main>

    <footer class="site-footer"><a class="brand" href="#main-content"><BrandMark /><span>LearnPurse</span></a><p>Runs on Stellar Testnet with Testnet USDC.<br>Illustrative photography, not customer endorsements.</p></footer>
    <Dialog :visible="creatorChoiceOpen" modal dismissable-mask header="This is the creator studio" :pt="sheetPt" @update:visible="creatorChoiceOpen = $event">
      <p class="sheet-lead">This path is for people who want to create and sell classes, PDF guides or class + PDF bundles. You'll sign in or create a creator account.</p>
      <p>Looking for a class for yourself or someone else? Use the learner path instead. You don't need a creator account.</p>
      <template #footer><a class="btn btn-glass" href="/agent">I'm here to learn</a><button type="button" class="btn btn-dark" @click="creatorChoiceOpen = false; emit('start')">Continue as a creator</button></template>
    </Dialog>
    <Dialog :visible="previewOpen" modal dismissable-mask header="Inside the course" :pt="sheetPt" @update:visible="closePreview">
      <img v-if="selected" ref="sheetImage" class="sheet-photo" :src="`/images/${selected.image}-${selected.image === 'creator-workspace' ? '1200' : '960'}.webp`" :alt="selected.alt" :style="{ viewTransitionName: previewOpen ? 'course-image' : undefined }">
      <p class="sheet-lead">A sample course to inspire your own.</p>
      <CoursePreview v-if="selected" :draft="selected.draft" creator="An example creator" :image="selected.image" expanded />
      <template #footer><button type="button" class="btn btn-glass" @click="closePreview">Keep exploring</button><button type="button" class="btn btn-dark" @click="previewOpen = false; chooseCreator()">Create your own</button></template>
    </Dialog>
  </div>
</template>
