import { createHmac, timingSafeEqual } from 'node:crypto'

export type ProductType = 'class' | 'pdf' | 'bundle'
export interface ProductDocument { key: string; name: string; size: number }
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const DOCUMENT_KEY = /^documents\/[a-f0-9]{40}\.pdf$/
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && bytes.length <= MAX_PDF_BYTES && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-'
}
export function documentReceipt(document: ProductDocument, creatorId: string, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify([creatorId, document.key, document.name, document.size])).digest('hex')
}
export function verifyDocument(input: unknown, creatorId: string, secret: string): ProductDocument | null {
  if (!input || typeof input !== 'object' || !secret) return null
  const d = input as ProductDocument & { receipt?: string }
  if (!DOCUMENT_KEY.test(d.key ?? '') || typeof d.name !== 'string' || d.name.length < 1 || d.name.length > 120 || /[\r\n]/.test(d.name) || !Number.isInteger(d.size) || d.size < 6 || d.size > MAX_PDF_BYTES || !/^[a-f0-9]{64}$/.test(d.receipt ?? '')) return null
  const expected = documentReceipt(d, creatorId, secret)
  return timingSafeEqual(Buffer.from(expected), Buffer.from(d.receipt!)) ? { key: d.key, name: d.name, size: d.size } : null
}
