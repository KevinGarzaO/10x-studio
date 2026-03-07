'use client'
import { useState } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { PLATFORMS, ALL_PLATFORMS, type Platform, type PromptTemplate } from '@/types'
import { uid, dateStr } from '@/lib/utils'

const DEFAULT_PROMPTS: Record<Platform, string> = {
  'blog': `Eres redactor experto de blogs. Escribe un artículo completo sobre: {{topic}}
Longitud: ~{{length}} palabras. Tono: {{tone}}.
{{#audience}}Audiencia: {{audience}}{{/audience}}
{{#keywords}}Palabras clave: {{keywords}}{{/keywords}}
{{#extract}}Material base:\n---\n{{extract}}\n---{{/extract}}
Estructura: # título, introducción, ## subtítulos, ejemplos, CTA. Solo el artículo.`,
  'linkedin-post': `Experto en LinkedIn. POST sobre: {{topic}}
Tono: {{tone}}. Máx 1,300 chars. Gancho en primera línea. Emojis. Máx 5 hashtags. Solo el post.`,
  'linkedin-article': `Thought leadership LinkedIn. ARTÍCULO sobre: {{topic}}
~{{length}} palabras. Tono: {{tone}}. # título, intro impactante, ## secciones, CTA. Solo el artículo.`,
  'substack-article': `Newsletter Substack sobre: {{topic}}
~{{length}} palabras. Tono: {{tone}}. Voz personal, narrativa fluida. Solo el artículo.`,
  'substack-note': `Nota Substack sobre: {{topic}}
Máx 300 palabras. Sin título ni ##. Tono íntimo. Solo la nota.`,
}

function TemplateModal({ template, onClose, onSave }: {
  template: PromptTemplate | null
  onClose: () => void
  onSave: (t: Omit<PromptTemplate, 'id' | 'created'>) => void
}) {
  const [name, setName]         = useState(template?.name || '')
  const [platform, setPlatform] = useState<Platform>(template?.platform || 'blog')
  const [description, setDesc]  = useState(template?.description || '')
  const [prompt, setPrompt]     = useState(template?.systemPrompt || DEFAULT_PROMPTS['blog'])

  function handlePlatformChange(p: Platform) {
    setPlatform(p)
    if (!template) setPrompt(DEFAULT_PROMPTS[p])
  }

  return (
    <div className="fixed inset-0 bg-[#191919]/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-5">{template ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label block mb-1.5">Nombre *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Ej: Blog storytelling" autoFocus />
            </div>
            <div>
              <label className="label block mb-1.5">Plataforma</label>
              <select value={platform} onChange={e => handlePlatformChange(e.target.value as Platform)} className="input">
                {ALL_PLATFORMS.map(p => <option key={p} value={p}>{PLATFORMS[p].icon} {PLATFORMS[p].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label block mb-1.5">Descripción</label>
            <input value={description} onChange={e => setDesc(e.target.value)} className="input" placeholder="Para qué sirve esta plantilla..." />
          </div>
          <div>
            <label className="label block mb-1.5">
              Prompt personalizado
              <span className="ml-2 text-black font-normal normal-case tracking-normal">— usa variables: {'{{topic}}'} {'{{tone}}'} {'{{length}}'} {'{{extract}}'} {'{{audience}}'} {'{{keywords}}'}</span>
            </label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={10} className="input resize-none font-mono text-xs" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { if (!name.trim()) return; onSave({ name, platform, description, systemPrompt: prompt }) }}>
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  )
}

export function TemplatesSection() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<PromptTemplate | null>(null)
  const [filterPlat, setFilterPlat] = useState<'all' | Platform>('all')

  const filtered = templates.filter(t => filterPlat === 'all' || t.platform === filterPlat)

  async function handleSave(data: Omit<PromptTemplate, 'id' | 'created'>) {
    if (editing) await updateTemplate({ ...editing, ...data })
    else await addTemplate({ id: uid(), created: dateStr(), ...data })
    setModalOpen(false); setEditing(null)
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3 border-b border-[#e9e9e7] pb-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-black flex items-center gap-3">
            <i className="pi pi-th-large text-[#9b9a97]"></i> Plantillas de Prompts
          </h1>
          <p className="text-sm text-[#9b9a97] mt-1">Personaliza cómo la IA genera cada tipo de contenido</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>+ Nueva plantilla</button>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {(['all', ...ALL_PLATFORMS] as const).map(p => (
          <button key={p} onClick={() => setFilterPlat(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${filterPlat === p ? 'border-black text-black bg-black/[0.06]' : 'border-[#e9e9e7] text-[#9b9a97] hover:border-[#e9e9e7]'}`}>
            {p === 'all' ? 'Todas' : `${PLATFORMS[p].icon} ${PLATFORMS[p].label}`}
          </button>
        ))}
      </div>

      {/* How-to callout */}
      <div className="bg-[#f7f7f5] border border-[#e9e9e7] rounded-lg p-4 mb-6 text-sm text-[#9b9a97]">
        <strong className="text-black">¿Cómo funciona?</strong> Crea una plantilla con un prompt personalizado. Al generar en el Redactor, podrás elegirla como base en lugar del prompt estándar. Usa <code className="bg-white px-1 rounded text-xs">{'{{topic}}'}</code>, <code className="bg-white px-1 rounded text-xs">{'{{tone}}'}</code>, <code className="bg-white px-1 rounded text-xs">{'{{extract}}'}</code> para insertar los valores del formulario.
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9b9a97]">
          <div className="text-4xl mb-3">🗂️</div>
          <p className="mb-4">No hay plantillas aún. ¡Crea una para personalizar tu estilo!</p>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Nueva plantilla</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map(t => (
            <div key={t.id} className="card p-5 group">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-base mr-1">{PLATFORMS[t.platform].icon}</span>
                  <span className="font-semibold text-sm">{t.name}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(t); setModalOpen(true) }}>✏️</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteTemplate(t.id)}>🗑️</button>
                </div>
              </div>
              <div className="text-xs text-[#9b9a97] mb-3">{t.description || 'Sin descripción'}</div>
              <div className="bg-[#f7f7f5] rounded-lg p-3 font-mono text-[10px] text-[#9b9a97] max-h-24 overflow-hidden relative">
                {t.systemPrompt.slice(0, 200)}…
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#f7f7f5]" />
              </div>
              <div className="mt-2 text-[10px] text-[#9b9a97]">{PLATFORMS[t.platform].label} · creada {t.created}</div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <TemplateModal
          template={editing}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
