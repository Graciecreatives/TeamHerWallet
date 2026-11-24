<script setup lang="ts">
import { computed } from 'vue'
import type { CourseDraft } from '#shared/course'
import { parseUsdcUnits } from '#shared/course'
import StudioIcon from './StudioIcon.vue'

const props = defineProps<{ draft: CourseDraft; creator?: string; expanded?: boolean; image?: string; accent?: string; tagline?: string }>()
const cover = computed(() => props.image || 'creator-home')
const coverSrc = computed(() => cover.value.startsWith('http') ? cover.value : cover.value === 'creator-workspace' ? '/images/creator-workspace-640.webp' : `/images/${cover.value}-480.webp`)
const accentStyle = computed(() => props.accent ? { '--accent': props.accent, '--accent-ink': props.accent } : undefined)
const title = computed(() => props.draft.title.trim() || 'Your course title')
const price = computed(() => parseUsdcUnits(props.draft.priceAmount) ? props.draft.priceAmount : '0')
</script>

<template>
  <article class="course-card" :class="{ expanded }" :style="accentStyle">
    <div class="course-cover" aria-hidden="true">
      <img class="cover-photo" :src="coverSrc" alt="" loading="lazy" decoding="async">
      <span class="cover-tag"><StudioIcon name="clock" :size="13" />{{ draft.duration.trim() || 'Self-paced' }}</span>
      <span class="cover-title">{{ title }}</span>
    </div>
    <div class="course-body">
      <p class="course-by">by {{ creator || 'You' }}</p>
      <h3>{{ title }}</h3>
      <p v-if="tagline" class="course-tagline">{{ tagline }}</p>
      <p class="course-desc">{{ draft.description.trim() || 'Describe what learners will be able to do by the end.' }}</p>
      <ul class="course-meta">
        <li><StudioIcon name="layers" :size="15" />{{ draft.modules.length }} {{ draft.modules.length === 1 ? 'module' : 'modules' }}</li>
        <li v-if="draft.capacity"><StudioIcon name="users" :size="15" />{{ draft.capacity }} places</li>
      </ul>
      <ol v-if="expanded" class="course-modules">
        <li v-for="(module, index) in draft.modules" :key="index"><span>{{ index + 1 }}</span><div><strong>{{ module.title || 'Untitled module' }}</strong><p v-if="module.description">{{ module.description }}</p></div></li>
      </ol>
      <div class="course-buy">
        <div class="course-price"><strong>{{ price }}</strong><span>USDC</span></div>
        <span class="btn btn-dark btn-sm" aria-hidden="true">Enroll</span>
      </div>
    </div>
    <p class="course-draft"><StudioIcon name="lock" :size="13" />Draft preview · Not published</p>
  </article>
</template>
