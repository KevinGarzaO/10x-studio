'use client'
import { useState } from 'react'
import { PLATFORMS, type GeneratedResult } from '@/types'

interface Props { results: GeneratedResult[]; topic: string }

export function ResultTabs({ results, topic }: Props) {
  const [active,      setActive]      = useState(0)
  const [copied,      setCopied]      = useState(false)
  const [publishing,  setPublishing]  = useState<string | null>(null)
  const [pubMsg,      setPubMsg]      = useState<{ ok: boolean; text: string } | null>(null)

  const done = results.filter(r => r.status === 'done' || r.status === 'loading' || r.status === 'error')
  if (done.length === 0) return null

  const current = results[active] || results[0]

  function copy() {
    if (!current?.text) return
    navigator.clipboard.writeText(current.text)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function exportPDF() {
    if (!current?.text) return
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    doc.setFontSize(16); doc.text(topic, 10, 15)
    doc.setFontSize(11)
    const lines = doc.splitTextToSize(current.text, 185)
    doc.text(lines, 10, 28)
    doc.save(`${topic.slice(0, 40)}.pdf`)
  }

  async function exportDOCX() {
    if (!current?.text) return
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
    const paragraphs = current.text.split('\n').map(line => {
      if (line.startsWith('# '))  return new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 })
      if (line.startsWith('## ')) return new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 })
      return new Paragraph({ children: [new TextRun(line)] })
    })
    const doc  = new Document({ sections: [{ children: paragraphs }] })
    const blob = await Packer.toBlob(doc)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `${topic.slice(0, 40)}.docx`; a.click()
    URL.revokeObjectURL(url)
  }

  async function publishTo(target: 'wordpress' | 'linkedin' | 'webhook') {
    if (!current?.text) return
    setPublishing(target); setPubMsg(null)
    const isLinkedinPost = current.platform === 'linkedin-post'
    try {
      let res
      if (target === 'wordpress') {
        res = await fetch('/api/publish/wordpress', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: topic, content: current.text }),
        })
      } else if (target === 'linkedin') {
        res = await fetch('/api/publish/linkedin', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: current.text, title: topic, type: isLinkedinPost ? 'post' : 'article' }),
        })
      } else {
        res = await fetch('/api/publish/webhook', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: topic, content: current.text, platform: current.platform, topic, wordCount: current.wordCount }),
        })
      }
      const data = await res!.json()
      if (data.error) throw new Error(data.error)
      const urlStr = data.url ? ` → <a href="${data.url}" target="_blank" class="underline">${data.url}</a>` : ''
      setPubMsg({ ok: true, text: `✅ Publicado en ${target}${urlStr}` })
    } catch (e) {
      setPubMsg({ ok: false, text: `❌ ${String(e)}` })
    }
    setPublishing(null)
  }

  return (
    <div className="card overflow-hidden">
      {/* Platform tabs */}
      {results.length > 1 && (
        <div className="flex border-b border-[#e9e9e7] overflow-x-auto scrollbar-hide">
          {results.map((r, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${active === i ? 'border-black text-black' : 'border-transparent text-[#9b9a97] hover:text-[#191919]'}`}>
              {PLATFORMS[r.platform].icon} {PLATFORMS[r.platform].label}
              {r.status === 'loading' && <span className="w-3 h-3 border border-black border-t-transparent rounded-full animate-spin" />}
              {r.status === 'done'    && r.wordCount && <span className="text-[10px] text-[#9b9a97]">{r.wordCount}p</span>}
              {r.status === 'error'   && <span className="text-red-500">!</span>}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {current?.status === 'loading' && (
          <div className="flex items-center gap-3 py-8 justify-center text-[#9b9a97]">
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Generando {PLATFORMS[current.platform].label}...
          </div>
        )}
        {current?.status === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{current.error}</div>
        )}
        {current?.status === 'done' && (
          <div className="article-content prose max-w-none text-sm leading-relaxed whitespace-pre-wrap">{current.text}</div>
        )}
      </div>

      {/* Toolbar */}
      {current?.status === 'done' && (
        <div className="px-6 pb-5 border-t border-[#e9e9e7] pt-4 flex items-center gap-2 flex-wrap">
          <button onClick={copy} className="btn btn-secondary btn-sm">{copied ? '✅ Copiado' : '📋 Copiar'}</button>
          <button onClick={exportPDF}  className="btn btn-secondary btn-sm">📄 PDF</button>
          <button onClick={exportDOCX} className="btn btn-secondary btn-sm">📝 Word</button>
          <div className="h-4 w-px bg-[#e9e9e7] mx-1" />
          <span className="text-xs text-[#9b9a97]">Publicar en:</span>
          <button onClick={() => publishTo('wordpress')} disabled={!!publishing} className="btn btn-ghost btn-sm text-xs">
            {publishing === 'wordpress' ? '⏳' : '🌐'} WordPress
          </button>
          <button onClick={() => publishTo('linkedin')} disabled={!!publishing} className="btn btn-ghost btn-sm text-xs">
            {publishing === 'linkedin' ? '⏳' : '💼'} LinkedIn
          </button>
          <button onClick={() => publishTo('webhook')} disabled={!!publishing} className="btn btn-ghost btn-sm text-xs">
            {publishing === 'webhook' ? '⏳' : '🔗'} Webhook
          </button>
        </div>
      )}

      {pubMsg && (
        <div className={`mx-6 mb-5 px-4 py-3 rounded-lg text-sm ${pubMsg.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
          dangerouslySetInnerHTML={{ __html: pubMsg.text }} />
      )}
    </div>
  )
}
