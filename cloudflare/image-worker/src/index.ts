/**
 * LearnPurse image upload Worker.
 * PUT /upload/<key>  (Authorization: Bearer UPLOAD_SECRET, body = image bytes) -> stores in R2
 * GET /<key>         -> serves the image from R2 with long cache headers
 * DELETE /<key>      (Authorization) -> removes the image
 */
export interface Env {
  IMAGES: R2Bucket
  /** Dedicated private bucket. Never attach a public domain or r2.dev access. */
  DOCUMENTS: R2Bucket
  UPLOAD_SECRET: string
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const MAX_BYTES = 5 * 1024 * 1024
const KEY = /^covers\/[a-z0-9-]{6,100}\.(?:jpg|png|webp|gif|avif)$/

function authorized(request: Request, env: Env): boolean {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!env.UPLOAD_SECRET || token.length !== env.UPLOAD_SECRET.length) return false
  let diff = 0
  for (let index = 0; index < token.length; index++) diff |= token.charCodeAt(index) ^ env.UPLOAD_SECRET.charCodeAt(index)
  return diff === 0
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ''))

    // Documents never enter the public cover-serving path, even when their key is known.
    const documentKey = /^documents\/[a-f0-9]{40}\.pdf$/
    const privateKey = path.startsWith('upload/') ? path.slice(7) : path
    if (privateKey.startsWith('documents/')) {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } })
      if (!documentKey.test(privateKey)) return new Response('Invalid key', { status: 400 })
      if (request.method === 'PUT' && path.startsWith('upload/')) {
        if (request.headers.get('content-type') !== 'application/pdf') return new Response('PDF required', { status: 415 })
        if (Number(request.headers.get('content-length')) > 20 * 1024 * 1024) return new Response('Too large', { status: 413 })
        const bytes = await request.arrayBuffer()
        if (bytes.byteLength < 6 || bytes.byteLength > 20 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return new Response('Invalid PDF', { status: 415 })
        await env.DOCUMENTS.put(privateKey, bytes, { httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' } })
        return Response.json({ key: privateKey })
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('upload/')) {
        const object = await env.DOCUMENTS.get(privateKey)
        if (!object) return new Response('Not found', { status: 404 })
        return new Response(request.method === 'HEAD' ? null : object.body, { headers: { 'content-type': 'application/pdf', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
      }
      return new Response('Method not allowed', { status: 405 })
    }

    if (request.method === 'PUT' && path.startsWith('upload/')) {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 })
      const key = path.slice('upload/'.length)
      if (!KEY.test(key)) return new Response('Invalid key', { status: 400 })
      const type = request.headers.get('content-type') ?? ''
      if (!ALLOWED.has(type)) return new Response('Unsupported image type', { status: 415 })
      const length = Number(request.headers.get('content-length') ?? 0)
      if (length > MAX_BYTES) return new Response('Image too large', { status: 413 })
      const body = await request.arrayBuffer()
      if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return new Response('Image too large or empty', { status: 413 })
      await env.IMAGES.put(key, body, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } })
      return Response.json({ key, url: `${url.origin}/${key}` })
    }

    if (request.method === 'DELETE') {
      if (!authorized(request, env)) return new Response('Unauthorized', { status: 401 })
      if (!KEY.test(path)) return new Response('Invalid key', { status: 400 })
      await env.IMAGES.delete(path)
      return new Response(null, { status: 204 })
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (!KEY.test(path)) return new Response('Not found', { status: 404 })
      const object = await env.IMAGES.get(path)
      if (!object) return new Response('Not found', { status: 404 })
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set('x-content-type-options', 'nosniff')
      headers.set('access-control-allow-origin', '*')
      return new Response(request.method === 'HEAD' ? null : object.body, { headers })
    }

    return new Response('Method not allowed', { status: 405 })
  },
}
