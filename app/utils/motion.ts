import { nextTick } from 'vue'

let moving = false

/** Preserve spatial continuity without blocking browsers that lack View Transitions. */
export async function transformUi(update: () => void) {
  if (typeof document === 'undefined' || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches || moving) {
    update()
    await nextTick()
    return
  }
  moving = true
  let applied = false
  const apply = async () => {
    if (applied) return
    applied = true
    update()
    await nextTick()
  }
  try {
    const transition = document.startViewTransition(apply)
    await transition.finished
  } catch {
    // Snapshot failures must never prevent the user's action or apply it twice.
    await apply()
  } finally {
    moving = false
  }
}
