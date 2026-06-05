'use client'
import { useState } from 'react'
import { PLATFORMS, type GeneratedResult } from '@/types'
import { api } from '@/lib/api'

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
      let data
      if (target === 'wordpress') {
        data = await api<any>('/api/publish/wordpress', {
          method: 'POST',
          body: JSON.stringify({ title: topic, content: current.text }),
        })
      } else if (target === 'linkedin') {
        data = await api<any>('/api/publish/linkedin', {
          method: 'POST',
          body: JSON.stringify({ content: current.text, title: topic, type: isLinkedinPost ? 'post' : 'article' }),
        })
      } else {
        data = await api<any>('/api/publish/webhook', {
          method: 'POST',
          body: JSON.stringify({ title: topic, content: current.text, platform: current.platform, topic, wordCount: current.wordCount }),
        })
      }
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
        <div className="flex p-1 bg-brand-surface/50 border-b border-brand-border overflow-x-auto no-scrollbar gap-1">
          {results.map((r, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`tab ${active === i ? 'tab-active' : 'tab-inactive'} text-xs !h-[32px] px-3`}>
              <span className="text-sm">{PLATFORMS[r.platform].icon}</span>
              <span>{PLATFORMS[r.platform].label}</span>
              {r.status === 'loading' && <i className="pi pi-spin pi-spinner text-[10px]" />}
              {r.status === 'done'    && r.wordCount && <span className="text-[9px] opacity-60 ml-0.5">{r.wordCount}p</span>}
              {r.status === 'error'   && <i className="pi pi-exclamation-circle text-red-500 text-[10px]" />}
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
        <div className="px-6 pb-5 border-t border-[#e9e9e7] pt-4 flex items-center gap-2 flex-wrap min-h-[60px]">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button onClick={copy} className="btn btn-secondary btn-sm flex-1 md:flex-none">
              <i className="pi pi-copy"></i>
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button onClick={exportPDF}  className="btn btn-secondary btn-sm flex-1 md:flex-none">
              <i className="pi pi-file-pdf"></i>
              <span>PDF</span>
            </button>
            <button onClick={exportDOCX} className="btn btn-secondary btn-sm flex-1 md:flex-none">
              <i className="pi pi-file-word"></i>
              <span>Word</span>
            </button>
          </div>
          
          <div className="hidden md:block h-4 w-px bg-[#e9e9e7] mx-1" />
          
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar py-1">
            <span className="text-[10px] sm:text-xs text-[#9b9a97] whitespace-nowrap uppercase font-bold tracking-widest">Publicar:</span>
            <button onClick={() => publishTo('wordpress')} disabled={!!publishing} className="btn btn-secondary btn-sm flex-1 md:flex-none">
              <i className={publishing === 'wordpress' ? 'pi pi-spin pi-spinner' : 'pi pi-globe'} />
              <span>WordPress</span>
            </button>
            <button onClick={() => publishTo('linkedin')} disabled={!!publishing} className="btn btn-secondary btn-sm flex-1 md:flex-none">
              <i className={publishing === 'linkedin' ? 'pi pi-spin pi-spinner' : 'pi pi-linkedin'} />
              <span>LinkedIn</span>
            </button>
            <button onClick={() => publishTo('webhook')} disabled={!!publishing} className="btn btn-secondary btn-sm flex-1 md:flex-none">
              <i className={publishing === 'webhook' ? 'pi pi-spin pi-spinner' : 'pi pi-link'} />
              <span>Webhook</span>
            </button>
          </div>
        </div>
      )}

      {pubMsg && (
        <div className={`mx-6 mb-5 px-4 py-3 rounded-lg text-sm ${pubMsg.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
          dangerouslySetInnerHTML={{ __html: pubMsg.text }} />
      )}
    </div>
  )
}
