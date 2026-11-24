<script setup lang="ts">
import { computed } from 'vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import StudioIcon from './StudioIcon.vue'

const model = defineModel<string>({ required: true })
const props = defineProps<{
  id: string
  label: string
  error?: string
  hint?: string
  multiline?: boolean
  rows?: number
  maxlength?: number
  inputmode?: 'text' | 'decimal' | 'numeric' | 'email'
  type?: string
  autocomplete?: string
  optional?: boolean
  suffix?: string
  counter?: boolean
}>()
const describedBy = computed(() => props.error ? `${props.id}-error` : props.hint ? `${props.id}-hint` : undefined)
</script>

<template>
  <div class="field" :class="{ 'has-error': !!error, 'has-suffix': !!suffix, 'is-multiline': multiline }">
    <div class="field-control">
      <Textarea v-if="multiline" :id="id" v-model="model" :rows="rows ?? 4" :maxlength="maxlength" placeholder=" " :aria-required="optional ? undefined : 'true'" :aria-invalid="!!error" :aria-describedby="describedBy" />
      <InputText v-else :id="id" v-model="model" :type="type ?? 'text'" :inputmode="inputmode" :autocomplete="autocomplete ?? 'off'" :maxlength="maxlength" placeholder=" " :aria-required="optional ? undefined : 'true'" :aria-invalid="!!error" :aria-describedby="describedBy" />
      <label :for="id">{{ label }}<span v-if="optional" class="field-optional"> · Optional</span></label>
      <span v-if="suffix" class="field-suffix" aria-hidden="true">{{ suffix }}</span>
    </div>
    <div v-if="error || hint || counter" class="field-meta">
      <Transition name="fade" mode="out-in">
        <p v-if="error" :id="`${id}-error`" :key="error" class="field-error"><StudioIcon name="alert" :size="15" />{{ error }}</p>
        <p v-else-if="hint" :id="`${id}-hint`" class="field-hint">{{ hint }}</p>
      </Transition>
      <span v-if="counter && maxlength" class="field-count">{{ model.length }}/{{ maxlength }}</span>
    </div>
  </div>
</template>
