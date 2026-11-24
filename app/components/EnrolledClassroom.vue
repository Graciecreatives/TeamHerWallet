<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { emptySchedule } from '#shared/classroom'
import ClassScheduleFields from './ClassScheduleFields.vue'
const props = defineProps<{ id: string; token?: string; teacher?: boolean }>()
const schedule = ref(emptySchedule())
const messages = ref<any[]>([])
const students = ref<string[]>([])
const selectedStudent = ref('')
const message = ref('')
const error = ref('')
const notice = ref('')
const busy = ref(false)
const loaded = ref(false)
const teacherName = ref('your teacher')
const visibleMessages = computed(() => props.teacher ? messages.value.filter(item => item.student === selectedStudent.value) : messages.value)
const startLabel = computed(() => schedule.value.startsAt ? new Date(schedule.value.startsAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short', timeZoneName: undefined }) : '')
function headers(): Record<string, string> { return props.token ? { authorization: `Bearer ${props.token}` } : {} }
async function load() {
  error.value = ''
  try {
    const response = await fetch(`/api/courses/${props.id}/classroom`, { headers: headers() })
    const data = await response.json()
    if (!response.ok) throw new Error(data.statusMessage || 'Could not open the classroom.')
    schedule.value = data.schedule
    messages.value = data.messages
    students.value = data.students ?? []
    if (!selectedStudent.value) selectedStudent.value = students.value[0] ?? ''
    teacherName.value = data.teacherName
    loaded.value = true
  } catch (failure) { error.value = (failure as Error).message }
}
async function send() {
  if (busy.value || !message.value.trim()) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const response = await fetch(`/api/courses/${props.id}/messages`, { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify({ message: message.value, student: selectedStudent.value }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.statusMessage || 'Message could not be sent.')
    message.value = ''; await load(); notice.value = 'Message sent. Refresh this classroom to check for replies.'
  } catch (failure) { error.value = (failure as Error).message } finally { busy.value = false }
}
async function save() {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const response = await fetch(`/api/courses/${props.id}/classroom`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(schedule.value) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.statusMessage || 'Schedule could not be saved.')
    schedule.value = data.schedule; notice.value = 'Schedule and joining instructions updated for all enrolled learners.'
  } catch (failure) { error.value = (failure as Error).message } finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <section class="enrolled-classroom glass" aria-label="Classroom and teacher messages">
    <h2>{{ teacher ? 'Manage classroom' : 'Your classroom' }}</h2>
    <p v-if="!teacher">You’re enrolled. Find your next steps and contact {{ teacherName }} here.</p>
    <template v-if="loaded">
      <template v-if="teacher"><ClassScheduleFields v-model="schedule" /><button type="button" class="btn btn-dark" :disabled="busy" @click="save">Save class schedule</button></template>
      <template v-else>
        <p v-if="schedule.mode === 'live'"><strong>Live class starts:</strong> {{ startLabel }} (your local time). Class timezone: {{ schedule.timezone }}.</p>
        <p v-else><strong>Self-paced class:</strong> start now with the lessons below.</p>
        <div class="classroom-instructions">{{ schedule.instructions || 'Start with the first lesson below. Send your teacher a message if you need help getting started.' }}</div>
        <a v-if="schedule.mode === 'live' && schedule.meetingUrl" class="btn btn-dark" :href="schedule.meetingUrl" target="_blank" rel="noopener noreferrer">Join live class</a>
      </template>
      <h3>{{ teacher ? 'Private learner conversations' : 'Message your teacher' }}</h3>
      <p>This is a private teacher and learner/parent conversation, not a public group chat. Do not share sensitive personal details.</p>
      <label v-if="teacher && students.length">Enrolled learner<select v-model="selectedStudent"><option v-for="student in students" :key="student" :value="student">{{ student.slice(0, 8) }}…{{ student.slice(-6) }}</option></select></label>
      <p v-if="teacher && !students.length">No learners enrolled yet. Paid learners appear here automatically.</p>
      <ol class="classroom-messages"><li v-for="item in visibleMessages" :key="item.id" :class="item.author"><strong>{{ item.author === 'teacher' ? teacherName : 'Learner / parent' }}</strong><time>{{ new Date(item.created_at).toLocaleString() }}</time><p>{{ item.message }}</p></li></ol>
      <p v-if="!visibleMessages.length">No messages yet.</p>
      <form v-if="!teacher || students.length" @submit.prevent="send"><label>Your message<textarea v-model="message" rows="3" maxlength="2000" required placeholder="Ask about preparing for class, share the learner’s preferred name, or ask for help…" /></label><button class="btn btn-dark" :disabled="busy || !message.trim()">{{ busy ? 'Sending…' : 'Send message' }}</button></form>
    </template>
    <p v-if="error" role="alert" class="field-error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <button type="button" class="btn btn-glass" @click="load">Refresh classroom</button>
  </section>
</template>
