<script setup lang="ts">
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ArrowUpRight, BookOpen, BriefcaseBusiness, Check, CheckCheck, CircleAlert, CircleHelp, Clock3, Coins, Copy, Download, Eye, GraduationCap, HeartHandshake, Layers3, Lightbulb, LockKeyhole, Mail, Palette, PiggyBank, Plus, Save, ShieldCheck, Sparkles, Trash2, UserRound, Users, Wallet, X, Zap, Ellipsis, PenLine } from '@lucide/vue'

const icons = { arrowLeft: ArrowLeft, arrowRight: ArrowRight, arrowUp: ArrowUp, arrowDown: ArrowDown, external: ArrowUpRight, book: BookOpen, briefcase: BriefcaseBusiness, check: Check, saved: CheckCheck, alert: CircleAlert, help: CircleHelp, clock: Clock3, coins: Coins, copy: Copy, download: Download, eye: Eye, graduation: GraduationCap, heart: HeartHandshake, layers: Layers3, idea: Lightbulb, lock: LockKeyhole, mail: Mail, palette: Palette, piggy: PiggyBank, plus: Plus, save: Save, shield: ShieldCheck, sparkles: Sparkles, trash: Trash2, user: UserRound, users: Users, wallet: Wallet, close: X, zap: Zap, more: Ellipsis, pen: PenLine }
export type IconName = keyof typeof icons
defineProps<{ name: IconName; size?: number }>()
</script>

<template>
  <Transition name="icon-state" mode="out-in"><component :is="icons[name]" :key="name" :size="size ?? 20" :stroke-width="1.9" aria-hidden="true" focusable="false" class="ui-icon" /></Transition>
</template>
