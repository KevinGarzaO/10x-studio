import Link from 'next/link'
import { Bookmark, ArrowUp, MessageCircle, Clock3, MoreHorizontal } from 'lucide-react'
import { AccountLayout } from '@/components/account-pages'

export default function Page() {
  return <AccountLayout active="saved">
    <section className="account-card saved-section">
      <div className="account-section-head"><div><div className="eyebrow">TU COLECCIÓN</div><h1>Guardados</h1><p className="muted">Publicaciones que quieres volver a leer o consultar después.</p></div><span className="count-pill">3 guardados</span></div>
      <div className="saved-list">
        <Link href="/post/1" className="saved-item"><div className="saved-vote"><ArrowUp size={15}/><strong>248</strong></div><div className="saved-copy"><div className="saved-meta"><span className="tag-chip tag-next">#nextjs</span><span>Avocado Studio · hace 2h</span></div><h2>Next.js 16: lo que realmente cambia para tu próximo proyecto</h2><p>Un recorrido práctico por Cache Components, React Compiler y las nuevas APIs que ya puedes usar.</p><div className="saved-footer"><span><MessageCircle size={14}/> 38 comentarios</span><span><Clock3 size={14}/> 8 min de lectura</span></div></div><MoreHorizontal size={18} className="saved-more"/></Link>
        <Link href="/post/2" className="saved-item"><div className="saved-vote"><ArrowUp size={15}/><strong>96</strong></div><div className="saved-copy"><div className="saved-meta"><span className="tag-chip tag-job">#empleos</span><span>Mariana López · ayer</span></div><h2>Buscamos frontend developer para producto educativo</h2><p>Proyecto remoto, equipo pequeño y foco en construir experiencias accesibles.</p><div className="saved-footer"><span><MessageCircle size={14}/> 12 comentarios</span><span><Clock3 size={14}/> 4 min de lectura</span></div></div><MoreHorizontal size={18} className="saved-more"/></Link>
      </div>
      <div className="saved-tip"><Bookmark size={17}/><div><strong>Guarda lo que te inspire</strong><span>Usa el icono de marcador en cualquier publicación para encontrarla aquí.</span></div></div>
    </section>
  </AccountLayout>
}
