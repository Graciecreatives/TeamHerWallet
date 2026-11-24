import { randomBytes } from 'node:crypto'

// Creator uploads a cover image. The server forwards it to the Cloudflare R2 Worker so the secret never reaches the browser.
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
const MAX_BYTES = 5 * 1024 * 1024

function sniff(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (bytes.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif'
  if (bytes.subarray(4, 12).toString('ascii').startsWith('ftypavi')) return 'image/avif'
  return null
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.imageUploadUrl || !config.imageUploadSecret) throw createError({ statusCode: 503, statusMessage: 'Image uploads are not configured yet.' })

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'image' && part.data?.length)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Choose an image to upload.' })
  if (file.data.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'Images must be 5 MB or smaller.' })
  const type = sniff(file.data)
  if (!type || !TYPES[type]) throw createError({ statusCode: 415, statusMessage: 'Use a JPG, PNG, WebP, GIF or AVIF image.' })

  const key = `covers/${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${TYPES[type]}`
  const base = String(config.imageUploadUrl).replace(/\/+$/, '')
  const result = await $fetch<{ key: string; url: string }>(`${base}/upload/${key}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${config.imageUploadSecret}`, 'content-type': type },
    body: file.data,
    timeout: 30_000,
  }).catch(() => null)
  if (!result?.url) throw createError({ statusCode: 502, statusMessage: 'The image could not be stored. Try again.' })
  return { url: result.url, key: result.key }
})
