'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { FilterMatchMode } from 'primereact/api'
import { api } from '@/lib/api'

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

const TYPE_BADGE: Record<string, string> = {
  paid: 'bg-green-500/10 border-green-500/20 text-green-400 shadow-sm',
  free: 'bg-[#1E3A5F] border-[#1E3A5F] text-[#4A9EFF] shadow-sm font-bold',
  comp: 'bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-sm',
}
const TYPE_LABEL: Record<string, string> = { paid: '💳 Pago', free: '🆓 Gratis', comp: '🎁 Comp.' }

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-brand-secondary">—</span>
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`text-sm ${i <= (value || 0) ? 'text-[#FFB800]' : 'text-[#444444]'}`}>★</span>
      ))}
    </div>
  )
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
  const [subscribers,  setSubscribers]  = useState<Subscriber[]>([])
  const [total,        setTotal]        = useState(0)
  const [globalTopLeads, setGlobalTopLeads] = useState<number>(0)
  const [globalAvgStars, setGlobalAvgStars] = useState<number | string>('—')
  const [loading,      setLoading]      = useState(true)
  const [progressText, setProgressText]  = useState('')
  const [error,        setError]        = useState('')
  const [lastRefreshKey, setLastRefreshKey] = useState(0)
  
  // Datatable State
  const [globalFilterValue, setGlobalFilterValue] = useState('')
  const [filters, setFilters] = useState({
        global: { value: null, matchMode: FilterMatchMode.CONTAINS },
        type: { value: null, matchMode: FilterMatchMode.EQUALS }
  })
  
  const [typeFilter,   setTypeFilter]   = useState<'all' | 'free' | 'paid'>('all')
  
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true); setError(''); setProgressText('Iniciando carga de suscriptores...')
    let isMounted = true;
    try {
      const sub = await api<any>('/api/substack/profile')
      
      if (!sub || sub.error) {
        throw new Error('No estás conectado a Substack.')
      }

      // First request to get the total count
      const firstData = await api<any>(`/api/substack/subscribers?limit=1&offset=0`)
      if (firstData.error) throw new Error(firstData.error)

      const totalCount = firstData.total || 0;
      setTotal(totalCount);
      setGlobalTopLeads(firstData.topLeads || 0);
      setGlobalAvgStars(firstData.avgStars ?? '—');

      if (!isMounted) return;

      setProgressText(`Cargando todos los suscriptores...`);
      
      const data = await api<any>(`/api/substack/subscribers?limit=3000&offset=0`);
      if (data.error) throw new Error(data.error)

      const raw = data.subscribers || [];
      const allFetchedSubs = Array.isArray(raw) ? raw.map(mapSubscriber) : [];
      
      setSubscribers(allFetchedSubs);
      setTotal(firstData.total || allFetchedSubs.length);
      setGlobalTopLeads(data.topLeads || firstData.topLeads || 0);
      setGlobalAvgStars(data.avgStars ?? firstData.avgStars ?? '—');
    } catch (e: any) { 
      if (isMounted) setError(String(e.message || e)) 
    } finally {
      if (isMounted) {
        setLoading(false)
        setProgressText('')
      }
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const onGlobalFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        let _filters = { ...filters };
        _filters['global'].value = value as any;
        setFilters(_filters);
        setGlobalFilterValue(value);
  };

  const handleTypeFilter = (t: 'all' | 'free' | 'paid') => {
        setTypeFilter(t);
        let _filters = { ...filters };
        _filters['type'].value = t === 'all' ? null : (t as any);
        setFilters(_filters);
  };

  // CSV export — includes all engagement fields for CRM
  function exportCSV() {
    const rows = [
      ['Email','Nombre','Tipo','País','Fecha suscripción','Estrellas','Aperturas 7d','Aperturas 30d','Aperturas 6m','Revenue USD','Fuente'],
      ...subscribers.map(s => [
        s.email, s.name, s.type, s.country, s.createdAt,
        s.stars ?? '', s.opens7d ?? '', s.opens30d ?? '', s.opens6m ?? '',
        s.revenue ?? '', s.source,
      ]),
    ]
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `suscriptores-substack-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // CSV import via backend
  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true); setImportResult('')
    try {
      const text    = await file.text()
      const lines   = text.split('\n').filter(Boolean)
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
      const emailIdx = headers.findIndex(h => h === 'email')
      const nameIdx  = headers.findIndex(h => h === 'nombre' || h === 'name')
      if (emailIdx < 0) throw new Error('El CSV necesita una columna "email"')

      const subs = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        return { email: cols[emailIdx], name: nameIdx >= 0 ? cols[nameIdx] : '' }
      }).filter(s => s.email?.includes('@'))

      const data = await api<any>('/api/substack/subscribers', {
         method: 'POST',
         body: JSON.stringify({ subscribers: subs })
      })
      if (data.error) throw new Error(data.error)

      const importedCount = data.imported ?? subs.length
      setImportResult(`✅ ${importedCount} suscriptores importados correctamente`)
      loadAll()
    } catch (err) { setImportResult(`❌ ${String(err)}`) }
    setImporting(false); e.target.value = ''
  }

  // Summary stats (basado en lo filtrado para mayor utilidad)
  // Summary stats ahora globales basados en consultas directas a la base de datos
  const avgStars    = globalAvgStars
  const hotLeads    = globalTopLeads

  // User Row Template
  const userTemplate = (s: Subscriber) => (
    <div className="relative py-1">
      <div className="text-[14px] font-black text-brand-primary truncate max-w-[200px] xl:max-w-[300px]">{s.email}</div>
      {s.name && <div className="text-[13px] font-bold text-brand-secondary truncate max-w-[200px] xl:max-w-[300px] mt-0.5">{s.name}</div>}
      {s.source && <div className="text-[10px] font-bold text-brand-secondary opacity-60 mt-1 uppercase tracking-widest">{s.source}</div>}
    </div>
  );

  const typeTemplate = (s: Subscriber) => (
    <span className={`inline-flex items-center justify-center text-[11px] font-black px-2.5 py-1 rounded-md border whitespace-nowrap ${TYPE_BADGE[s.type] || TYPE_BADGE.free}`}>
      {TYPE_LABEL[s.type] || s.type}
    </span>
  );

  const revenueTemplate = (s: Subscriber) => (
    <span className={`text-[14px] whitespace-nowrap font-black ${s.revenue && s.revenue > 0 ? 'text-green-400' : 'text-[#9B9B9B]'}`}>
      {s.revenue != null ? `$${s.revenue.toFixed(2)}` : '—'}
    </span>
  );

  const renderHeader = () => {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
            <i className="pi pi-search" />
          </span>
          <InputText 
            value={globalFilterValue} 
            onChange={onGlobalFilterChange} 
            placeholder="Buscar por email o nombre..." 
            className="w-full pl-9"
            style={{ borderRadius: '0.75rem', padding: '0.5rem 0.5rem 0.5rem 2.5rem', background: 'var(--color-bg)', border: '1px solid #333333', color: 'var(--color-text-primary)' }}
          />
        </div>
        
        <div className="flex gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border h-[38px] items-center">
          {(['all','free','paid'] as const).map(t => (
            <button 
              key={t} 
              onClick={() => handleTypeFilter(t)}
              className={`tab ${typeFilter === t ? 'tab-active' : 'tab-inactive'} !text-[11px] h-full`}>
              {t === 'all' ? 'Todos' : t === 'paid' ? 'Pago' : 'Gratis'}
            </button>
          ))}
        </div>
        
        <div className="h-6 w-px bg-brand-border mx-1 hidden sm:block"></div>
        
        <button 
          onClick={exportCSV} 
          disabled={subscribers.length === 0}
          className="btn btn-secondary btn-sm gap-1.5 bg-brand-bg"
        >
          <i className="pi pi-download"></i>
          <span>Exportar</span>
        </button>
        
        <label className={`cursor-pointer btn btn-primary btn-sm gap-1.5 ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
           <i className={importing ? "pi pi-spin pi-spinner" : "pi pi-upload"}></i>
           <span>{importing ? 'Cargando...' : 'Importar CSV'}</span>
           <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} disabled={importing} />
        </label>
      </div>
    );
  };

  return (
    <div>
      {importResult && (
        <div className={`mb-6 px-4 py-3 rounded-xl text-sm font-bold shadow-sm ${importResult.startsWith('✅') ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
          {importResult}
        </div>
      )}

      {/* KPI strip Dashboard style */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
        {[
          { label: 'Total DB',       value: total.toLocaleString(),              color: 'text-brand-primary' },
          { label: 'De pago',        value: subscribers.filter(s=>s.type==='paid').length.toLocaleString(), color: 'text-green-400' },
          { label: 'Gratuitos',      value: subscribers.filter(s=>s.type==='free').length.toLocaleString(), color: 'text-brand-secondary' },
          { label: '⭐ Avg Estrellas', value: avgStars,                                color: 'text-brand-primary' },
          { label: '🔥 Top leads',   value: String(hotLeads),                         color: 'text-brand-accent' },
        ].map(k => (
          <div key={k.label} className="bg-brand-surface border border-brand-border shadow-[var(--shadow)] rounded-2xl p-3 md:p-4 text-center hover:-translate-y-0.5 hover:border-brand-accent transition-all duration-300">
            <div className={`text-xl md:text-2xl font-black tracking-tight ${k.color}`}>{k.value}</div>
            <div className="text-[9px] md:text-[10px] font-bold text-brand-secondary uppercase tracking-widest mt-1.5">{k.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm mb-4 flex items-center justify-between">
          <div><strong>Error:</strong> {error}</div>
          <button onClick={() => loadAll()} className="btn btn-secondary btn-sm border-red-500/30 text-red-400 hover:bg-red-500/10">
            Reintentar
          </button>
        </div>
      )}

      {/* Loading Bar */}
      {loading && subscribers.length > 0 && (
        <div className="mb-4 bg-brand-accent/5 border border-brand-accent/10 rounded-xl p-3 flex items-center">
           <i className="pi pi-spin pi-spinner text-brand-accent text-xl mr-3"></i>
           <div className="text-sm text-brand-primary font-medium">{progressText}</div>
           <div className="ml-auto text-xs text-brand-secondary">{subscribers.length} / {total || '?'}</div>
        </div>
      )}

      {/* PrimeReact DataTable Wrapper */}
      {loading && subscribers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-brand-surface rounded-2xl border border-brand-border">
          <i className="pi pi-spin pi-spinner text-brand-accent text-4xl mb-4"></i>
          <span className="text-sm font-medium text-brand-secondary">{progressText || 'Cargando suscriptores...'}</span>
        </div>
      ) : (
        <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-sm overflow-x-auto mb-6 no-scrollbar">
          <DataTable 
            value={subscribers} 
            paginator 
            rows={50} 
            rowsPerPageOptions={[10, 25, 50, 100, 250]}
            dataKey="id" 
            filters={filters} 
            globalFilterFields={['name', 'email']} 
            header={renderHeader()}
            emptyMessage="No se encontraron suscriptores."
            className="p-datatable-sm !text-xs md:!text-sm"
            style={{ minHeight: '400px' }}
            stripedRows
            removableSort
            paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
            currentPageReportTemplate="{first} a {last} de {totalRecords}"
            tableStyle={{ minWidth: '800px' }}
          >
            <Column field="email" header="Usuario" body={userTemplate} sortable style={{ width: '25%' }} headerStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}></Column>
            <Column field="type" header="Tipo" body={typeTemplate} sortable style={{ width: '10%' }} headerStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}></Column>
            <Column field="stars" header="Estrellas" body={(s: Subscriber) => <Stars value={s.stars} />} sortable style={{ width: '15%' }} headerStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}></Column>
            <Column field="opens30d" header="APERT. 30D" sortable style={{ width: '12%', textAlign: 'center' }} headerStyle={{ fontSize: '10px', textTransform: 'uppercase', paddingLeft: '1rem', paddingRight: '1rem' }}></Column>
            <Column field="opens6m" header="APERT. 6M" sortable style={{ width: '12%', textAlign: 'center' }} headerStyle={{ fontSize: '10px', textTransform: 'uppercase', paddingLeft: '1rem', paddingRight: '1rem' }}></Column>
            <Column field="revenue" header="Revenue" body={revenueTemplate} sortable style={{ width: '15%' }} headerStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}></Column>
            <Column field="createdAt" header="Fecha" sortable style={{ width: '11%' }} headerStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}></Column>
          </DataTable>
        </div>
      )}

      {/* CSV format tip */}
      <div className="mt-5 bg-brand-bg border border-brand-border rounded-lg p-4 text-xs text-brand-secondary">
        <strong className="text-brand-primary">PrimeReact DataTable:</strong> Los datos se cargan completamente en el cliente. Puedes ordenar, buscar y paginar de forma nativa con los componentes altamente optimizados de PrimeReact.
      </div>
    </div>
  )
}
