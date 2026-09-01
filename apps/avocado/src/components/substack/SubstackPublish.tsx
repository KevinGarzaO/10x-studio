'use client'
import { useState, useRef, useEffect } from 'react'
import { useApp } from '@/components/layout/AppProvider'
import { uid } from '@/lib/utils'
import type { ScheduledPost } from '@/types'
import { api } from '@/lib/api'
import { 
  Undo, Redo, ChevronDown, Code, Link as LinkIcon, Image as ImageIcon, 
  Headphones, Video, MessageSquare, List, ListOrdered, AlignLeft, X, Plus, LayoutTemplate,
  Check, Pilcrow, AlignCenter, AlignRight, AlignJustify, Minus, BarChart3, Asterisk, 
  Sigma, Feather, BarChart2, Coins, Utensils, Braces, ArrowLeft
} from 'lucide-react'

// TipTap Imports
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { Node as TipTapNode, mergeAttributes } from '@tiptap/core'

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: { default: null },
      width: { default: null },
      bytes: { default: null },
      fileType: { default: 'image/png' }
    }
  }
})

export const SubscribeWidget = TipTapNode.create({
  name: 'subscribe_widget',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-type="subscribe-widget"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'subscribe-widget', class: 'mx-auto my-8 p-6 bg-purple-50 border border-purple-200 rounded-xl text-center select-none' }), 
      ['div', { class: 'text-2xl font-bold text-[var(--text-primary)] mb-2' }, '¡Gracias por leer Transformateck!'],
      ['div', { class: 'text-[var(--text-secondary)] mb-4' }, 'Suscríbete gratis para recibir nuevas publicaciones y apoyar mi trabajo.'],
      ['button', { class: 'bg-[#6b21a8] text-white px-6 py-2 rounded-full font-semibold pointer-events-none' }, 'Suscribirse']
    ]
  },
})

type PublishType = 'article'
type DropdownType = 'style' | 'align' | 'button' | 'more' | null

function SubstackIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 448 512" fill="currentColor" {...props}>
      <path d="M0 0h448v62.8H0V0zm0 149.1h448v62.8H0v-62.8zm0 149.1h448V512L224 392.3 0 512V298.2z" />
    </svg>
  )
}

export function SubstackPublish() {
  const { history, addCalEvent, editorPrefill, setEditorPrefill } = useApp()
  
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  
  const [scheduleAt, setScheduleAt] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [contentJSON, setContentJSON] = useState('')
  const [result, setResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [queue, setQueue]     = useState<ScheduledPost[]>([])
  
  const [publishStep, setPublishStep] = useState<'edit' | 'settings'>('edit')
  
  // Settings Options
  const [audience, setAudience] = useState<'everyone' | 'paid'>('everyone')
  const [comments, setComments] = useState<'everyone' | 'none'>('everyone')
  const [deliveryApp, setDeliveryApp] = useState(true)
  const [isScheduled, setIsScheduled] = useState(false)
  
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null)

  const toolbarRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!draftId) {
      alert('Debes escribir un título o iniciar el borrador antes de poder subir imágenes.')
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      try {
        const res = await api<{ url: string, imageWidth: number, imageHeight: number, bytes: number, contentType: string }>('/api/substack/image', {
          method: 'POST',
          body: JSON.stringify({ image: base64, postId: draftId })
        })
        if (res.url) {
          editor?.chain().focus().setImage({ 
            src: res.url,
            height: res.imageHeight as any,
            width: res.imageWidth as any,
            bytes: res.bytes as any,
            fileType: res.contentType as any
          } as any).run()
        }
      } catch (err) {
        alert('Error al subir imagen a Substack')
      }
    }
    reader.readAsDataURL(file)
  }

  // Initialize TipTap Editor
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      LinkExtension.configure({
        openOnClick: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CustomImage,
      SubscribeWidget,
      Placeholder.configure({
        placeholder: 'Comienza a escribir...',
        emptyEditorClass: 'is-empty',
      })
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-p:text-[var(--text-primary)] prose-headings:text-[var(--text-primary)] prose-a:text-[var(--teck-color)] focus:outline-none max-w-none min-h-[400px]',
      },
    },
    onUpdate: ({ editor }) => {
      setContentJSON(JSON.stringify(editor.getJSON()));
    }
  })

  // Listen for clicks outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && toolbarRef.current.contains(e.target as globalThis.Node)) {
        return;
      }
      setActiveDropdown(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-fill from AI Redactor
  useEffect(() => {
    if (editorPrefill && editorPrefill.type === 'article' && editor) {
      if (editorPrefill.title) setTitle(editorPrefill.title)
      if (editorPrefill.subtitle) setSubtitle(editorPrefill.subtitle)
      if (editorPrefill.draftId) setDraftId(editorPrefill.draftId)
      
      // The content is now pre-compiled into a ProseMirror JSON Document AST by the backend
      try {
        editor.commands.setContent(editorPrefill.content)
      } catch (e) {
        console.error('Failed to set ProseMirror content:', e)
      }
      
      setEditorPrefill(null) // clear to avoid loop
    }
  }, [editorPrefill, editor, setEditorPrefill])

  const substackHistory = history.filter(h =>
    h.platforms.some(p => p === 'substack-article')
  ).slice(0, 10)

  useEffect(() => { loadQueue() }, [])
  async function loadQueue() {
    try {
      const data = await api<ScheduledPost[]>('/api/substack/scheduled')
      setQueue(data)
    } catch { /* silent */ }
  }

  // Auto-save logic
  useEffect(() => {
    if (!draftId) return;

    const handler = setTimeout(async () => {
      try {
        await api(`/api/substack/drafts/update/${draftId}`, {
          method: 'PUT',
          body: JSON.stringify({
            draft_title: title.trim() || 'Sin título',
            draft_subtitle: subtitle.trim(),
            draft_podcast_url: null,
            draft_podcast_duration: null,
            draft_body: contentJSON,
            section_chosen: false,
            draft_section_id: null,
            audience: 'everyone',
            type: 'newsletter'
          })
        })
        setLastSaved(new Date())
      } catch (e) {
        console.error('Autosave error', e)
      }
    }, 1500)

    return () => clearTimeout(handler)
  }, [draftId, title, subtitle, contentJSON])

  const handleTitleBlur = () => {
    if (title.trim() && !draftId && !creatingDraft) {
      handleCreateDraft()
    }
  }

  const getScheduleDiffText = () => {
    if (!isScheduled || !scheduleAt) return 'Enviar a todos ahora'
    const now = new Date()
    const target = new Date(scheduleAt)
    const diffMs = target.getTime() - now.getTime()
    if (diffMs <= 0) return 'Enviar a todos ahora'
    
    const diffHours = diffMs / (1000 * 60 * 60)
    if (diffHours < 24) {
      const h = Math.max(1, Math.floor(diffHours))
      return `Envía a todos en ${h} hora${h === 1 ? '' : 's'}`
    }
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) {
      return `Envía a todos en ${diffDays} día${diffDays === 1 ? '' : 's'}`
    }
    const months = Math.floor(diffDays / 30)
    const extraDays = diffDays % 30
    if (extraDays === 0) {
      return `Envía a todos en ${months} mes${months === 1 ? '' : 'es'}`
    }
    return `Envía a todos en ${months} mes${months === 1 ? '' : 'es'} y ${extraDays} día${extraDays === 1 ? '' : 's'}`
  }

  // Handle formatting tool commands via TipTap instead of Markdown injection
  const runCommand = (command: () => void) => {
    if (!editor) return;
    command();
    editor.commands.focus();
  }

  const handleUndo = () => editor?.chain().focus().undo().run()
  const handleRedo = () => editor?.chain().focus().redo().run()

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    if (url === null) { return }
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  async function publish() {
    const isNote = editorPrefill?.type === 'note'
    
    if (!editor?.getText().trim()) { alert('Escribe el contenido'); return }
    if (!isNote && !title.trim()) { alert('Escribe el título'); return }
    if (!isNote && isScheduled && !scheduleAt) { alert('Selecciona la fecha y hora de programación'); return }

    setPublishing(true); setResult(null)
    try {
      const isoSchedule = (!isNote && isScheduled && scheduleAt) ? new Date(scheduleAt).toISOString() : new Date().toISOString()
      
      const endpoint = isNote ? '/api/substack/note' : '/api/substack/publish'
      
      const bodyPayload = isNote ? {
        content: JSON.stringify(editor.getJSON())
      } : {
        title: title.trim(),
        subtitle: subtitle.trim(),
        content: JSON.stringify(editor.getJSON()),
        scheduleAt: isoSchedule,
        draftId,
        type: 'article' as PublishType
      }

      await api<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
      })

      const post: ScheduledPost = {
        id: uid(), type: 'article', title, content: editor.getText().slice(0, 100), // Store a snippet for display
        scheduleAt: isoSchedule,
        status: 'pending',
      }
      try {
        await api('/api/substack/scheduled', {
          method: 'POST',
          body: JSON.stringify(post),
        })
      } catch (e) { console.warn('Local queue not available:', e) }
      
      await addCalEvent({
        id: uid(),
        topicId: null,
        topicTitle: title || editor.getText().slice(0, 60),
        date: scheduleAt.slice(0, 10),
        platform: 'substack-article',
        status: 'pending',
      })
      
      setResult({ ok: true, msg: isScheduled ? `Programado para ${new Date(isoSchedule).toLocaleString('es-MX')}` : `Publicado con exito` })
      loadQueue()

      setTitle('')
      setSubtitle('')
      editor?.commands.setContent('')
      setScheduleAt('')
      setIsScheduled(false)
      setPublishStep('edit')
      setDraftId(null)
      setLastSaved(null)
    } catch (e) {
      setResult({ ok: false, msg: String(e) })
    }
    setPublishing(false)
  }

  const handleContinue = () => {
    const isNote = editorPrefill?.type === 'note'
    if (!editor?.getText().trim()) { alert('El contenido no puede estar vacío'); return }
    if (!isNote && !title.trim()) { alert('El artículo debe tener un título'); return }
    setPublishStep('settings')
  }

  const handleCreateDraft = async () => {
    if (!title.trim()) { alert('El título es requerido para inicializar el borrador.'); return }
    setCreatingDraft(true)
    try {
      const res = await api<any>('/api/substack/drafts/create', {
        method: 'POST',
        body: JSON.stringify({ draft_title: title, draft_subtitle: subtitle })
      });
      if (res.id) {
        setDraftId(String(res.id))
      }
    } catch(e) {
      alert('Error creando borrador: ' + String(e));
    }
    setCreatingDraft(false)
  }

  async function cancelScheduled(id: string) {
    await api('/api/substack/scheduled', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
    loadQueue()
  }

  const pendingQueue = queue.filter(p => p.status === 'pending')
  const recentQueue  = queue.filter(p => p.status !== 'pending').slice(-5)

  // Substack Native Editor Colors & Layout Clone
  return (
    <div className="flex flex-col h-full bg-white rounded-t-xl overflow-hidden shadow-2xl min-h-[85vh]">
      {publishStep === 'edit' && (
        <div className="flex-1 overflow-y-auto bg-[var(--bg-muted)] pb-32">
          {/* Header Superior - Modo Editar */}
          <div className="flex bg-white items-center justify-between px-6 py-3 border-b border-[var(--border)] text-[var(--text-primary)]">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 flex items-center justify-center">
                <SubstackIcon className="text-white w-6 h-6" />
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-primary)]">KevinGarza</span> 
                {draftId && (
                  <span className="text-[var(--text-muted)] animate-pulse transition-all">
                    {lastSaved ? `Guardado a las ${lastSaved.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Guardando...'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 relative z-50">
              <div className="flex gap-2 justify-end">
                <button 
                  onClick={handleCreateDraft}
                  disabled={creatingDraft || draftId !== null}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] px-4 py-1.5 transition-colors disabled:opacity-50"
                >
                  {draftId ? '✅ Borrador' : (creatingDraft ? 'Guardando...' : 'Guardar Borrador')}
                </button>
                <button 
                  onClick={handleContinue}
                  disabled={!draftId}
                  className="bg-[#6b21a8] hover:bg-[#581c87] text-white px-6 py-1.5 font-semibold rounded-full text-[15px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuar
                </button>
              </div>
              {result && (
                <div className={`absolute top-full mt-2 right-0 px-3 py-1.5 rounded text-sm font-medium shadow-xl whitespace-nowrap ${result.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {result.msg}
                </div>
              )}
            </div>
          </div>
          
          {/* Editor Toolbar */}
          <div ref={toolbarRef} className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-muted)] flex-wrap relative w-full z-20">
            <button onClick={handleUndo} disabled={!editor?.can().undo()} className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"><Undo size={16} /></button>
            <button onClick={handleRedo} disabled={!editor?.can().redo()} className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"><Redo size={16} /></button>
            <div className="w-[1px] h-4 bg-[var(--border)] mx-1"></div>
            
            <div className="relative">
            <button 
              onClick={() => setActiveDropdown(activeDropdown === 'style' ? null : 'style')}
              className={`flex items-center gap-1.5 p-1.5 px-2 rounded text-[13px] font-medium tracking-wide transition-colors ${activeDropdown === 'style' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'}`}
            >
              Estilo <ChevronDown size={14} />
            </button>
            {activeDropdown === 'style' && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-52 bg-white border border-[var(--border)] rounded-lg shadow-2xl py-2 flex flex-col z-50">
                <button onClick={() => { runCommand(() => editor?.chain().setParagraph().run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm group whitespace-nowrap ${editor?.isActive('paragraph') ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <Pilcrow size={14} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-5" /> <span className="flex-1 text-left">Texto normal</span> {editor?.isActive('paragraph') && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().toggleHeading({ level: 1 }).run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group whitespace-nowrap ${editor?.isActive('heading', { level: 1 }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <span className="font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-5 text-center font-serif text-[13px]">H1</span> <span className="flex-1 text-left">Encabezado 1</span> {editor?.isActive('heading', { level: 1 }) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().toggleHeading({ level: 2 }).run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group whitespace-nowrap ${editor?.isActive('heading', { level: 2 }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <span className="font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-5 text-center font-serif text-[12px]">H2</span> <span className="flex-1 text-left">Encabezado 2</span> {editor?.isActive('heading', { level: 2 }) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().toggleHeading({ level: 3 }).run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group whitespace-nowrap ${editor?.isActive('heading', { level: 3 }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <span className="font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-5 text-center font-serif text-[11px]">H3</span> <span className="flex-1 text-left">Encabezado 3</span> {editor?.isActive('heading', { level: 3 }) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().toggleHeading({ level: 4 }).run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group whitespace-nowrap ${editor?.isActive('heading', { level: 4 }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <span className="font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-5 text-center font-serif text-[10px]">H4</span> <span className="flex-1 text-left">Encabezado 4</span> {editor?.isActive('heading', { level: 4 }) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().toggleHeading({ level: 5 }).run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group whitespace-nowrap ${editor?.isActive('heading', { level: 5 }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <span className="font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-5 text-center font-serif text-[10px]">H5</span> <span className="flex-1 text-left">Encabezado 5</span> {editor?.isActive('heading', { level: 5 }) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().toggleHeading({ level: 6 }).run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group whitespace-nowrap ${editor?.isActive('heading', { level: 6 }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <span className="font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-5 text-center font-serif text-[10px]">H6</span> <span className="flex-1 text-left">Encabezado 6</span> {editor?.isActive('heading', { level: 6 }) && <Check size={14} />}
                </button>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[var(--border)] mx-1"></div>
          
          <button onClick={() => runCommand(() => editor?.chain().toggleBold().run())} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded font-serif font-bold text-[15px] leading-none flex items-center justify-center w-7 h-7 transition-colors ${editor?.isActive('bold') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>B</button>
          <button onClick={() => runCommand(() => editor?.chain().toggleItalic().run())} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded font-serif italic text-[15px] leading-none flex items-center justify-center w-7 h-7 transition-colors ${editor?.isActive('italic') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>I</button>
          <button onClick={() => runCommand(() => editor?.chain().toggleStrike().run())} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded font-sans line-through text-[14px] leading-none flex items-center justify-center w-7 h-7 transition-colors ${editor?.isActive('strike') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>S</button>
          <button onClick={() => runCommand(() => editor?.chain().toggleCodeBlock().run())} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors ${editor?.isActive('codeBlock') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><Code size={16} /></button>
          <div className="w-[1px] h-4 bg-[var(--border)] mx-1"></div>
          
          <button onClick={setLink} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors ${editor?.isActive('link') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><LinkIcon size={16} /></button>
          
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
          <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><ImageIcon size={16} /></button>
          
          <button className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><Headphones size={16} /></button>
          <button className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><Video size={16} /></button>
          <button onClick={() => runCommand(() => editor?.chain().toggleBlockquote().run())} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors ${editor?.isActive('blockquote') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><MessageSquare size={16} /></button>
          <div className="w-[1px] h-4 bg-[var(--border)] mx-1"></div>
          
          <button onClick={() => runCommand(() => editor?.chain().toggleBulletList().run())} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors ${editor?.isActive('bulletList') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><List size={16} /></button>
          <button onClick={() => runCommand(() => editor?.chain().toggleOrderedList().run())} className={`p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors ${editor?.isActive('orderedList') ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><ListOrdered size={16} /></button>

          {/* Alineación Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setActiveDropdown(activeDropdown === 'align' ? null : 'align')}
              className={`flex items-center gap-0.5 p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors ${(activeDropdown === 'align' || editor?.isActive({ textAlign: 'left' }) || editor?.isActive({ textAlign: 'center' }) || editor?.isActive({ textAlign: 'right' }) || editor?.isActive({ textAlign: 'justify' })) ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              {(editor?.isActive({ textAlign: 'center' }) && <AlignCenter size={16} />) ||
               (editor?.isActive({ textAlign: 'right' }) && <AlignRight size={16} />) ||
               (editor?.isActive({ textAlign: 'justify' }) && <AlignJustify size={16} />) ||
               <AlignLeft size={16} />}
              <ChevronDown size={12} className="ml-0.5 text-[var(--text-muted)]" />
            </button>
            {activeDropdown === 'align' && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white border border-[var(--border)] rounded-lg shadow-2xl py-2 flex flex-col z-50">
                <button onClick={() => { runCommand(() => editor?.chain().setTextAlign('left').run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm group ${editor?.isActive({ textAlign: 'left' }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <AlignLeft size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" /> <span className="flex-1 text-left">Izquierda</span> {editor?.isActive({ textAlign: 'left'}) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().setTextAlign('center').run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group ${editor?.isActive({ textAlign: 'center' }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <AlignCenter size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" /> <span className="flex-1 text-left">Centrar</span> {editor?.isActive({ textAlign: 'center'}) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().setTextAlign('right').run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group ${editor?.isActive({ textAlign: 'right' }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <AlignRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" /> <span className="flex-1 text-left">Derecha</span> {editor?.isActive({ textAlign: 'right'}) && <Check size={14} />}
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().setTextAlign('justify').run()); setActiveDropdown(null) }} className={`flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm group ${editor?.isActive({ textAlign: 'justify' }) ? 'bg-[var(--bg-muted)]' : ''}`}>
                  <AlignJustify size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" /> <span className="flex-1 text-left">Justificar</span> {editor?.isActive({ textAlign: 'justify'}) && <Check size={14} />}
                </button>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[var(--border)] mx-1"></div>
          
          {/* Botón Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setActiveDropdown(activeDropdown === 'button' ? null : 'button')}
              className={`flex items-center gap-1.5 p-1.5 px-2 rounded text-[13px] font-medium tracking-wide transition-colors ${activeDropdown === 'button' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'}`}
            >
              Botón <ChevronDown size={14} />
            </button>
            {activeDropdown === 'button' && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-56 bg-white border border-[var(--border)] rounded-lg shadow-2xl py-2 flex flex-col z-50 overflow-hidden">
                {[
                  'Suscribirse', 'Suscribirse con leyenda', 'Compartir post', 'Compartir post con leyenda',
                  'Compartir publicación', 'Deja un comentario', 'Enviar un mensaje', 'Únete al chat'
                ].map(b => (
                  <button 
                    key={b} 
                    onClick={() => {
                      if (b === 'Suscribirse con leyenda') {
                        editor?.commands.insertContent({ type: 'subscribe_widget' })
                        editor?.commands.focus()
                      }
                      setActiveDropdown(null)
                    }} 
                    className="flex items-center px-4 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] text-left whitespace-nowrap"
                  >
                    {b}
                  </button>
                ))}
                <div className="h-[1px] bg-[var(--border)] my-1"></div>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center px-4 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] text-left whitespace-nowrap">Personalizado...</button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center px-4 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] text-left whitespace-nowrap">Más...</button>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[var(--border)] mx-1"></div>
          
          {/* Más Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setActiveDropdown(activeDropdown === 'more' ? null : 'more')}
              className={`flex items-center gap-1.5 p-1.5 px-2 rounded text-[13px] font-medium tracking-wide transition-colors ${activeDropdown === 'more' ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'}`}
            >
              Más <ChevronDown size={14} />
            </button>
            {activeDropdown === 'more' && (
              <div className="absolute top-full right-0 mt-1 w-[260px] bg-white border border-[var(--border)] rounded-lg shadow-2xl py-2 flex flex-col z-50">
                <button onClick={() => { runCommand(() => editor?.chain().toggleCodeBlock().run()); setActiveDropdown(null) }} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <Braces size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">Bloque de código</span>
                </button>
                <button onClick={() => { runCommand(() => editor?.chain().setHorizontalRule().run()); setActiveDropdown(null) }} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <Minus size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">Divisor</span>
                </button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <BarChart3 size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">Gráfico financiero</span>
                </button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <Asterisk size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">Nota a pie de página</span>
                </button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <Sigma size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">LaTeX</span>
                </button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <Feather size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">Poesía</span>
                </button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <BarChart2 size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4 transform rotate-90" /> <span className="flex-1 text-left">Encuesta</span>
                </button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <Coins size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">Mercado de predicciones</span>
                </button>
                <button onClick={() => setActiveDropdown(null)} className="flex items-center gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[13px] font-semibold group whitespace-nowrap">
                  <Utensils size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] w-4" /> <span className="flex-1 text-left">Receta</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Editor Canvas */}
        <div className="p-8 md:p-12 md:px-16 max-w-[800px] mx-auto min-h-[600px] flex flex-col items-center select-none cursor-text">
          <div className="w-full">
            <button className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors uppercase tracking-[0.05em] mb-8 bg-[var(--bg-muted)] px-3 py-1.5 rounded-md hover:bg-[var(--bg-hover)]">
              <LayoutTemplate size={13} strokeWidth={2.5} /> Encabezado / pie de página del correo electrónico
            </button>

            <input 
              type="text" 
              value={title} 
              onBlur={handleTitleBlur}
              onChange={e => setTitle(e.target.value)} 
              className="w-full bg-transparent border-none outline-none text-[40px] font-extrabold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-0 p-0 mb-4 font-serif leading-tight"
              placeholder="Título" 
            />
            
            <input 
              type="text" 
              value={subtitle} 
              onChange={e => setSubtitle(e.target.value)} 
              className="w-full bg-transparent border-none outline-none text-[22px] text-[var(--text-muted)] placeholder:text-[var(--text-muted)] focus:ring-0 p-0 mb-6 font-serif font-light leading-snug"
              placeholder="Añade un subtítulo..." 
            />
            
            <div className="flex items-center gap-3 mb-8 select-none">
              <div className="flex items-center gap-1.5 bg-[var(--bg-muted)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer border border-[var(--border)]">
                Kevin Garza <span className="bg-[var(--bg-muted)] text-[var(--text-muted)] rounded-full w-4 h-4 flex items-center justify-center ml-1"><X size={10} /></span>
              </div>
              <button className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"><Plus size={18} /></button>
            </div>


            <div className="mt-8 mb-4">
              <style>
                {`
                  .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: var(--text-muted);
                    pointer-events: none;
                    height: 0;
                  }
                  .ProseMirror p {
                    margin-top: 1.2em;
                    margin-bottom: 1.2em;
                    line-height: 1.75;
                    font-size: 1.125rem;
                    color: var(--text-primary);
                  }
                  .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6 {
                    color: var(--text-primary);
                  }
                  .ProseMirror h1 { font-size: 2.25rem; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.2; }
                  .ProseMirror h2 { font-size: 1.875rem; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.3; }
                  .ProseMirror h3 { font-size: 1.5rem; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; }
                  .ProseMirror blockquote { border-left: 4px solid var(--border); padding-left: 1rem; color: var(--text-secondary); font-style: italic; }
                  .ProseMirror code { background-color: var(--bg-muted); color: var(--text-primary); padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
                  .ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; margin-top: 1em; margin-bottom: 1em; color: var(--text-primary); }
                  .ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; margin-top: 1em; margin-bottom: 1em; color: var(--text-primary); }
                  .ProseMirror a { color: var(--teck-color); text-decoration: underline; cursor: pointer; }
                `}
              </style>
              <EditorContent editor={editor} className="font-serif outline-none" />
            </div>
          </div>
        </div>
        </div>
      )}

      {publishStep === 'settings' && (
        <div className="flex-1 overflow-y-auto min-h-screen bg-white pb-32 text-[var(--text-primary)]">
          
          {/* Header Superior - Modo Settings */}
          {result && (
            <div className={`absolute top-4 right-6 px-4 py-2 rounded text-sm font-medium shadow-xl z-50 whitespace-nowrap ${result.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {result.msg}
            </div>
          )}

          <div className="max-w-2xl mx-auto mt-12 px-6 flex flex-col gap-6">
            
            {/* AUDIENCIA */}
            <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg p-5">
              <h3 className="font-bold mb-4 text-[15px]">Audiencia</h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${audience === 'everyone' ? 'border-[var(--teck-color)]' : 'border-[var(--border)] group-hover:border-[var(--text-muted)]'}`}>
                    {audience === 'everyone' && <div className="w-2.5 h-2.5 rounded-full bg-[var(--teck-color)]"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={audience === 'everyone'} onChange={() => setAudience('everyone')} />
                  <span className="text-sm">Todos</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${audience === 'paid' ? 'border-[var(--teck-color)]' : 'border-[var(--border)] group-hover:border-[var(--text-muted)]'}`}>
                    {audience === 'paid' && <div className="w-2.5 h-2.5 rounded-full bg-[var(--teck-color)]"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={audience === 'paid'} onChange={() => setAudience('paid')} />
                  <span className="text-sm text-[var(--text-muted)] line-through">Exclusivo para suscriptores de pago</span>
                  <a href="#" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">(Activa las suscripciones de pago)</a>
                </label>
              </div>
            </div>

            {/* COMENTARIOS */}
            <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg p-5">
              <h3 className="font-bold mb-4 text-[15px]">Permitir comentarios de...</h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${comments === 'everyone' ? 'border-[var(--teck-color)]' : 'border-[var(--border)] group-hover:border-[var(--text-muted)]'}`}>
                    {comments === 'everyone' && <div className="w-2.5 h-2.5 rounded-full bg-[var(--teck-color)]"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={comments === 'everyone'} onChange={() => setComments('everyone')} />
                  <span className="text-sm">Todos</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${comments === 'none' ? 'border-[var(--teck-color)]' : 'border-[var(--border)] group-hover:border-[var(--text-muted)]'}`}>
                    {comments === 'none' && <div className="w-2.5 h-2.5 rounded-full bg-[var(--teck-color)]"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={comments === 'none'} onChange={() => setComments('none')} />
                  <span className="text-sm text-[var(--text-secondary)]">Nadie (desactivar comentarios)</span>
                </label>
              </div>
            </div>

            {/* ETIQUETAS */}
            <div className="bg-transparent p-1">
              <h3 className="font-bold mb-3 text-[15px] -ml-1">Añadir etiquetas</h3>
              <div className="relative">
                <select className="w-full bg-[var(--bg-muted)] border border-[var(--border)] hover:border-[var(--text-muted)] rounded-lg px-4 py-3 text-sm text-[var(--text-muted)] appearance-none focus:outline-none transition-colors">
                  <option value="">Selecciona o crea etiquetas</option>
                  <option value="tag1">Productividad</option>
                  <option value="tag2">Tecnología</option>
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              </div>
            </div>

            {/* VISTA PREVIA SOCIAL */}
            <div className="bg-transparent p-1 mt-2">
              <h3 className="font-bold mb-3 text-[15px] -ml-1">Vista previa social</h3>
              <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg p-6">
                <h4 className="font-bold text-lg mb-1 leading-tight">{title || 'Sin Título'}</h4>
                <p className="text-[var(--text-muted)] text-[15px] mb-4">{subtitle || 'Subtítulo'}</p>
                <p className="text-[var(--text-muted)] text-sm">transformateck.substack.com</p>
              </div>
            </div>

            {/* PRUEBA A/B */}
            <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg p-5 flex items-center justify-between cursor-pointer group hover:bg-[var(--bg-hover)] transition-colors">
              <div>
                <h3 className="font-bold text-[15px] mb-1">Realizar una prueba de título</h3>
                <p className="text-sm text-[var(--text-muted)]">Prueba diferentes títulos de post y publica automáticamente el ganador</p>
              </div>
              <div className="w-10 h-6 bg-[var(--border)] rounded-full flex items-center p-0.5 pointer-events-none">
                 <div className="w-5 h-5 bg-white rounded-full shadow-sm"></div>
              </div>
            </div>

            {/* ENTREGA Y PROGRAMACION */}
            <div className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg p-5 mb-16">
              <h3 className="font-bold mb-4 text-[15px]">Entrega</h3>
              <label className="flex items-center gap-3 cursor-pointer group mb-8">
                <div className={`w-5 h-5 rounded bg-[var(--teck-color)] flex items-center justify-center transition-colors`}>
                  <Check size={14} strokeWidth={3} className="text-white" />
                </div>
                <input type="checkbox" className="hidden" checked readOnly />
                <span className="text-sm font-medium">Envía por correo electrónico y la app de Substack.</span>
              </label>

              <h3 className="font-bold mb-4 text-[15px]">Programación</h3>
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border border-[var(--border)] flex items-center justify-center transition-colors ${isScheduled ? 'bg-[var(--teck-color)] border-[var(--teck-color)]' : 'bg-transparent text-transparent group-hover:border-[var(--text-muted)]'}`}>
                    <Check size={14} strokeWidth={3} className={isScheduled ? 'text-white' : 'text-transparent'} />
                  </div>
                  <input type="checkbox" className="hidden" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} />
                  <span className="text-sm">Programa un horario para enviar correos y publicar</span>
                </label>
                
                {isScheduled && (() => {
                  const now = new Date()
                  const minDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                  
                  const future = new Date(now)
                  future.setMonth(future.getMonth() + 3)
                  const maxDate = new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

                  return (
                    <div className="ml-8 mt-1">
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        min={minDate}
                        max={maxDate}
                        onChange={e => setScheduleAt(e.target.value)}
                        className="bg-transparent text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--text-muted)] px-4 py-3 w-full max-w-sm rounded-[5px] text-[15px] focus:outline-none focus:border-[var(--teck-color)] transition-colors"
                      />
                    </div>
                  )
                })()}
              </div>
            </div>

          </div>

          {/* Footer Fijo de configuracion */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] p-4 px-6 flex justify-end items-center gap-3 z-50 w-full mb-0 pb-6 rounded-b-xl max-h-min" style={{ position: 'sticky' }}>
            <button 
              onClick={() => setPublishStep('edit')}
              className="text-[var(--text-primary)] hover:text-[var(--text-primary)] px-5 py-2 text-[15px] font-semibold transition-colors rounded-lg bg-[var(--bg-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border)] cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              onClick={publish} 
              disabled={publishing || (isScheduled && !scheduleAt)}
              className="bg-[var(--teck-color)] hover:bg-emerald-600 text-white px-6 py-2 font-bold rounded-lg text-[15px] transition-colors disabled:opacity-50 cursor-pointer shadow-lg"
            >
              {publishing ? '...' : getScheduleDiffText()}
            </button>
          </div>
        </div>
      )}

      {/* Side Panel placeholder / Calendar view */}
    </div>
  )
}
