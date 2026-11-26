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
  // Cloudflare occasionally returns transient 5xx/network errors. Retry those with backoff.
  // Writes are retried too: callers treat a 409 on retry as "already done" where it matters.
  const attempts = 4
  for (let attempt = 1; ; attempt++) {
    try {
      return await ($fetch as (url: string, options: any) => Promise<T>)(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers: { authorization: `Bearer ${config.cloudApiSecret}` },
        body: options.body as any,
        query: options.query,
        timeout: 15_000,
        retry: 0,
      })
    } catch (error: any) {
      const status = error?.statusCode ?? error?.response?.status ?? 502
      const transient = status >= 500 || status === 429 || status === 408
      // Writes only retry on gateway errors (request never reached the database) to avoid duplicates.
      const isWrite = (options.method ?? 'GET') !== 'GET'
      const retryable = isWrite ? (!error?.response || [429, 502, 503, 504].includes(status)) : transient
      if (retryable && attempt < attempts) { await new Promise(resolve => setTimeout(resolve, 250 * 2 ** (attempt - 1))); continue }
      throw new CloudError(status, error?.data?.error ?? (transient ? 'The database is busy right now. Please try again in a moment.' : 'Database unavailable'))
    }
  }
}

/** Returns null on 404 instead of throwing. */
export async function cloudMaybe<T = any>(path: string, query?: Record<string, string>): Promise<T | null> {
  try { return await cloud<T>(path, { query }) }
  catch (error) { if (error instanceof CloudError && error.status === 404) return null; throw error }
}
