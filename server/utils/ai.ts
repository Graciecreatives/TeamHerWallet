/** Shared LLM access for LearnPurse. Supports Gemini and Groq. Returns null when no provider is configured or the call fails. */
export type ChatTurn = { role: 'user' | 'assistant'; content: string }

// Override with NUXT_AI_MODEL (comma-separated, tried in order).
const GROQ_MODELS = (process.env.NUXT_AI_MODEL || 'openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b').split(',').map(model => model.trim()).filter(Boolean)

export function aiConfigured(): boolean {
  const config = useRuntimeConfig()
  return Boolean(config.aiApiKey && (config.aiProviderOptions as any)?.[config.aiProvider])
}

export async function askModel(system: string, turns: ChatTurn[], options: { json?: boolean; temperature?: number; maxTokens?: number } = {}): Promise<string | null> {
  const config = useRuntimeConfig()
  const provider = (config.aiProviderOptions as any)?.[config.aiProvider]
  if (!config.aiApiKey || !provider) return null
  const temperature = options.temperature ?? 0.5
  const maxTokens = options.maxTokens ?? 1200

  if (config.aiProvider === 'gemini') {
    const response = await $fetch<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>(provider.endpoint, {
      method: 'POST',
      headers: { [provider.header]: config.aiApiKey },
      timeout: 25_000,
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(turn => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.content }] })),
        generationConfig: { temperature, maxOutputTokens: maxTokens, ...(options.json ? { responseMimeType: 'application/json' } : {}) },
      },
    })
    return response.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') || null
  }

  // Groq (OpenAI-compatible). Try the stronger model first, fall back to the next one.
  // Free-tier rate limits (429) usually clear within seconds, so wait briefly and retry once.
  const attempt = async (model: string) => {
    for (let tries = 0; ; tries++) {
      try {
        return await $fetch<{ choices?: { message?: { content?: string } }[] }>(provider.endpoint, {
          method: 'POST',
          headers: { [provider.header]: `${provider.prefix ?? ''}${config.aiApiKey}` },
          timeout: 25_000,
          body: {
            model,
            messages: [{ role: 'system', content: system }, ...turns],
            temperature,
            max_tokens: maxTokens + 1500,
            ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
            ...(options.json ? { response_format: { type: 'json_object' } } : {}),
          },
        })
      } catch (error: any) {
        const wait = Number(String(error?.data?.error?.message ?? '').match(/try again in ([0-9.]+)s/)?.[1])
        if (error?.statusCode === 429 && tries === 0 && wait > 0 && wait <= 8) { await new Promise(resolve => setTimeout(resolve, wait * 1000 + 250)); continue }
        throw error
      }
    }
  }
  for (const model of GROQ_MODELS) {
    try {
      const response = await attempt(model)
      const text = response.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (text) return text
    } catch (error: any) {
      console.warn(`[ai] ${model} failed:`, error?.data?.error?.message ?? error?.message ?? error)
      if (model === GROQ_MODELS.at(-1)) throw error
    }
  }
  return null
}

export async function askModelJson<T = unknown>(system: string, turns: ChatTurn[], options: { temperature?: number; maxTokens?: number } = {}): Promise<T | null> {
  const text = await askModel(system, turns, { ...options, json: true })
  if (!text) return null
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try { return JSON.parse(cleaned) as T } catch { return null }
}

/** Keep only well-formed, recent chat turns from an untrusted client payload. */
export function sanitizeHistory(input: unknown, limit = 12): ChatTurn[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((turn): turn is ChatTurn => !!turn && typeof turn === 'object' && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .map(turn => ({ role: turn.role, content: turn.content.trim().slice(0, 800) }))
    .filter(turn => turn.content.length > 0)
    .slice(-limit)
}
