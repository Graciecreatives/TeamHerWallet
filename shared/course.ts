export interface CourseDraft {
  title: string
  description: string
  targetAudience: string
  duration: string
  priceAmount: string
  /** An empty string means unlimited enrollment. */
  capacity: string
  modules: Array<{ title: string; description: string }>
}

const MAX_CLASSIC_UNITS = 9_223_372_036_854_775_807n

/** Convert a positive decimal USDC amount to exact seven-decimal base units.
 * No floating point arithmetic, rounding, exponent notation, or whitespace.
 */
export function parseUsdcUnits(amount: string): string | null {
  if (typeof amount !== 'string' || amount.trim() !== amount || !/^[0-9]+(?:\.[0-9]{1,7})?$/.test(amount)) return null

  const [whole = '', fraction = ''] = amount.split('.')
  const normalizedWhole = whole.replace(/^0+/, '') || '0'
  // Reject oversized inputs before constructing an arbitrarily large BigInt.
  if (normalizedWhole.length > 12) return null
  const units = BigInt(normalizedWhole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'))
  return units > 0n && units <= MAX_CLASSIC_UNITS ? units.toString() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate untrusted form/storage input without coercion or mutation.
 * Text limits apply after trimming. Errors use dot paths for module fields.
 */
export function validateCourseDraft(input: unknown): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const draft = isRecord(input) ? input : {}

  function text(value: unknown, key: string, label: string, min: number, max: number): void {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
      errors[key] = `${label} must contain ${min}-${max} characters.`
    }
  }

  text(draft.title, 'title', 'Title', 5, 100)
  text(draft.description, 'description', 'Description', 1, 5000)
  text(draft.targetAudience, 'targetAudience', 'Target audience', 1, 500)
  text(draft.duration, 'duration', 'Duration', 1, 100)

  if (typeof draft.priceAmount !== 'string' || parseUsdcUnits(draft.priceAmount) === null) {
    errors.priceAmount = 'Enter a positive USDC amount with at most 7 decimal places within the Stellar int64 limit.'
  }

  if (typeof draft.capacity !== 'string' ||
      (draft.capacity !== '' && (draft.capacity.length > 10 || draft.capacity.trim() !== draft.capacity || !/^[0-9]+$/.test(draft.capacity) || !/[1-9]/.test(draft.capacity) || BigInt(draft.capacity) > 4_294_967_295n))) {
    errors.capacity = 'Capacity must be empty for unlimited enrollment or a whole number from 1 to 4294967295.'
  }

  if (!Array.isArray(draft.modules) || draft.modules.length < 1 || draft.modules.length > 30) {
    errors.modules = 'Include between 1 and 30 modules.'
  } else {
    // Indexed iteration deliberately checks sparse-array holes as invalid modules.
    for (let index = 0; index < draft.modules.length; index++) {
      const candidate: unknown = draft.modules[index]
      const module = isRecord(candidate) ? candidate : {}
      text(module.title, `modules.${index}.title`, 'Module title', 1, 100)
      text(module.description, `modules.${index}.description`, 'Module description', 1, 2000)
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}
