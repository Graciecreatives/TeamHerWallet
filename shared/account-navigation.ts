/** One role-based destination shared by signup, login and session restoration. */
export function accountHome(role: unknown): 'library' | 'studio' | 'login' {
  return role === 'student' ? 'library' : role === 'creator' ? 'studio' : 'login'
}

export function studentSection(path: string): string {
  if (/^\/library\/?$/.test(path)) return 'classes'
  const section = path.match(/^\/student(?:\/(chat|classes|payments|settings|analytics|notifications))?\/?$/)?.[1]
  return section ?? 'dashboard'
}
