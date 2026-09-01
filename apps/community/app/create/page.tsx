'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Bold, Code2, ImagePlus, Italic, Link2, List, ListOrdered, MoreVertical, Play, Send, Sparkles, X } from 'lucide-react'

const types = [
  { id: 'normal', label: 'Post normal', description: 'Comparte una idea, tutorial o discusión con la comunidad.' },
  { id: 'job', label: 'Vacante / Proyecto', description: 'Publica una oportunidad con stack, presupuesto y modalidad.' },
  { id: 'showcase', label: 'Mostrar proyecto', description: 'Presenta lo que construiste y recibe feedback.' },
]

export default function CreatePage() {
  const [type, setType] = useState('normal')
  const [preview, setPreview] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const current = types.find(item => item.id === type) ?? types[0]

  return <main className="create-page"><header className="create-topbar"><Link href="/" className="create-brand"><ArrowLeft size={18} /> Avocado</Link><div className="create-mode"><button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>Editar</button><button className={preview ? 'active' : ''} onClick={() => setPreview(true)}>Vista previa</button></div><Link href="/" className="create-close" aria-label="Cerrar"><X size={21} /></Link></header><div className="create-layout"><section className="editor-surface"><div className="type-picker" aria-label="Tipo de publicación">{types.map(item => <button key={item.id} className={type === item.id ? 'selected' : ''} onClick={() => setType(item.id)}><span>{item.label}</span><small>{item.description}</small></button>)}</div>{preview ? <div className="create-preview"><p className="eyebrow">{current.label}</p><h1>{title || 'Tu título aparece aquí'}</h1><div className="preview-copy">{body || 'Comienza a escribir para ver una vista previa de tu publicación.'}</div></div> : <><input className="create-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Título de tu publicación" aria-label="Título" /><input className="create-tags" placeholder="Añade hasta 4 tags..." aria-label="Tags" /><div className="editor-toolbar create-toolbar"><div><button aria-label="Negrita"><Bold size={18} /></button><button aria-label="Cursiva"><Italic size={18} /></button><button aria-label="Enlace"><Link2 size={18} /></button><button aria-label="Lista"><List size={18} /></button><button aria-label="Lista numerada"><ListOrdered size={18} /></button><button aria-label="Código"><Code2 size={18} /></button><button aria-label="Imagen"><ImagePlus size={18} /></button></div><button aria-label="Más opciones"><MoreVertical size={18} /></button></div><textarea className="create-body" value={body} onChange={event => setBody(event.target.value)} placeholder={type === 'job' ? 'Describe la oportunidad, presupuesto, stack y modalidad...' : type === 'showcase' ? 'Cuenta qué construiste, cómo funciona y dónde probarlo...' : 'Escribe el contenido usando Markdown...'} aria-label="Contenido" /></>}</section><aside className="create-help"><div className="create-help-head"><Sparkles size={18} /><strong>{current.label}</strong></div><p>{current.description}</p><div className="help-rule" /><strong>Consejos para publicar</strong><ul><li>Usa un título claro y específico.</li><li>Añade contexto para iniciar una buena conversación.</li><li>Elige tags que ayuden a encontrar tu publicación.</li></ul></aside></div><footer className="create-footer"><div><button className="publish-button" onClick={() => alert('Publicación guardada como borrador')}><Send size={15} /> Publicar</button><button className="draft-button" onClick={() => alert('Borrador guardado')}>Guardar borrador</button></div><span><Play size={14} /> Markdown compatible</span></footer></main>
}
