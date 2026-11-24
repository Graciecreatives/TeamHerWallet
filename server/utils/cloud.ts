/** Client for the LearnPurse Cloudflare API Worker (D1 database). Server-only. */
export class CloudError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function cloudConfigured(): boolean {
  const config = useRuntimeConfig()
  return Boolean(config.cloudApiUrl && config.cloudApiSecret)
}

export async function cloud<T = any>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const config = useRuntimeConfig()
  if (!config.cloudApiUrl || !config.cloudApiSecret) throw new CloudError(503, 'The Cloudflare database is not configured. Set NUXT_CLOUD_API_URL and NUXT_CLOUD_API_SECRET.')
  const base = String(config.cloudApiUrl).replace(/\/+$/, '')
  try {
    return await ($fetch as (url: string, options: any) => Promise<T>)(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers: { authorization: `Bearer ${config.cloudApiSecret}` },
      body: options.body as any,
      query: options.query,
      timeout: 15_000,
      retry: options.method && options.method !== 'GET' ? 0 : 2,
    })
  } catch (error: any) {
    throw new CloudError(error?.statusCode ?? error?.response?.status ?? 502, error?.data?.error ?? 'Database unavailable')
  }
}

/** Returns null on 404 instead of throwing. */
export async function cloudMaybe<T = any>(path: string, query?: Record<string, string>): Promise<T | null> {
  try { return await cloud<T>(path, { query }) }
  catch (error) { if (error instanceof CloudError && error.status === 404) return null; throw error }
}
