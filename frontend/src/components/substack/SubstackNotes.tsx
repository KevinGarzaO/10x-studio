'use client'
import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { Send, Loader2, Calendar, Zap } from 'lucide-react'

export function SubstackNotes() {
  const { substackPublication } = useApp()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const resolverRef = useRef<((ok: boolean, msg: string) => void) | null>(null)

  const charLimit = 2000
  const remaining = charLimit - content.length

  // Default schedule to tomorrow at 9am local
  useEffect(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    // Format for datetime-local input: "YYYY-MM-DDTHH:mm"
    setScheduleDate(d.toISOString().slice(0, 16))
  }, [])

  // Listen for extension response
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type !== 'PUBLISH_NOTE_RESPONSE') return
      if (resolverRef.current) {
        resolverRef.current(e.data.ok === true, e.data.error || '')
        resolverRef.current = null
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  async function handlePublish() {
    if (!content.trim()) return
    if (scheduleMode && !scheduleDate) return

    setLoading(true)
    setResult(null)

    const subdomain = substackPublication || 'transformateck'

    try {
      const ok = await new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolverRef.current = null
          reject(new Error('Tiempo de espera agotado. ¿Está la extensión instalada y activa?'))
        }, 12000)

        resolverRef.current = (ok, errorMsg) => {
          clearTimeout(timer)
          if (ok) resolve(true)
          else reject(new Error(errorMsg || 'Error al publicar Note'))
        }

        if (scheduleMode) {
          // Convert local datetime to ISO UTC
          const trigger_at = new Date(scheduleDate).toISOString()
          window.postMessage({ type: 'SCHEDULE_NOTE', content: content.trim(), subdomain, trigger_at }, '*')
        } else {
          window.postMessage({ type: 'PUBLISH_NOTE', content: content.trim(), subdomain }, '*')
        }
      })

      if (ok) {
        const msg = scheduleMode
          ? `✅ Note programada para ${new Date(scheduleDate).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`
          : '✅ Note publicada correctamente en Substack'
        setResult({ ok: true, msg })
        setContent('')
      }
    } catch (err: any) {
      setResult({ ok: false, msg: `❌ Error: ${err.message}` })
    }

    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-brand-primary">Publicar Note</h2>
            <p className="text-xs text-brand-secondary mt-0.5">Comparte una nota corta directamente en Substack</p>
          </div>
          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-brand-bg border border-brand-border rounded-lg p-1">
            <button
              onClick={() => setScheduleMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${!scheduleMode ? 'bg-[#6b21a8] text-white' : 'text-brand-secondary hover:text-brand-primary'}`}
            >
              <Zap size={12} /> Ahora
            </button>
            <button
              onClick={() => setScheduleMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${scheduleMode ? 'bg-[#6b21a8] text-white' : 'text-brand-secondary hover:text-brand-primary'}`}
            >
              <Calendar size={12} /> Programar
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Schedule picker */}
          {scheduleMode && (
            <div className="mb-4">
              <label className="text-xs font-semibold text-brand-secondary mb-1.5 block">Fecha y hora de publicación</label>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-[14px] text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent transition-all"
              />
            </div>
          )}

          {/* Textarea */}
          <div className="relative">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, charLimit))}
              placeholder="¿Qué quieres compartir hoy?"
              rows={8}
              className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-3 text-[15px] text-brand-primary placeholder:text-brand-secondary/50 resize-none focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent transition-all leading-relaxed"
            />
            <span className={`absolute bottom-3 right-4 text-xs font-semibold tabular-nums transition-colors ${remaining < 100 ? (remaining < 20 ? 'text-red-400' : 'text-amber-400') : 'text-brand-secondary/60'}`}>
              {remaining}
            </span>
          </div>

          {/* Result */}
          {result && (
            <div className={`mt-3 px-4 py-2.5 rounded-lg text-sm font-medium border ${result.ok ? 'bg-green-900/20 border-green-700/40 text-green-300' : 'bg-red-900/20 border-red-700/40 text-red-300'}`}>
              {result.msg}
            </div>
          )}

          {/* Button */}
          <button
            onClick={handlePublish}
            disabled={loading || !content.trim() || (scheduleMode && !scheduleDate)}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-[#6b21a8] hover:bg-[#581c87] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-[15px] transition-colors"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> {scheduleMode ? 'Programando...' : 'Publicando...'}</>
            ) : scheduleMode ? (
              <><Calendar size={16} /> Programar Note</>
            ) : (
              <><Send size={16} /> Publicar Note ahora</>
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 bg-brand-surface/60 border border-brand-border rounded-xl p-4 text-xs text-brand-secondary leading-relaxed">
        <p className="font-semibold text-brand-primary mb-1">ℹ️ Requiere extensión de Chrome activa</p>
        Las Notes se publican a través de la extensión de Chrome. Asegúrate de tenerla instalada y activa.
      </div>
    </div>
  )
}
