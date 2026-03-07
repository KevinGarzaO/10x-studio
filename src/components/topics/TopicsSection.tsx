'use client'
import { useState } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS, ALL_PLATFORMS, STATUS_LABELS, PRIORITY_LABELS,
  type Topic, type TopicStatus, type TopicPriority, type Campaign } from '@/types'
import { uid, dateStr, fmtDate } from '@/lib/utils'
import { TopicModal } from './TopicModal'
import { CampaignModal } from './CampaignModal'
import { ResearchModal } from './ResearchModal'

interface Props { onWriteTopic: (t: { title: string; notes: string }) => void }

const STATUS_BADGE: Record<TopicStatus, string> = {
  idea:    'badge badge-idea',
  ready:   'badge badge-ready',
  writing: 'badge badge-writing',
  done:    'badge badge-done',
}
const STATUS_DOT: Record<TopicStatus, string> = {
  idea: 'bg-yellow-400', ready: 'bg-green-500', writing: 'bg-blue-500', done: 'bg-gray-400',
}

export function TopicsSection({ onWriteTopic }: Props) {
  const { topics, history, campaigns, addTopic, updateTopic, deleteTopic,
          addCampaign, updateCampaign, deleteCampaign, settings } = useApp()

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TopicStatus>('all')
  const [campaignFilter, setCampaignFilter] = useState<'all' | string>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | TopicPriority>('all')
  const [topicModal, setTopicModal]     = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [campaignModal, setCampaignModal] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [researchTopic, setResearchTopic] = useState<Topic | null>(null)
  const [suggesting, setSuggesting]     = useState(false)

  const filtered = topics.filter(t => {
    const matchQ  = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.tags.some(tg => tg.toLowerCase().includes(search.toLowerCase()))
    const matchSt = statusFilter === 'all' || t.status === statusFilter
    const matchCa = campaignFilter === 'all' || t.campaignId === campaignFilter
    const matchPr = priorityFilter === 'all' || t.priority === priorityFilter
    return matchQ && matchSt && matchCa && matchPr
  })

  async function handleSuggest() {
    if (!settings.apiKey) { alert('Ingresa tu API Key'); return }
    setSuggesting(true)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'topics', niche: settings.niche, audience: settings.audience, existing: history.map(h => h.topic), apiKey: settings.apiKey }),
      })
      const data = await res.json()
      for (const t of data.topics) await addTopic({ id: uid(), title: t.title, status: 'idea', tags: t.tags || [], notes: t.notes || '', created: dateStr() })
    } catch (e) { console.error(e) }
    setSuggesting(false)
  }

  async function handleSaveTopic(data: Omit<Topic, 'id' | 'created'>) {
    if (editingTopic) await updateTopic({ ...editingTopic, ...data })
    else await addTopic({ id: uid(), created: dateStr(), ...data })
    setTopicModal(false); setEditingTopic(null)
  }

  async function handleSaveCampaign(data: Omit<Campaign, 'id' | 'created'>) {
    if (editingCampaign) await updateCampaign({ ...editingCampaign, ...data })
    else await addCampaign({ id: uid(), created: dateStr(), ...data })
    setCampaignModal(false); setEditingCampaign(null)
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    const lines = text.split('\n').filter(Boolean)
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const ti = headers.findIndex(h => h === 'titulo' || h === 'title')
    const gi = headers.findIndex(h => h === 'etiquetas' || h === 'tags')
    const ni = headers.findIndex(h => h === 'notas' || h === 'notes')
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const title = cols[ti >= 0 ? ti : 0]; if (!title) continue
      await addTopic({ id: uid(), title, status: 'idea', tags: gi >= 0 ? cols[gi]?.split(';').map(t => t.trim()).filter(Boolean) : [], notes: ni >= 0 ? cols[ni] || '' : '', created: dateStr() })
    }
  }

  async function handleResearchSave(topicId: string, research: { researchSummary: string; seoKeyword: string; seoVolume: string }) {
    const t = topics.find(x => x.id === topicId); if (!t) return
    await updateTopic({ ...t, ...research })
    setResearchTopic(null)
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 border-b border-[#e9e9e7] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
            <i className="pi pi-lightbulb text-[#9b9a97]"></i> Banco de Temas
          </h1>
          <p className="text-sm text-[#9b9a97] mt-1">Gestiona tus ideas de contenido</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditingCampaign(null); setCampaignModal(true) }}>🏷️ Campaña</button>
          <label className="btn btn-ghost btn-sm cursor-pointer">📥 CSV <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} /></label>
          <button className="btn btn-ghost btn-sm" onClick={handleSuggest} disabled={suggesting}>{suggesting ? '⏳ Generando...' : '✦ Sugerir IA'}</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditingTopic(null); setTopicModal(true) }}>+ Agregar</button>
        </div>
      </div>

      {/* Campaigns strip */}
      {campaigns.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setCampaignFilter('all')}
            className={`px-3 py-1 rounded text-xs font-medium border transition-all ${campaignFilter === 'all' ? 'border-black text-black bg-black/5' : 'border-[#e9e9e7] text-[#9b9a97] hover:border-[#ccc]'}`}>
            Todas
          </button>
          {campaigns.map(c => (
            <button key={c.id} onClick={() => setCampaignFilter(c.id)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-all flex items-center gap-1 ${campaignFilter === c.id ? 'border-current' : 'border-[#e9e9e7] text-[#9b9a97]'}`}
              style={campaignFilter === c.id ? { borderColor: c.color, color: c.color, background: c.color + '12' } : {}}>
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
              {c.name}
              <span className="ml-1 opacity-50 hover:opacity-100" onClick={e => { e.stopPropagation(); setEditingCampaign(c); setCampaignModal(true) }}>✏️</span>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar temas..." className="input !pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'idea', 'ready', 'writing', 'done'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${statusFilter === f ? 'border-stone-900 text-stone-900 bg-stone-900/5 shadow-sm' : 'border-[#e9e9e7] text-[#9b9a97] hover:border-[#ccc]'}`}>
              {f === 'all' ? 'Todos' : STATUS_LABELS[f]}
            </button>
          ))}
          {([1, 2, 3] as TopicPriority[]).map(p => (
            <button key={p} onClick={() => setPriorityFilter(priorityFilter === p ? 'all' : p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${priorityFilter === p ? 'border-stone-900 text-stone-900 bg-stone-900/5 shadow-sm' : 'border-[#e9e9e7] text-[#9b9a97]'}`}>
              {PRIORITY_LABELS[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9b9a97]">
          <div className="text-5xl mb-4">💡</div>
          <p className="mb-5 font-medium text-stone-500">No hay temas aún.</p>
          <button className="btn btn-primary" onClick={() => setTopicModal(true)}>+ Agregar tema</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(t => {
            const donePlats = new Set(history.filter(h => h.topicId === t.id || h.topic.toLowerCase() === t.title.toLowerCase()).flatMap(h => h.platforms))
            const campaign  = campaigns.find(c => c.id === t.campaignId)
            return (
              <div key={t.id} className="bg-white border border-[#e9e9e7] rounded-xl px-4 py-3 flex items-center gap-3 group hover:bg-[#f7f7f5] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 shadow-sm">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[t.status || 'idea']}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate text-[#37352f]">{t.title}</span>
                    {campaign && <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: campaign.color + '18', color: campaign.color }}>{campaign.name}</span>}
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap items-center">
                    {t.tags.map(tg => <span key={tg} className="text-xs bg-[#f1f1ef] text-[#9b9a97] px-2 py-0.5 rounded">{tg}</span>)}
                    {t.seoKeyword && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded">🔍 {t.seoKeyword}</span>}
                    {t.seoVolume  && <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded">📊 {t.seoVolume}</span>}
                  </div>
                </div>
                <div className="flex gap-1 items-center">
                  {ALL_PLATFORMS.map(p => (
                    <span key={p} title={`${PLATFORMS[p].label} — ${donePlats.has(p) ? 'Generado' : 'Sin generar'}`}
                      className="text-base" style={{ opacity: donePlats.has(p) ? 1 : 0.18, filter: donePlats.has(p) ? 'none' : 'grayscale(1)' }}>
                      {PLATFORMS[p].icon}
                    </span>
                  ))}
                  {donePlats.size > 0 && <span className="text-xs text-green-600 ml-1">{donePlats.size}/5</span>}
                </div>
                {t.priority && <span className={`badge border text-[10px] ${PRIORITY_LABELS[t.priority].color}`}>{PRIORITY_LABELS[t.priority].label}</span>}
                <span className={STATUS_BADGE[t.status || 'idea']}>{STATUS_LABELS[t.status || 'idea']}</span>
                <span className="text-xs text-[#9b9a97] font-mono whitespace-nowrap">{fmtDate(t.created)}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="btn btn-primary btn-sm" title="Escribir" onClick={() => onWriteTopic({ title: t.title, notes: t.notes })}>✍️</button>
                  <button className="btn btn-ghost btn-sm" title="Investigar" onClick={() => setResearchTopic(t)}>🔬</button>
                  <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => { setEditingTopic(t); setTopicModal(true) }}>✏️</button>
                  <button className="btn btn-danger btn-sm" title="Eliminar" onClick={() => deleteTopic(t.id)}>🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {topicModal    && <TopicModal open topic={editingTopic} campaigns={campaigns} onClose={() => { setTopicModal(false); setEditingTopic(null) }} onSave={handleSaveTopic} />}
      {campaignModal && <CampaignModal open campaign={editingCampaign} onClose={() => { setCampaignModal(false); setEditingCampaign(null) }} onSave={handleSaveCampaign} onDelete={editingCampaign ? () => { deleteCampaign(editingCampaign.id); setCampaignModal(false) } : undefined} />}
      {researchTopic && <ResearchModal topic={researchTopic} apiKey={settings.apiKey} niche={settings.niche} audience={settings.audience} onClose={() => setResearchTopic(null)} onSave={handleResearchSave} />}
    </div>
  )
}
