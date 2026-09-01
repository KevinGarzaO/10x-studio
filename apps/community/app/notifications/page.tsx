import Link from 'next/link'
import { Bell, MessageCircle, ArrowUp, UserPlus, Briefcase, Check, Settings2 } from 'lucide-react'
import { AccountLayout } from '@/components/account-pages'

export default function Page() {
  return <AccountLayout active="notifications">
    <section className="account-card notifications-section">
      <div className="account-section-head"><div><div className="eyebrow">ACTIVIDAD DE LA COMUNIDAD</div><h1>Notificaciones</h1><p className="muted">Todo lo que ocurre alrededor de tus publicaciones y conversaciones.</p></div><button className="outline-btn notification-action"><Check size={14}/> Marcar todo leído</button></div>
      <div className="notification-tabs"><button className="notification-tab active">Todas <span>4</span></button><button className="notification-tab">Menciones <span>1</span></button><button className="notification-tab">Seguidores</button></div>
      <div className="notification-list">
        <Link href="/post/1" className="notification-item unread"><div className="notification-icon reply"><MessageCircle size={17}/></div><div><strong>Lucía Ramírez respondió a tu publicación</strong><p>“Muy buen resumen de Cache Components, especialmente la parte de...”</p><span className="muted">Hace 12 minutos · Next.js 16: lo que realmente cambia</span></div><i/></Link>
        <Link href="/post/1" className="notification-item unread"><div className="notification-icon vote"><ArrowUp size={17}/></div><div><strong>Tu publicación recibió 8 votos nuevos</strong><p>La comunidad está encontrando útil tu explicación.</p><span className="muted">Hace 1 hora · Avocado</span></div><i/></Link>
        <div className="notification-item"><div className="notification-icon follow"><UserPlus size={17}/></div><div><strong>Mateo Lima empezó a seguirte</strong><p>Ahora verá tus próximas publicaciones en su feed.</p><span className="muted">Ayer</span></div></div>
        <Link href="/post/2" className="notification-item"><div className="notification-icon job"><Briefcase size={17}/></div><div><strong>Nueva oportunidad en tus temas</strong><p>Frontend developer para producto educativo.</p><span className="muted">Ayer · Empleos</span></div></Link>
      </div>
      <div className="notification-settings"><Settings2 size={16}/><span>Configura qué actividad quieres recibir</span><Link href="/settings">Ir a configuración</Link></div>
    </section>
  </AccountLayout>
}
