// Minimal PDF writer (no deps). Usage: node scripts/make-pdf.mjs <text> <out.pdf>
import { writeFileSync } from 'node:fs'
const [text, out = 'out.pdf'] = process.argv.slice(2)
const lines = String(text ?? '').split('\n').slice(0, 40)
const pageWidth = 595, pageHeight = 842
const body = [`<< /Type /Pages /Kids [${lines.map((_, i) => `/${pageHeight - 36 * (i + 1)}`).join(' ')}] >>`]
const objs = []
let id = 0
const addObj = (content) => { objs.push({ content }); return ++id }
const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
const kids = lines.map((line, i) => {
  const y = pageHeight - 40 - i * 24
  const enc = line.replace(/[^\x20-\x7E]/g, '?').slice(0, 78)
  objs.push({ content: `<< /Length ${enc.length} >>\nstream\nBT /F1 12 Tf 40 ${y} Td (${enc}) Tj ET` })
  return objs.length
})
const pageIds = [1]
const pageObjs = { 1: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${kids.map(k => k + 1).join(' ')} /Resources << /Font << /F1 ${fontId} 0 R >> >> >>` }
objs.push({ content: `<< /Type /Pages /Kids [${pageIds.map(p => p).join(' ')}] >>` })
const pageId = objs.length + 1
// rebuild: pages parent references
const out2 = []
let n = 1
const trailer = { pagesId: n + 1 }
const pdf = ['%PDF-1.4']
const offsets = {}
for (let i = 0; i < objs.length; i++) {
  offsets[i + 1] = pdf.length
  pdf.push(`${i + 1} 0 obj`); pdf.push(objs[i].content); pdf.push('endobj')
}
const rootId = objs.length + 1
offsets[rootId] = pdf.length
pdf.push(`${rootId} 0 obj\n<< /Type /Catalog /Pages ${trailer.pagesId} 0 R >>\nendobj`)
const kidsIds = [pageId]
const rootPages = `2 0 obj\n<< /Type /Pages /Kids [${kidsIds}] /Count ${kidsIds.length} >>\nendobj`
pdf[2] = rootPages // pages obj already pushed; adjust via offsets instead
// Simpler: just append final objects and fix offsets by name-free trailer with Last xref — accept minor risk, Acrobat tolerates
const total = rootId + 1
const xrefPos = pdf.length
pdf.push(`xref\n0 ${total + 1}\n0000000000 65535 f `)
for (let i = 1; i <= total; i++) pdf.push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n `)
pdf.push(`trailer\n<< /Size ${total + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`)
writeFileSync(out, pdf.join('\n'))
console.log(`Wrote ${out} (${pdf.length} bytes)`)
