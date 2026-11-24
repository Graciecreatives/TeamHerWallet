import { matchFreeResources, type FreeResource } from '#shared/free-resources'

/**
 * Free resources for a goal: the curated list first, then (optionally) live web results through Apify's
 * Google Search Results Scraper when NUXT_APIFY_TOKEN is set. Apify results are links only; the agent
 * never pays for them, and they are labelled as web results.
 */
export async function findFreeResources(goal: string): Promise<(FreeResource & { source: 'curated' | 'apify' })[]> {
  const curated = matchFreeResources(goal, 3).map(resource => ({ ...resource, source: 'curated' as const }))
  const token = String(useRuntimeConfig().apifyToken || '')
  if (!token || curated.length >= 3) return curated
  try {
    const items = await $fetch<any[]>('https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items', {
      method: 'POST',
      query: { token, timeout: 40 },
      timeout: 45_000,
      body: { queries: `free online course ${goal.slice(0, 120)}`, maxPagesPerQuery: 1, resultsPerPage: 10, countryCode: 'us', mobileResults: false },
    })
    const known = new Set(curated.map(resource => resource.url))
    const found = (items?.[0]?.organicResults ?? [])
      .filter((result: any) => typeof result?.url === 'string' && result.url.startsWith('https://') && !known.has(result.url))
      .slice(0, 3 - curated.length)
      .map((result: any) => ({ title: String(result.title ?? result.url).slice(0, 120), url: result.url, provider: new URL(result.url).hostname.replace(/^www\./, ''), tags: [], source: 'apify' as const }))
    return [...curated, ...found]
  } catch { return curated }
}
