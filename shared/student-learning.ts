export interface LearningProgress { courseId: string; moduleIndex: number; completedAt: string }
export function learningAnalytics(courses: { id: string; modules: unknown[] }[], progress: LearningProgress[], amounts: number[], now = new Date()) {
  const valid = progress.filter(entry => courses.some(course => course.id === entry.courseId && Number.isInteger(entry.moduleIndex) && entry.moduleIndex >= 0 && entry.moduleIndex < course.modules.length))
  const totalModules = courses.reduce((sum, course) => sum + course.modules.length, 0)
  const days = new Set(valid.map(entry => entry.completedAt.slice(0, 10)))
  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now)
    day.setUTCDate(day.getUTCDate() - (6 - index))
    const date = day.toISOString().slice(0, 10)
    return { date, count: valid.filter(entry => entry.completedAt.slice(0, 10) === date).length }
  })
  return { enrolledClasses: courses.length, completedModules: valid.length, totalModules, completionPercent: totalModules ? Math.round(valid.length / totalModules * 100) : 0, studyDays: days.size, weeklyActivity, totalSpent: amounts.reduce((sum, amount) => sum + amount, 0) }
}
