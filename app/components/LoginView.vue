<script setup lang="ts">
import { ref } from 'vue'
import BrandMark from './BrandMark.vue'
import StudioIcon from './StudioIcon.vue'
import FloatField from './FloatField.vue'
import type { CreatorProfile } from '#shared/profile'

// Creator sign in. Sessions are httpOnly cookies backed by Cloudflare D1.
const emit = defineEmits<{ done: [profile: CreatorProfile & { role?: string }]; signup: []; back: [] }>()
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) { error.value = 'Enter your email and password.'; return }
  busy.value = true
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.value.trim(), password: password.value }) })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.statusMessage ?? 'Sign in failed.')
    const user = body.user
    emit('done', { name: user.displayName, email: user.email, focus: user.focus ?? '', walletAddress: user.walletAddress ?? '', role: user.role ?? undefined })
  } catch (failure) {
    error.value = (failure as Error).message
  } finally { busy.value = false }
}
</script>

<template>
  <div class="auth-wrap">
    <header class="auth-header">
      <button type="button" class="brand auth-brand" aria-label="LearnPurse home" @click="emit('back')"><BrandMark /><span>LearnPurse</span></button>
    </header>
    <main class="auth-layout">
      <aside class="auth-context" aria-label="Your creator space">
        <div class="auth-context-photo"><img src="/images/creator-home-960.webp" width="960" height="540" alt="A woman working on her laptop in a bright home workspace" loading="lazy"></div>
        <h2>Welcome<br>back.</h2>
      </aside>
      <div class="auth-form-panel">
        <div class="auth-card glass">
          <form novalidate class="login-form" @submit.prevent="submit">
            <h1 id="auth-heading">Welcome back.</h1>
            <p class="lead">Enter your email and password to open your account: your classes, your agent and your payment history are waiting.</p>
            <div class="fields">
              <FloatField id="login-email" v-model="email" label="Email address" type="email" inputmode="email" autocomplete="email" :maxlength="254" />
              <FloatField id="login-password" v-model="password" label="Password" type="password" autocomplete="current-password" :maxlength="200" />
            </div>
            <p v-if="error" class="field-error" role="alert"><StudioIcon name="alert" :size="15" />{{ error }}</p>
            <div class="auth-actions">
              <button type="submit" class="btn btn-dark btn-block" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}<StudioIcon v-if="!busy" name="arrowRight" :size="18" /></button>
              <button type="button" class="btn btn-ghost btn-block" @click="emit('signup')">New here? Sign up (student or creator)</button>
            </div>
          </form>
        </div>
        <p class="auth-foot"><StudioIcon name="lock" :size="16" /><span>Students never need an account. They pay with a Stellar wallet.</span></p>
      </div>
    </main>
  </div>
</template>
