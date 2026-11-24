import type { CourseDraft } from './course.ts'

export const DRAFT_STORAGE_KEY = 'learnpurse.course-draft.v1'

export function emptyCourseDraft(): CourseDraft {
  return { title: '', description: '', targetAudience: '', duration: '', priceAmount: '', capacity: '', modules: [{ title: '', description: '' }] }
}

// Incomplete drafts are valid storage records, but are not publishable courses.
export function decodeStoredDraft(raw: string): CourseDraft | null {
  if (raw.length > 500_000) return null
  try {
    const envelope: unknown = JSON.parse(raw)
    if (!envelope || typeof envelope !== 'object' || !('version' in envelope) || envelope.version !== 1 || !('draft' in envelope)) return null
    const draft = envelope.draft
    if (!draft || typeof draft !== 'object') return null
    const fields = ['title', 'description', 'targetAudience', 'duration', 'priceAmount', 'capacity'] as const
    for (const field of fields) {
      if (!(field in draft) || typeof (draft as Record<string, unknown>)[field] !== 'string' || ((draft as Record<string, string>)[field]?.length ?? 0) > 5000) return null
    }
    if (!('modules' in draft) || !Array.isArray(draft.modules) || draft.modules.length < 1 || draft.modules.length > 30) return null
    const modules = []
    for (const module of draft.modules) {
      if (!module || typeof module !== 'object' || typeof module.title !== 'string' || typeof module.description !== 'string' || module.title.length > 100 || module.description.length > 2000) return null
      modules.push({ title: module.title, description: module.description })
    }
    const source = draft as Record<string, string>
    return { title: source.title!, description: source.description!, targetAudience: source.targetAudience!, duration: source.duration!, priceAmount: source.priceAmount!, capacity: source.capacity!, modules }
  } catch {
    return null
  }
}

export function encodeStoredDraft(draft: CourseDraft): string {
  return JSON.stringify({ version: 1, draft })
}
