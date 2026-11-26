import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

let hooked = false
/** AI text to safe HTML. Sanitised with DOMPurify in the browser; plain escaped text during SSR. */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  if (typeof window === 'undefined') return `<p>${escape(text).replace(/\n/g, '<br>')}</p>`
  if (!hooked) {
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer') }
    })
    hooked = true
  }
  const html = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'style', 'iframe', 'form', 'input'], FORBID_ATTR: ['style'] })
}
