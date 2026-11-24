<script setup lang="ts">
import { computed } from 'vue'
import type { ClassSchedule } from '#shared/classroom'
const props = defineProps<{ modelValue: ClassSchedule }>()
const emit = defineEmits<{ 'update:modelValue': [value: ClassSchedule] }>()
const localStart = computed(() => {
  const date = new Date(props.modelValue.startsAt)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
})
function setLocalStart(value: string) { set('startsAt', value ? new Date(value).toISOString() : '') }
function set(key: keyof ClassSchedule, value: string) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
</script>
<template>
  <fieldset class="classroom-fields">
    <legend>How learners attend your class</legend>
    <label>Class format<select :value="modelValue.mode" @change="set('mode', ($event.target as HTMLSelectElement).value)"><option value="self-paced">Self-paced: start immediately after payment</option><option value="live">Live class: scheduled session with teacher</option></select></label>
    <template v-if="modelValue.mode === 'live'">
      <label>Start date and time (your device's local time)<input type="datetime-local" :value="localStart" @input="setLocalStart(($event.target as HTMLInputElement).value)"></label>
      <p>This time is saved with its UTC offset. Learners see the start time converted to their own local time.</p>
      <label>Class timezone<input type="text" placeholder="Africa/Lagos" :value="modelValue.timezone" @input="set('timezone', ($event.target as HTMLInputElement).value)"></label>
      <label>Private meeting link<input type="url" placeholder="https://meet.google.com/…" :value="modelValue.meetingUrl" @input="set('meetingUrl', ($event.target as HTMLInputElement).value)"></label>
    </template>
    <label>Welcome and joining instructions<textarea rows="4" maxlength="4000" placeholder="What to do after payment, what to bring, class dates or recurring sessions, and how to prepare…" :value="modelValue.instructions" @input="set('instructions', ($event.target as HTMLTextAreaElement).value)" /></label>
    <p>Meeting links and instructions are visible only to enrolled learners. Learners can message you privately after payment.</p>
  </fieldset>
</template>
