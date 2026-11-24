import { randomBytes } from 'node:crypto'
import { cloud, cloudConfigured, cloudMaybe } from './cloud'
import { validateCourseDraft, type CourseDraft } from '#shared/course'
import type { ProductType, ProductDocument } from './documents'
import { isStellarPublicKey } from '#shared/profile'

export interface Enrolment {
  /** Stellar account that paid. */
  student: string
  transaction: string
  network: string
  enrolledAt: string
  /** Bearer token returned once to the student so they can reopen the class. */
  accessToken: string
  paymentNumber?: number
  /** Signed-in student account, when the student has one. Payment history is linked here. */
  userId?: string | null
}

export type PaymentMode = 'single' | 'repeat' | 'installments'

export interface PaymentPolicy {
  mode: PaymentMode
  installments?: number
}

export interface PublishedCourse {
  productType?: ProductType
  document?: ProductDocument
  id: string
  creatorName: string
  payTo: string
  image: string
  /** Optional creator customisation. */
  accent?: string
  tagline?: string
  draft: CourseDraft
  createdAt: string
  enrolments: Enrolment[]
  paymentPolicy?: PaymentPolicy
}

const ID_PATTERN = /^[a-z0-9-]{6,80}$/
const IMAGES = new Set(['creator-home', 'creator-workspace', 'pottery'])
const ACCENT = /^#[0-9a-f]{6}$/i

/** Built-in cover name, or an https image URL hosted on the configured LearnPurse R2 image Worker. */
export function cleanImage(image: unknown): string {
  if (typeof image !== 'string') return 'creator-home'
  if (IMAGES.has(image)) return image
  const base = String(useRuntimeConfig().imageUploadUrl || '').replace(/\/+$/, '')
  if (base && image.startsWith(`${base}/covers/`) && /^[a-z0-9:/._-]{10,300}$/i.test(image)) return image
  return 'creator-home'
}

function store() { return useStorage('courses') }

function slug(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'class'
}

export function isCourseId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id)
}

/** Seats left, or null for unlimited enrolment. */
export function seatsLeft(course: PublishedCourse): number | null {
  const students = new Set(course.enrolments.map(enrolment => enrolment.student)).size
  return course.draft.capacity ? Math.max(Number(course.draft.capacity) - students, 0) : null
}

export function paymentPolicy(course: PublishedCourse): PaymentPolicy {
  const policy = course.paymentPolicy
  if (!policy || !['single', 'repeat', 'installments'].includes(policy.mode)) return { mode: 'single' }
  return policy.mode === 'installments' ? { mode: 'installments', installments: Math.max(2, Math.min(12, Math.floor(policy.installments ?? 2))) } : { mode: policy.mode }
}

/** Public listing: lesson titles are visible, lesson content is not, and payer addresses are omitted. */
export function publicCourse(course: PublishedCourse) {
  return {
    productType: course.productType ?? 'class',
    document: course.document ? { name: course.document.name, size: course.document.size } : null,
    id: course.id,
    creatorName: course.creatorName,
    payTo: course.payTo,
    image: course.image,
    accent: course.accent ?? '',
    tagline: course.tagline ?? '',
    title: course.draft.title,
    description: course.draft.description,
    targetAudience: course.draft.targetAudience,
    duration: course.draft.duration,
    priceAmount: course.draft.priceAmount,
    capacity: course.draft.capacity,
    modules: course.draft.modules.map(module => ({ title: module.title })),
    enrolled: course.enrolments.length,
    seatsLeft: seatsLeft(course),
    createdAt: course.createdAt,
    paymentPolicy: paymentPolicy(course),
  }
}

export async function createCourse(input: { classroom?: unknown; productType?: ProductType; document?: ProductDocument; draft?: unknown; creatorName?: unknown; payTo?: unknown; image?: unknown; paymentPolicy?: unknown; accent?: unknown; tagline?: unknown; creatorId?: string }): Promise<{ course?: PublishedCourse; error?: string }> {
  const { valid } = validateCourseDraft(input.draft)
  if (!valid) return { error: 'The course has missing or invalid details. Review it in the studio first.' }
  if (!isStellarPublicKey(input.payTo)) return { error: 'Add a valid Stellar wallet address to receive payments.' }
  const draft = input.draft as CourseDraft
  const requestedPolicy = input.paymentPolicy as Partial<PaymentPolicy> | undefined
  const mode = requestedPolicy?.mode === 'repeat' || requestedPolicy?.mode === 'installments' ? requestedPolicy.mode : 'single'
  const policy: PaymentPolicy = mode === 'installments' ? { mode, installments: Math.max(2, Math.min(12, Math.floor(Number(requestedPolicy?.installments) || 2))) } : { mode }
  const course: PublishedCourse = {
    productType: input.productType ?? 'class',
    document: input.document,
    id: `${slug(draft.title)}-${randomBytes(3).toString('hex')}`,
    creatorName: typeof input.creatorName === 'string' && input.creatorName.trim() ? input.creatorName.trim().slice(0, 80) : 'A LearnPurse creator',
    payTo: input.payTo,
    image: cleanImage(input.image),
    accent: typeof input.accent === 'string' && ACCENT.test(input.accent) ? input.accent.toLowerCase() : undefined,
    tagline: typeof input.tagline === 'string' && input.tagline.trim() ? input.tagline.trim().slice(0, 120) : undefined,
    draft: {
      title: draft.title.trim(), description: draft.description.trim(), targetAudience: draft.targetAudience.trim(), duration: draft.duration.trim(),
      priceAmount: draft.priceAmount, capacity: draft.capacity,
      modules: draft.modules.map(module => ({ title: module.title.trim(), description: module.description.trim() })),
    },
    createdAt: new Date().toISOString(),
    enrolments: [],
    paymentPolicy: policy,
  }
  if (cloudConfigured()) await cloud('/courses', { method: 'POST', body: { ...course, creatorId: input.creatorId ?? null, classroom: input.classroom } })
  else await store().setItem(course.id, course)
  return { course }
}

export async function getCourse(id: string): Promise<PublishedCourse | null> {
  if (!isCourseId(id)) return null
  if (cloudConfigured()) return cloudMaybe<PublishedCourse>(`/courses/${id}`)
  return (await store().getItem<PublishedCourse>(id)) ?? null
}

export async function listCourses(payTo?: string): Promise<PublishedCourse[]> {
  if (cloudConfigured()) return cloud<PublishedCourse[]>('/courses', { query: payTo ? { payTo } : undefined })
  const keys = await store().getKeys()
  const courses = await Promise.all(keys.map(key => store().getItem<PublishedCourse>(key)))
  return courses.filter((course): course is PublishedCourse => !!course && (!payTo || course.payTo === payTo)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Serialise writes per course so two concurrent settlements cannot both take the last seat.
const locks = new Map<string, Promise<unknown>>()
export async function withCourseLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(task)
  locks.set(id, next)
  try { return await next } finally { if (locks.get(id) === next) locks.delete(id) }
}

export function findEnrolment(course: PublishedCourse, by: { student?: string; token?: string }): Enrolment | undefined {
  return course.enrolments.find(enrolment => (by.student && enrolment.student === by.student) || (by.token && enrolment.accessToken === by.token))
}

export function newAccessToken(): string { return randomBytes(24).toString('base64url') }

/** Protected content, only returned to enrolled students. */
export function classroom(course: PublishedCourse, enrolment: Enrolment) {
  return {
    course: publicCourse(course),
    modules: course.draft.modules,
    enrolment: { student: enrolment.student, transaction: enrolment.transaction, network: enrolment.network, enrolledAt: enrolment.enrolledAt },
    accessToken: enrolment.accessToken,
  }
}

export async function recordEnrolment(id: string, enrolment: Enrolment): Promise<PublishedCourse | null> {
  // D1 checks seats and inserts atomically, and rejects a transaction hash that was already recorded.
  if (cloudConfigured()) return cloud<PublishedCourse>(`/courses/${id}/enrolments`, { method: 'POST', body: enrolment })
  const course = await getCourse(id)
  if (!course) return null
  course.enrolments.push(enrolment)
  await store().setItem(id, course)
  return course
}
