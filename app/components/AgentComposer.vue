<script setup lang="ts">
import { nextTick, ref } from 'vue'
import StudioIcon from './StudioIcon.vue'
import MarkdownText from './MarkdownText.vue'
import type { AgentAction } from '#shared/agent'

/**
 * Creator agent chat. Sends the live studio state with every message, receives actions,
 * and hands them to the studio (via applyAction) so the agent edits the real draft.
 */
type Message = { role: 'user' | 'assistant'; text: string; steps?: string[]; publish?: boolean }

const props = defineProps<{
  getState: () => Record<string, unknown>
  applyAction: (action: AgentAction) => string | null
  publish: () => Promise<string | null>
}>()

const input = ref('')
const busy = ref(false)
const messages = ref<Message[]>([])
const suggestions = ref<string[]>([
  'I want to teach beginners forex. $15, 30 students, 4 weeks.',
  'A 4-week bread baking course for $25, up to 12 learners.',
  'A 2-week personal budgeting programme for young women, $10.',
])
const log = ref<HTMLElement | null>(null)
const pendingPublish = ref(false)

async function scrollDown() { await nextTick(); log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' }) }

async function send(text?: string) {
  const message = (text ?? input.value).trim()
  if (!message || busy.value) return
  input.value = ''
  const history = messages.value.slice(-12).map(entry => ({ role: entry.role, content: entry.steps?.length ? `${entry.text}\n[Done: ${entry.steps.join('; ')}]` : entry.text }))
  messages.value.push({ role: 'user', text: message })
  busy.value = true
  pendingPublish.value = false
  void scrollDown()
  try {
    const response = await fetch('/api/agent/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, history, state: props.getState() }) })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.statusMessage ?? 'The agent couldn’t do that.')
    const steps: string[] = []
    let publish = false
    for (const action of body.actions ?? []) {
      if (action.type === 'request_publish') { publish = true; continue }
      const label = props.applyAction(action)
      if (label) steps.push(label)
    }
    messages.value.push({ role: 'assistant', text: body.reply, steps, publish })
    pendingPublish.value = publish
    suggestions.value = body.suggestions?.length ? body.suggestions : suggestions.value
  } catch (failure) {
    messages.value.push({ role: 'assistant', text: (failure as Error).message || 'Something went wrong. Try again, or edit the steps yourself.' })
  } finally {
    busy.value = false
    void scrollDown()
  }
}

async function confirmPublish() {
  pendingPublish.value = false
  busy.value = true
  const result = await props.publish()
  messages.value.push({ role: 'assistant', text: result ?? 'Something stopped the publish. Check the Review step.' })
  busy.value = false
  void scrollDown()
}

defineExpose({ send })
</script>

<template>
  <section class="agent glass" aria-labelledby="agent-title">
    <div class="agent-head">
      <span class="agent-icon"><StudioIcon name="sparkles" :size="20" /></span>
      <div><h2 id="agent-title">Your course agent</h2><p>Tell me what you teach. I’ll build the class, edit lessons, set pricing and style, and publish when you say so.</p></div>
    </div>

    <div v-if="messages.length" ref="log" class="agent-log" aria-live="polite">
      <div v-for="(message, index) in messages" :key="index" class="agent-msg" :class="message.role">
        <p v-if="message.role === 'user'">{{ message.text }}</p>
        <MarkdownText v-else :text="message.text" />
        <ul v-if="message.steps?.length" class="agent-steps">
          <li v-for="(step, stepIndex) in message.steps" :key="stepIndex"><StudioIcon name="check" :size="14" />{{ step }}</li>
        </ul>
        <div v-if="message.publish && pendingPublish && index === messages.length - 1" class="agent-confirm">
          <button type="button" class="btn btn-dark btn-sm" :disabled="busy" @click="confirmPublish">Yes, publish it</button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="pendingPublish = false">Not yet</button>
        </div>
      </div>
      <div v-if="busy" class="agent-msg assistant thinking"><span class="dot" /><span class="dot" /><span class="dot" /></div>
    </div>

    <form class="agent-form" @submit.prevent="send()">
      <label class="sr-only" for="agent-brief">Message the course agent</label>
      <textarea id="agent-brief" v-model="input" rows="2" maxlength="2000" :placeholder="messages.length ? 'Ask for a change, e.g. “add a module on pricing” or “make it 6 weeks”…' : 'I want to teach beginners forex trading for $15, 30 students…'" @keydown.enter.exact.prevent="send()" />
      <button type="submit" class="btn btn-dark" :disabled="busy || !input.trim()">{{ busy ? 'Working…' : 'Send' }}<StudioIcon name="arrowRight" :size="17" /></button>
    </form>
    <div v-if="suggestions.length && !busy" class="agent-prompts">
      <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="send(suggestion)">{{ suggestion }}</button>
    </div>
  </section>
</template>
