<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../utils/markdown'

/** Renders AI text as safe, formatted Markdown (headings, lists, bold, links, code, tables). */
const props = defineProps<{ text: string; tag?: string }>()
const html = computed(() => renderMarkdown(props.text ?? ''))
</script>

<template>
  <component :is="tag ?? 'div'" class="md" v-html="html" />
</template>

<style>
.md { line-height: 1.65; overflow-wrap: anywhere; white-space: normal; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md p { margin: 0 0 .6em; }
.md h1, .md h2, .md h3, .md h4 { font-family: 'Outfit Variable', 'Outfit', sans-serif; font-weight: 600; line-height: 1.25; margin: .9em 0 .4em; }
.md h1 { font-size: 1.25em; } .md h2 { font-size: 1.15em; } .md h3, .md h4 { font-size: 1.05em; }
.md ul, .md ol { margin: 0 0 .6em; padding-left: 1.3em; }
.md ul { list-style: disc; } .md ol { list-style: decimal; }
.md li { margin: .2em 0; }
.md li > p { margin: 0; }
.md strong { font-weight: 650; }
.md em { font-style: italic; }
.md a { color: var(--accent, #A31C60); text-decoration: underline; text-underline-offset: 2px; }
.md code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: .88em; background: rgba(163, 28, 96, .08); padding: .1em .35em; border-radius: 5px; }
.md pre { background: #2F1730; color: #fbeef5; padding: .8em 1em; border-radius: 10px; overflow-x: auto; margin: 0 0 .6em; }
.md pre code { background: none; padding: 0; color: inherit; }
.md blockquote { border-left: 3px solid var(--accent, #A31C60); padding-left: .8em; margin: 0 0 .6em; opacity: .9; }
.md hr { border: 0; border-top: 1px solid rgba(0, 0, 0, .1); margin: .8em 0; }
.md table { border-collapse: collapse; margin: 0 0 .6em; font-size: .92em; display: block; overflow-x: auto; }
.md th, .md td { border: 1px solid rgba(0, 0, 0, .12); padding: .35em .6em; text-align: left; }
.md th { font-weight: 600; background: rgba(163, 28, 96, .06); }
.user .md a, .sd-message.user .md a { color: inherit; }
.user .md code, .sd-message.user .md code { background: rgba(255, 255, 255, .18); }
</style>
