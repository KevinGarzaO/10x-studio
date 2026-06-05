'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { Search, Filter, SlidersHorizontal, MoreHorizontal, User, Loader2 } from 'lucide-react'

interface Subscriber {
  id: string
  email: string
  name: string
  type: 'free' | 'paid' | 'comp'
  createdAt: string
  country: string
  active: boolean
  stars: number | null
  opens7d: number | null
  opens30d: number | null
  opens6m: number | null
  revenue: number | null
  source: string
}

function mapSubscriber(s: any): Subscriber {
  return {
    id:           s.subscription_id?.toString() || s.user_id?.toString() || s.id,
    email:        s.user_email_address || s.email,
    name:         s.user_name || s.name || s.display_name || '',
    type:         s.subscription_interval || s.subscription_type || s.type || 'free',
    createdAt:    s.subscription_created_at ? s.subscription_created_at.slice(0, 10) : (s.created_at ? s.created_at.slice(0, 10) : ''),
    country:      s.country || '',
    active:       s.active !== false && s.is_subscribed !== false,
    stars:        s.activity_rating ?? s.engagement_stars ?? s.stars ?? null,
    opens7d:      s.email_opens_7d     ?? s.opens7d     ?? s.opens_7_days    ?? null,
    opens30d:     s.email_opens_30d    ?? s.opens30d    ?? s.opens_30_days   ?? null,
    opens6m:      s.email_opens_180d   ?? s.opens6m     ?? s.opens_180_days  ?? null,
    revenue:      s.total_revenue_generated != null ? s.total_revenue_generated : (s.revenue_cents != null ? s.revenue_cents / 100 : (s.revenue != null ? Number(s.revenue) : null)),
    source:       s.source ?? s.signup_source ?? '',
  }
}

export function SubstackSubscribers() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [globalFilterValue, setGlobalFilterValue] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true); setError('')
    let isMounted = true;
    try {
      const sub = await api<any>('/api/substack/profile')
      if (!sub || sub.error) throw new Error('No estás conectado a Substack.')

      // Fast request to get total count
      const firstData = await api<any>(`/api/substack/subscribers?limit=1&offset=0`)
      if (firstData.error) throw new Error(firstData.error)
      if (isMounted) setTotal(firstData.total || 0);

      // Fetch all for current client-side rendering mimicry
      const data = await api<any>(`/api/substack/subscribers?limit=3000&offset=0`);
      if (data.error) throw new Error(data.error)

      const raw = data.subscribers || [];
      const allFetchedSubs = Array.isArray(raw) ? raw.map(mapSubscriber) : [];
      
      if (isMounted) {
        setSubscribers(allFetchedSubs);
        setTotal(firstData.total || allFetchedSubs.length);
      }
    } catch (e: any) { 
      if (isMounted) setError(String(e.message || e)) 
    } finally {
      if (isMounted) setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const filteredSubscribers = useMemo(() => {
    if (!globalFilterValue) return subscribers;
    const lower = globalFilterValue.toLowerCase()
    return subscribers.filter(s => s.email.toLowerCase().includes(lower) || s.name.toLowerCase().includes(lower))
  }, [subscribers, globalFilterValue])

  return (
    <div className="flex flex-col h-full text-white pb-10">
      {/* Top Bar matching screenshot */}
      <div className="flex items-center justify-between mt-2 mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-bold text-white/90">{total} suscriptores</h2>
          <span className="text-[10px] text-white/50 border border-white/10 px-2 py-0.5 rounded-md self-center">
            Actualizado hace 20 minutos
          </span>
        </div>
        <button className="bg-[#6b21a8] hover:bg-[#581c87] text-white text-[11px] font-semibold px-4 py-1.5 rounded-md transition-colors shadow-sm">
          Añadir suscriptores
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 text-red-400 text-xs mb-4">
          Error: {error}
        </div>
      )}

      {/* Search and Actions Bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-[500px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input 
            type="text" 
            value={globalFilterValue}
            onChange={(e) => setGlobalFilterValue(e.target.value)}
            placeholder="Buscar por nombre o correo electrónico..." 
            className="w-full bg-transparent border border-white/10 rounded-md py-1.5 pl-9 pr-4 text-xs focus:outline-none focus:border-white/30 transition-colors" 
          />
        </div>
        <div className="flex-1"></div>
        <button className="flex items-center gap-2 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors">
          <Filter className="w-3.5 h-3.5" /> Filter <span className="text-[8px] ml-1 opacity-50">▼</span>
        </button>
        <button className="flex items-center gap-1.5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Mostrar
        </button>
        <button className="flex items-center justify-center border border-white/10 rounded-md px-2 py-1.5 text-white/70 hover:bg-white/5 transition-colors">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modern Substack Table UI */}
      <div className="border border-white/10 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        {/* Header */}
        <div className="flex items-center px-4 py-3 bg-[#1c1c1c] border-b border-white/10 text-[11px] text-white/50 select-none">
          <div className="w-8 pl-1"><input type="checkbox" className="rounded-sm bg-black/20 border-white/20 accent-[#6b21a8]" /></div>
          <div className="flex-1">Suscriptor</div>
          <div className="w-28 xl:w-32">Escribe</div>
          <div className="w-28 xl:w-32">Actividad</div>
          <div className="w-36 xl:w-40 flex items-center gap-1 cursor-pointer hover:text-white/70">Fecha de inicio <span className="text-[8px]">▼</span></div>
          <div className="w-24 xl:w-32">Ingresos</div>
          <div className="w-8"></div>
        </div>

        {/* Loading State or Rows */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/40 my-20">
            <Loader2 className="w-6 h-6 animate-spin mr-3" />
            <span className="text-sm">Cargando base de datos...</span>
          </div>
        ) : filteredSubscribers.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/40 my-20 text-sm">
            No se encontraron resultados
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredSubscribers.map((s) => (
              <div key={s.id} className="flex items-center px-4 py-2.5 text-xs border-b border-white/5 hover:bg-white/[0.03] transition-colors last:border-0 group">
                <div className="w-8 pl-1">
                  <input type="checkbox" className="rounded-sm bg-black/20 border-white/20 accent-[#6b21a8] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                
                <div className="flex-1 flex items-center gap-3 min-w-0 pr-4">
                  <div className="w-[22px] h-[22px] rounded-full bg-white/10 flex items-center justify-center text-white/50 overflow-hidden flex-shrink-0">
                    <User className="w-3 h-3" />
                  </div>
                  <span className="font-medium text-[13px] text-white/90 truncate cursor-pointer hover:underline">{s.email}</span>
                </div>
                
                <div className="w-28 xl:w-32">
                  <span className="text-[10px] font-medium border border-white/10 px-2 py-0.5 rounded-md bg-transparent text-white/80 select-none">
                    {s.type === 'paid' ? 'De pago' : 'Gratis'}
                  </span>
                </div>
                
                <div className="w-28 xl:w-32 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span key={star} className={`text-[10px] ${star <= (s.stars || 0) ? 'text-[#eab308]' : 'text-white/10'}`}>★</span>
                  ))}
                </div>
                
                <div className="w-36 xl:w-40 text-[11px] text-white/60">
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </div>
                
                <div className="w-24 xl:w-32 text-white/40 text-[11px]">
                  {s.revenue != null && s.revenue > 0 ? <span className="text-white/80">${s.revenue.toFixed(2)}</span> : '$0.00'}
                </div>
                
                <div className="w-8 flex justify-end text-white/30 hover:text-white/80 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
