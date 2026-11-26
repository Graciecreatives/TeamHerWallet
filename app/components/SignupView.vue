<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import BrandMark from './BrandMark.vue'
import StudioIcon, { type IconName } from './StudioIcon.vue'
import FloatField from './FloatField.vue'
import { focusOptions, validateProfile, shortAddress, type CreatorProfile } from '#shared/profile'
import { connectFreighter, registerAccount, saveProfile } from '../utils/creator'

const passwordError = ref('')
const emit = defineEmits<{ done: [profile: CreatorProfile & { role?: string }]; back: []; login: [] }>()
const step = ref(0)
const form = reactive<CreatorProfile>({ name: '', email: '', focus: '', walletAddress: '' })
const role = ref<'creator' | 'student'>('creator')
const touched = ref(new Set<number>())
const connecting = ref(false)
const walletMessage = ref('')
const walletNetwork = ref('')
const pasteMode = ref(false)
const pasted = ref('')
const saveError = ref('')
const password = ref('')
const accountBusy = ref(false)
const focusIcons: Record<string, IconName> = { 'Money & budgeting': 'piggy', 'Business & freelancing': 'briefcase', 'Creative skills': 'palette', 'Wellbeing': 'heart', 'Something else': 'sparkles' }

const allErrors = computed(() => validateProfile({ ...form, walletAddress: pasteMode.value ? pasted.value.trim() : form.walletAddress }))
const errors = computed(() => touched.value.has(step.value) ? allErrors.value : {})
const firstName = computed(() => form.name.trim().split(/\s+/)[0] ?? '')

function focusStep(force = false) {
  nextTick(() => {
    const panel = document.querySelector('.auth-step')
    // A completed transition must not steal focus from someone already using the new step.
    if (!force && panel?.contains(document.activeElement)) return
    const invalid = document.querySelector<HTMLElement>('.auth-card [aria-invalid="true"]')
    const target = invalid?.getAttribute('role') === 'radiogroup' ? invalid.querySelector<HTMLElement>('[tabindex="0"]') : invalid
    const heading = document.getElementById('auth-heading')
    ;(target ?? heading)?.focus({ preventScroll: true })
  })
}
function go(target: number) {
  step.value = target
  focusStep()
}
function next() {
  const fields = step.value === 0 ? ['name', 'email'] : step.value === 1 ? ['focus'] : ['walletAddress']
  if (fields.some(key => allErrors.value[key])) {
    touched.value = new Set(touched.value).add(step.value)
    focusStep(true)
    return
  }
  if (step.value === 0 && password.value.length < 12) {
    touched.value = new Set(touched.value).add(step.value)
    passwordError.value = 'Use at least 12 characters.'
    nextTick(() => document.getElementById('signup-password')?.focus())
    return
  }
  passwordError.value = ''
  if (step.value === 2) finish()
  else go(step.value + 1)
}
function back() {
  if (step.value === 0) emit('back')
  else go(step.value - 1)
}
async function connect() {
  connecting.value = true
  walletMessage.value = ''
  const result = await connectFreighter()
  connecting.value = false
  if (result.ok) {
    form.walletAddress = result.address
    walletNetwork.value = result.network
    pasteMode.value = false
  } else walletMessage.value = result.message
}
function selectFocus(event: KeyboardEvent, index: number) {
  const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
  if (!delta && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? focusOptions.length - 1 : (index + delta + focusOptions.length) % focusOptions.length
  form.focus = focusOptions[target]!
  nextTick(() => document.querySelectorAll<HTMLElement>('.choice')[target]?.focus())
}
function disconnect() { form.walletAddress = ''; walletNetwork.value = '' }
async function finish() {
  if (accountBusy.value) return
  saveError.value = ''
  if (pasteMode.value && pasted.value.trim()) form.walletAddress = pasted.value.trim()
  if (pasteMode.value && pasted.value.trim() && allErrors.value.walletAddress) { saveError.value = allErrors.value.walletAddress; return }
  const profile: CreatorProfile = { name: form.name.trim(), email: form.email.trim(), focus: form.focus, walletAddress: form.walletAddress, role: role.value }
  if (password.value.length < 12) { saveError.value = 'Use at least 12 characters for your password.'; go(0); return }
  accountBusy.value = true
  const result = await registerAccount(profile, password.value, role.value)
  accountBusy.value = false
  if (!result.ok) { saveError.value = result.message; return }
  saveError.value = saveProfile(profile) ? '' : ''
  go(3)
}
function skipWallet() { pasteMode.value = false; pasted.value = ''; form.walletAddress = ''; void finish() }
</script>

<template>
  <div class="auth-wrap">
    <header class="auth-header">
      <button type="button" class="brand auth-brand" aria-label="LearnPurse home" @click="emit('back')"><BrandMark /><span>LearnPurse</span></button>
    </header>
    <main class="auth-layout">
      <aside class="auth-context" aria-label="Your creator space">
        <div class="auth-context-photo"><img src="/images/creator-home-960.webp" srcset="/images/creator-home-480.webp 480w, /images/creator-home-960.webp 960w" sizes="(max-width: 900px) 1px, 480px" width="960" height="540" alt="A woman working on her laptop in a bright home workspace" loading="lazy"></div>
        <h2>A space for<br>your next chapter.</h2>
      </aside>
      <div class="auth-form-panel">
    <div class="auth-card glass" style="view-transition-name: journey-panel">
      <div v-if="step < 3" class="auth-top">
        <button type="button" class="icon-btn" :aria-label="step === 0 ? 'Back to home' : 'Previous step'" @click="back"><StudioIcon name="arrowLeft" :size="18" /></button>
        <div class="setup-progress" role="progressbar" aria-label="Signup progress" :aria-valuenow="step + 1" aria-valuemin="1" aria-valuemax="3"><span :style="{ width: `${(step + 1) / 3 * 100}%` }" /></div>
        <span class="auth-count">{{ step + 1 }} of 3</span>
      </div>

      <form novalidate @submit.prevent="next">
        <div :key="step" class="auth-step step-swap">
            <template v-if="step === 0">
              <h1 id="auth-heading" tabindex="-1">Let’s get you set up.</h1>
              <p class="lead">It takes less than a minute.</p>
              <div class="fields">
                <FloatField id="signup-name" v-model="form.name" label="Your name" autocomplete="name" :maxlength="60" :error="errors.name" />
                <FloatField id="signup-email" v-model="form.email" label="Email address" type="email" inputmode="email" autocomplete="email" :maxlength="254" :error="errors.email" />
                <FloatField id="signup-password" v-model="password" label="Create a password" type="password" autocomplete="new-password" :maxlength="200" hint="At least 12 characters." :error="passwordError" />
              </div>
              <div class="choice-grid" role="radiogroup" aria-label="Account type">
                <button v-for="option in ['student', 'creator'] as const" :key="option" type="button" role="radio" class="choice" :aria-checked="role === option" @click="role = option">
                  <StudioIcon :name="option === 'student' ? 'user' : 'palette'" :size="20" />
                  <span>{{ option === 'student' ? 'Learner' : 'Creator' }}</span>
                  <span class="choice-check"><StudioIcon v-if="role === option" name="check" :size="14" /></span>
                </button>
              </div>
              <p v-if="role === 'student'" class="enrol-note">Your learning account keeps your classes and receipts together. For agent-managed purchases, you approve in the app without a wallet popup.</p>
            </template>

            <template v-else-if="step === 1">
              <h1 id="auth-heading" tabindex="-1">{{ role === 'student' ? 'A few details about you.' : 'What will you teach?' }}</h1>
              <p class="lead">Pick what fits best. You can change it later.</p>
              <div class="choice-grid" role="radiogroup" aria-labelledby="auth-heading" :aria-invalid="!!errors.focus">
                <button v-for="(option, index) in focusOptions" :key="option" type="button" role="radio" class="choice" :aria-checked="form.focus === option" :tabindex="form.focus === option || (!form.focus && index === 0) ? 0 : -1" @keydown="selectFocus($event, index)" @click="form.focus = option">
                  <span class="choice-icon"><StudioIcon :name="focusIcons[option]!" :size="20" /></span>
                  <span>{{ option }}</span>
                  <span class="choice-check"><StudioIcon v-if="form.focus === option" name="check" :size="14" /></span>
                </button>
              </div>
              <Transition name="fade"><p v-if="errors.focus" class="field-error"><StudioIcon name="alert" :size="15" />{{ errors.focus }}</p></Transition>
            </template>

            <template v-else-if="step === 2">
              <h1 id="auth-heading" tabindex="-1">Connect your wallet.</h1>
              <p class="lead">{{ role === 'student' ? 'A wallet is optional. Your learning agent creates its own Testnet signing wallet.' : 'Add your public address, or keep creating without one.' }}</p>
              <Transition name="fade" mode="out-in">
                <div v-if="form.walletAddress" key="connected" class="wallet-connected">
                  <span class="chip-icon chip-success"><StudioIcon name="check" :size="16" /></span>
                  <div><strong>{{ shortAddress(form.walletAddress) }}</strong><span>{{ walletNetwork ? `Freighter · ${walletNetwork}` : 'Connected' }}</span></div>
                  <button type="button" class="btn btn-ghost btn-sm" @click="disconnect">Change</button>
                </div>
                <div v-else-if="pasteMode" key="paste" class="fields">
                  <FloatField id="signup-wallet" v-model="pasted" label="Stellar address (G…)" :maxlength="56" :error="errors.walletAddress" hint="Your public address. Never your secret key." optional />
                  <button type="button" class="btn btn-ghost btn-sm" @click="pasteMode = false">Use Freighter instead</button>
                </div>
                <div v-else key="connect" class="wallet-options">
                  <button type="button" class="wallet-button" :disabled="connecting" @click="connect">
                    <span class="wallet-logo"><StudioIcon name="wallet" :size="20" /></span>
                    <span><strong>{{ connecting ? 'Waiting for Freighter…' : 'Connect Freighter' }}</strong><span>Stellar browser wallet</span></span>
                    <span v-if="connecting" class="spinner" aria-hidden="true" /><StudioIcon v-else name="arrowRight" :size="18" />
                  </button>
                  <Transition name="fade"><p v-if="walletMessage" class="wallet-message" role="alert"><StudioIcon name="alert" :size="15" />{{ walletMessage }} <a href="https://www.freighter.app" target="_blank" rel="noopener">Get Freighter<StudioIcon name="external" :size="13" /></a></p></Transition>
                  <button type="button" class="btn btn-ghost btn-sm" @click="pasteMode = true">Paste an address instead</button>
                </div>
              </Transition>
              <p v-if="walletNetwork && walletNetwork !== 'TESTNET'" class="wallet-message">Switch Freighter to Testnet before publishing.</p>
              <p v-if="saveError" class="wallet-message" role="alert"><StudioIcon name="alert" :size="15" />{{ saveError }}</p>
              <p class="fine"><StudioIcon name="shield" :size="14" />We only read your public address. LearnPurse never asks for your secret key.</p>
            </template>

            <template v-else>
              <div class="success">
                <svg class="success-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
                <h1 id="auth-heading" tabindex="-1">Welcome, {{ firstName }}.</h1>
                <p class="lead">{{ role === 'student' ? 'Your learning space is ready. Find a class or talk to your learning assistant.' : 'Your creator space is ready. Let’s build your first course.' }}</p>
                <p v-if="saveError" class="wallet-message" role="alert">{{ saveError }}</p>
              </div>
            </template>
          </div>

        <div class="auth-actions">
          <template v-if="step < 2"><button type="submit" class="btn btn-dark btn-block">Continue<StudioIcon name="arrowRight" :size="18" /></button></template>
          <template v-else-if="step === 2">
            <button type="submit" class="btn btn-dark btn-block" :disabled="connecting || accountBusy">{{ accountBusy ? 'Creating your account…' : 'Create profile' }}</button>
            <button type="button" class="btn btn-ghost btn-block" :disabled="connecting || accountBusy" @click="skipWallet">Skip for now</button>
          </template>
          <button v-else type="button" class="btn btn-dark btn-block" @click="emit('done', { name: form.name.trim(), email: form.email.trim(), focus: form.focus, walletAddress: form.walletAddress, role })">{{ role === 'student' ? 'Open your dashboard' : 'Open studio' }}<StudioIcon name="arrowRight" :size="18" /></button>
        </div>
      </form>
      <button v-if="step < 3" type="button" class="btn btn-ghost btn-block" :disabled="accountBusy" @click="emit('login')">Already have an account? Log in</button>
    </div>
    <p class="auth-foot"><StudioIcon name="lock" :size="16" /><span>Sign in to keep your classes, learning assistant and receipts in one place.</span></p>
      </div>
    </main>
  </div>
</template>
