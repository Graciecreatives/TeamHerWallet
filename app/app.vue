<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LandingView from './components/LandingView.vue'
import SignupView from './components/SignupView.vue'
import LoginView from './components/LoginView.vue'
import StudioView from './components/StudioView.vue'
import ClassView from './components/ClassView.vue'
import LearningAgentView from './components/LearningAgentView.vue'
import StudentLibraryView from './components/StudentLibraryView.vue'
import type { CreatorProfile } from '#shared/profile'
import { PROFILE_STORAGE_KEY } from '#shared/profile'
import { accountHome, studentSection } from '#shared/account-navigation'
import { saveProfile } from './utils/creator'
import { transformUi } from './utils/motion'

type View = 'landing' | 'signup' | 'login' | 'studio' | 'class' | 'agent' | 'library'
// Class pages are shareable URLs (/class/:id). Learning agents live at /agent and /agent/:id. /login opens sign in. /library is the student account page.
const currentPath = import.meta.server ? useRequestURL().pathname : window.location.pathname
const classId = (() => { const match = currentPath.match(/^\/class\/([a-z0-9-]{6,80})\/?$/); return match ? match[1]! : '' })()
const agentMatch = currentPath.match(/^\/agent(?:\/([a-z0-9-]{8,64}))?\/?$/)
const agentId = agentMatch?.[1] ?? ''
const studentPath = /^\/(?:library|student(?:\/(?:chat|classes|payments|settings|analytics|notifications))?)\/?$/.test(currentPath)
const view = ref<View>(classId ? 'class' : agentMatch ? 'agent' : studentPath ? 'library' : /^\/studio\/?$/.test(currentPath) ? 'studio' : /^\/signup\/?$/.test(currentPath) ? 'signup' : /^\/login\/?$/.test(currentPath) ? 'login' : 'landing')
// The creator studio requires a signed-in account (server session). Students never need one.
const profile = ref<CreatorProfile | null>(null)
const sessionChecked = ref(false)

function show(next: View) {
  if ((view.value === 'class' || view.value === 'agent') && typeof window !== 'undefined') { window.location.assign('/'); return }
  if (next === 'library' || next === 'studio') next = accountHome(profile.value?.role)
  // Only the hero-to-setup handoff uses a shared-element transition. Other swaps are instant.
  const update = () => {
    view.value = next
    if (typeof window !== 'undefined') {
      const path = next === 'library' ? '/student' : next === 'studio' ? '/studio' : next === 'landing' ? '/' : `/${next}`
      window.history.replaceState({}, '', path)
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }
  if (view.value === 'landing' && (next === 'signup' || next === 'login')) void transformUi(update)
  else update()
}
async function start() {
  if (!sessionChecked.value) await checkSession()
  show(profile.value ? accountHome(profile.value.role) : 'signup')
}
function onSignedIn(account: CreatorProfile & { role?: string }) {
  profile.value = account
  saveProfile(account)
  // Auth components emit the server-confirmed role. /auth/me returns { user }, not a bare user.
  show(accountHome(account.role))
}
async function signOut() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch { return }
  try { localStorage.removeItem(PROFILE_STORAGE_KEY) } catch {}
  profile.value = null
  show('landing')
}
async function checkSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' })
    const account = response.ok ? (await response.json()).user : null
    profile.value = account ? { name: account.displayName, email: account.email, focus: account.focus ?? '', walletAddress: account.walletAddress ?? '', role: account.role } : null
    if (!account) try { localStorage.removeItem(PROFILE_STORAGE_KEY) } catch {}
  } catch { profile.value = null }
  sessionChecked.value = true
  // Opening /login (or reloading it) while already signed in goes straight to the studio or student library.
  if (view.value === 'library' && profile.value?.role === 'student') return
  if (view.value === 'studio' && profile.value?.role === 'creator') return
  if (['login', 'library', 'studio'].includes(view.value)) show(accountHome(profile.value?.role))
}
onMounted(checkSession)
</script>

<template>
  <div class="app-bg" aria-hidden="true" />
  <div class="view-stage">
    <LandingView v-if="view === 'landing'" :profile="profile" @start="start" @login="show('login')" />
    <SignupView v-else-if="view === 'signup'" @done="onSignedIn" @back="show('landing')" @login="show('login')" />
    <LoginView v-else-if="view === 'login'" @done="onSignedIn" @back="show('landing')" @signup="show('signup')" />
    <ClassView v-else-if="view === 'class'" :id="classId" @home="show('landing')" />
    <LearningAgentView v-else-if="view === 'agent'" :id="agentId" @home="show('landing')" />
    <div v-else-if="!sessionChecked" class="class-missing" role="status">Opening your account…</div>
    <StudentLibraryView v-else-if="view === 'library' && profile?.role === 'student'" :profile="profile" :initial-section="studentSection(currentPath)" @home="show('landing')" @sign-out="signOut" />
    <StudioView v-else-if="view === 'studio' && profile?.role === 'creator'" :profile="profile" @home="show('landing')" @sign-out="signOut" @signed-out="profile = null; show('login')" />
  </div>
</template>
