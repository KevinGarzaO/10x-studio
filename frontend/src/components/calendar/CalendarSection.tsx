'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS, type Platform, type CalendarEvent } from '@/types'
import { dateStr, fmtDate, uid } from '@/lib/utils'
import { CalEventModal } from './CalEventModal'

type CalView = 'month' | 'week'

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

export function CalendarSection() {
  const { topics, calendar, addCalEvent, updateCalEvent, deleteCalEvent, settings } = useApp()
  const [view, setView]             = useState<CalView>('month')
  const [curDate, setCurDate]       = useState(new Date())
  const [modalOpen, setModalOpen]   = useState(false)
  const [editEvent, setEditEvent]   = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState('')
  const [suggestions, setSuggestions] = useState<CalendarEvent[]>([])
  const [suggesting, setSuggesting]   = useState(false)

  function navMonth(dir: number) { const d = new Date(curDate); d.setMonth(d.getMonth() + dir); setCurDate(d) }
  function navWeek(dir: number)  { const d = new Date(curDate); d.setDate(d.getDate() + dir * 7); setCurDate(d) }
  function goToday() { setCurDate(new Date()) }

  function openAddEvent(date: string) { setEditEvent(null); setDefaultDate(date); setModalOpen(true) }
  function openEditEvent(ev: CalendarEvent) { setEditEvent(ev); setDefaultDate(ev.date); setModalOpen(true) }

  async function handleSave(ev: Omit<CalendarEvent, 'id'>) {
    if (editEvent) await updateCalEvent({ ...ev, id: editEvent.id })
    else await addCalEvent({ ...ev, id: uid() })
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    await deleteCalEvent(id); setModalOpen(false)
  }

  async function suggestSchedule() {
    if (!settings.apiKey) { alert('Ingresa tu API Key'); return }
    const readyTopics = topics.filter(t => t.status === 'ready' || t.status === 'idea').slice(0, 8)
    if (!readyTopics.length) { alert('Agrega temas al banco primero'); return }
    setSuggesting(true)
    try {
      const data = await api<any>('/api/suggest', {
        method: 'POST',
        body: JSON.stringify({
          type: 'schedule',
          niche: settings.niche,
          topics: readyTopics.map(t => ({ id: t.id, title: t.title })),
          existing: calendar.map(e => e.date),
          today: dateStr(),
          apiKey: settings.apiKey,
        }),
      })
      setSuggestions(data.schedule.map((s: any) => ({ ...s, id: 'sug-' + uid(), status: 'pending' as const })))
    } catch (e) { console.error(e) }
    setSuggesting(false)
  }

  async function acceptSuggestions() {
    for (const s of suggestions) { await addCalEvent({ ...s, id: uid() }) }
    setSuggestions([])
  }

  const allEvents = [...calendar, ...suggestions]
  const today = dateStr()

  // MONTH VIEW
  function renderMonth() {
    const y = curDate.getFullYear(), m = curDate.getMonth()
    const first = new Date(y, m, 1)
    const last  = new Date(y, m + 1, 0)
    const startDow = (first.getDay() + 6) % 7
    const cells: Date[] = []
    for (let i = 0; i < startDow; i++) cells.push(new Date(y, m, 1 - startDow + i))
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d))
    const rem = (7 - (cells.length % 7)) % 7
    for (let i = 1; i <= rem; i++) cells.push(new Date(y, m + 1, i))

    return (
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="min-w-[600px] sm:min-w-0">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-brand-secondary uppercase tracking-wider py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                const ds = dateStr(date)
                const isCurrentMonth = date.getMonth() === m
                const isToday = ds === today
                const dayEvents = allEvents.filter(e => e.date === ds)
                return (
                  <div key={i}
                    onClick={() => openAddEvent(ds)}
                    className={`min-h-[80px] rounded-lg p-1.5 cursor-pointer border transition-all group ${isToday ? 'border-brand-accent bg-brand-accent/5' : 'border-brand-border bg-brand-surface hover:border-brand-accent'} ${!isCurrentMonth ? 'opacity-35' : ''}`}>
                    <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-brand-accent' : 'text-brand-primary'}`}>{date.getDate()}</div>
                    {dayEvents.map(ev => {
                      const t = topics.find(t => t.id === ev.topicId)
                      const isSug = ev.id.startsWith('sug-')
                      return (
                        <div key={ev.id}
                          onClick={e => { e.stopPropagation(); if (!isSug) openEditEvent(ev) }}
                          className={`text-[10px] px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer ${ev.status === 'published' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : isSug ? 'bg-brand-accent/10 text-brand-accent border border-dashed border-brand-accent/20' : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'}`}>
                          {PLATFORMS[ev.platform]?.icon} {t?.title?.substring(0, 18) || 'Evento'}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
    )
  }

  // WEEK VIEW
  function renderWeek() {
    const d = new Date(curDate)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const days: Date[] = Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x })

    return (
      <div className="flex flex-col gap-2">
        {days.map(day => {
          const ds = dateStr(day)
          const dayEvents = allEvents.filter(e => e.date === ds)
          const isToday = ds === today
          return (
            <div key={ds} className="flex gap-3 items-start">
              <div className={`min-w-[80px] pt-1 ${isToday ? 'text-brand-accent' : ''}`}>
                <div className="text-sm font-semibold capitalize text-brand-primary">{day.toLocaleString('es-MX', { weekday: 'short' })}</div>
                <div className="text-xs text-brand-secondary">{day.getDate()} {day.toLocaleString('es-MX', { month: 'short' })}</div>
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                {dayEvents.map(ev => {
                  const t = topics.find(t => t.id === ev.topicId)
                  const isSug = ev.id.startsWith('sug-')
                  return (
                    <div key={ev.id} onClick={() => !isSug && openEditEvent(ev)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm font-medium ${ev.status === 'published' ? 'border-l-green-500 border-brand-border bg-green-500/5' : isSug ? 'border-l-brand-accent border-brand-border bg-brand-accent/5 border-dashed' : 'border-l-yellow-500 border-brand-border bg-yellow-500/5'} border-l-4`}>
                      <span>{PLATFORMS[ev.platform]?.icon}</span>
                      <span className="flex-1 truncate text-brand-primary">{t?.title || 'Sin tema'}</span>
                      <span className={`badge ${ev.status === 'published' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-500'}`}>{ev.status === 'published' ? '✅ Publicado' : '🕐 Pendiente'}</span>
                    </div>
                  )
                })}
                <button onClick={() => openAddEvent(ds)} className="text-xs text-brand-accent hover:underline text-left">+ Agregar</button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const calTitle = view === 'month'
    ? curDate.toLocaleString('es-MX', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
    : (() => { const d = new Date(curDate); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `Semana del ${fmtDate(dateStr(d))}` })()

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-brand-primary flex items-center gap-3">
            <i className="pi pi-calendar text-brand-secondary"></i> Calendario
          </h1>
          <p className="text-sm text-brand-secondary mt-1">Planifica tu estrategia de publicación</p>
        </div>
        <button className="btn btn-ghost" onClick={suggestSchedule} disabled={suggesting}>
          {suggesting ? '⏳ Analizando...' : '✦ Sugerir fechas con IA'}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-brand-accent/10 border border-brand-accent/20 rounded-lg mb-5">
          <span className="text-xl">✨</span>
          <div className="flex-1 text-sm text-brand-primary"><strong>La IA sugirió {suggestions.length} fechas</strong> basándose en tus temas disponibles.</div>
          <button className="btn btn-primary btn-sm" onClick={acceptSuggestions}>Aceptar todas</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSuggestions([])}>Descartar</button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button className="btn btn-secondary btn-sm px-2" onClick={() => view === 'month' ? navMonth(-1) : navWeek(-1)}>‹</button>
        <h2 className="text-xl font-bold flex-1 capitalize text-brand-primary">{calTitle}</h2>
        <button className="btn btn-secondary btn-sm px-2" onClick={() => view === 'month' ? navMonth(1) : navWeek(1)}>›</button>
        <button className="btn btn-secondary btn-sm" onClick={goToday}>Hoy</button>
        <div className="flex bg-brand-bg rounded-lg p-0.5">
          {(['month','week'] as CalView[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === v ? 'bg-brand-accent text-[#1A1A1A] shadow-sm' : 'text-brand-secondary'}`}>
              {v === 'month' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? renderMonth() : renderWeek()}

      <CalEventModal
        open={modalOpen}
        event={editEvent}
        defaultDate={defaultDate}
        topics={topics}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
