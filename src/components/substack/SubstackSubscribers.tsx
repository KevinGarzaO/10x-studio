'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { FilterMatchMode } from 'primereact/api'

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
  paid: 'bg-emerald-100/80 border-emerald-200 text-emerald-800 shadow-sm',
  free: 'bg-stone-100/80 border-stone-200 text-stone-700 shadow-sm',
  comp: 'bg-blue-100/80 border-blue-200 text-blue-800 shadow-sm',
}
const TYPE_LABEL: Record<string, string> = { paid: '💳 Pago', free: '🆓 Gratis', comp: '🎁 Comp.' }

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-[#9b9a97]">—</span>
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`text-sm ${i <= value ? 'text-black' : 'text-[#e9e9e7]'}`}>★</span>
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
    opens7d:      s.email_opens_7d     ?? s.opens_7_days    ?? null,
    opens30d:     s.email_opens_30d    ?? s.opens_30_days   ?? null,
    opens6m:      s.email_opens_180d   ?? s.opens_180_days  ?? null,
    revenue:      s.total_revenue_generated != null ? s.total_revenue_generated : (s.revenue_cents != null ? s.revenue_cents / 100 : null),
    source:       s.source ?? s.signup_source ?? '',
  }
}

export function SubstackSubscribers() {
  const [subscribers,  setSubscribers]  = useState<Subscriber[]>([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [progressText, setProgressText]  = useState('')
  const [error,        setError]        = useState('')
  
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
      const infoRes = await fetch('/api/substack/connect')
      const info = await infoRes.json()
      const pubId = info.profile?.pubId || info.profile?.primaryPublication?.id
      const pubSlug = info.profile?.primaryPublication?.subdomain || info.publication

      if (!pubId || !pubSlug) {
        throw new Error('No se pudo encontrar tu ID o subdominio de publicación. Intenta reconectar la extensión.')
      }

      // First request to get the total count
      let extensionTimeout: NodeJS.Timeout;
      const getChunk = (limit: number, offset: number) => {
        return new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('La extensión no respondió a tiempo. ')), 15000);
          const handleResponse = (event: MessageEvent) => {
            if (event.source !== window || !event.data || event.data.type !== 'SUBSTACK_SUBSCRIBERS_RESPONSE') return;
            window.removeEventListener('message', handleResponse);
            clearTimeout(timeout);
            
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.data);
          };
          window.addEventListener('message', handleResponse);
          
          const params = { limit, offset, orderField: "subscription_created_at", dir: "desc" };
          window.postMessage({ type: 'REQUEST_SUBSTACK_SUBSCRIBERS_GET', pubId, pubSlug, params }, '*');
        });
      };

      setProgressText('Calculando el total de suscriptores...');
      const firstData = await getChunk(1, 0);
      const totalCount = firstData.total || 1000;
      setTotal(totalCount);

      if (!isMounted) return;

      // Attempt to fetch all remaining in one go or chunked if totalCount is enormous to avoid stalling/400.
      let fetchedSubs: Subscriber[] = [];
      let off = 0;
      const CHUNK_SIZE = 50; // Use small chunk size as Substack may rigidly enforce max 50 page limits on this endpoint

      while (isMounted && off < totalCount) {
        setProgressText(`Cargados ${fetchedSubs.length} de ${totalCount} suscriptores...`);
        const limitToFetch = Math.min(CHUNK_SIZE, totalCount - off);
        
        try {
           const chunkData = await getChunk(limitToFetch, off);
           const raw = chunkData.subscribers || chunkData || [];
           const chunk = Array.isArray(raw) ? raw.map(mapSubscriber) : [];
           
           fetchedSubs = [...fetchedSubs, ...chunk];
           setSubscribers([...fetchedSubs]); // Update progress live
           
           if (chunk.length === 0) break; // Reached end unexpectedly
        } catch (err) {
           console.error("Chunk failed at offset", off, err);
           throw err; // propagate to show error
        }
        
        off += limitToFetch;
      }
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
    // Basic CSV export logic mapping current table output
    const rows = [
      ['Email','Nombre','Tipo','País','Fecha suscripción','Estrellas','Aperturas 7d','Aperturas 30d','Aperturas 6m','Revenue USD','Fuente'],
      ...subscribers.map(s => [
        s.email, s.name, s.type, s.country, s.createdAt,
        s.stars ?? '', s.opens7d ?? '', s.opens30d ?? '', s.opens6m ?? '',
        s.revenue ?? '', s.source,
      ]),
    ]
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })  // BOM for Excel
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `suscriptores-substack-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // CSV import
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

      const infoRes = await fetch('/api/substack/connect')
      const info = await infoRes.json()
      const pubId = info.profile?.pubId || info.profile?.primaryPublication?.id
      const pubSlug = info.profile?.primaryPublication?.subdomain || info.publication
      if (!pubId || !pubSlug) throw new Error('No se pudo encontrar tu información de publicación.')

      let extensionTimeout: NodeJS.Timeout;
      const timeoutPromise = new Promise((_, reject) => 
        extensionTimeout = setTimeout(() => reject(new Error('La extensión no respondió a tiempo.')), 15000)
      );

      const importPromise = new Promise<any>((resolve, reject) => {
        const handleResponse = (event: MessageEvent) => {
          if (event.source !== window || !event.data || event.data.type !== 'SUBSTACK_SUBSCRIBERS_IMPORT_RESPONSE') return;
          window.removeEventListener('message', handleResponse);
          clearTimeout(extensionTimeout);
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.data);
        };
        window.addEventListener('message', handleResponse);
        window.postMessage({ type: 'REQUEST_SUBSTACK_SUBSCRIBERS_IMPORT', pubId, pubSlug, subscribers: subs }, '*');
      });

      const data = await Promise.race([importPromise, timeoutPromise]) as any;

      const importedCount = data.count ?? data.imported ?? subs.length
      setImportResult(`✅ ${importedCount} suscriptores importados correctamente`)
      loadAll()
    } catch (err) { setImportResult(`❌ ${String(err)}`) }
    setImporting(false); e.target.value = ''
  }

  // Summary stats (basado en lo filtrado para mayor utilidad)
  const withStars   = subscribers.filter(s => s.stars !== null)
  const avgStars    = withStars.length > 0 ? (withStars.reduce((a, s) => a + (s.stars ?? 0), 0) / withStars.length).toFixed(1) : '—'
  const hotLeads    = subscribers.filter(s => (s.stars ?? 0) >= 4).length

  // User Row Template
  const userTemplate = (s: Subscriber) => (
    <div className="relative">
      {s.active === false && <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-6 bg-red-400 rounded-r-md" title="Suscripción inactiva"></span>}
      <div className="text-[14px] font-black text-[#000000] truncate max-w-[200px] xl:max-w-[300px]">{s.email}</div>
      {s.name && <div className="text-[13px] font-bold text-stone-600 truncate max-w-[200px] xl:max-w-[300px] mt-0.5">{s.name}</div>}
      {s.source && <div className="text-[10px] font-bold text-stone-400 mt-1 uppercase tracking-widest">{s.source}</div>}
    </div>
  );

  const typeTemplate = (s: Subscriber) => (
    <span className={`inline-flex items-center justify-center text-[11px] font-black px-2.5 py-1 rounded-md border whitespace-nowrap ${TYPE_BADGE[s.type] || TYPE_BADGE.free}`}>
      {TYPE_LABEL[s.type] || s.type}
    </span>
  );

  const revenueTemplate = (s: Subscriber) => (
    <span className="text-[14px] whitespace-nowrap font-black text-emerald-950">
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
            className="w-full pl-9 p-inputtext-sm" // PrimeReact styling coupled with custom tailwind override
            style={{ borderRadius: '0.75rem', padding: '0.5rem 0.5rem 0.5rem 2.5rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
          />
        </div>
        
        <div className="flex gap-1.5 align-middle">
          {(['all','free','paid'] as const).map(t => (
            <Button 
              key={t} 
              onClick={() => handleTypeFilter(t)}
              label={t === 'all' ? 'Todos' : t === 'paid' ? '💳 Pago' : '🆓 Gratis'}
              className={`p-button-sm !px-4 !py-2 !rounded-xl !text-[11px] !font-bold transition-all duration-300 ${typeFilter === t ? '!bg-stone-900 !border-stone-900 !text-white !shadow-md shadow-stone-900/20' : '!bg-white/60 !border-stone-200 !text-stone-500 hover:!text-stone-800 hover:!border-stone-300 !shadow-sm'}`}
            />
          ))}
        </div>
        
        <div className="h-6 w-px bg-stone-300 mx-1 hidden sm:block"></div>
        
        <Button 
          onClick={exportCSV} 
          disabled={subscribers.length === 0}
          icon="pi pi-download"
          label="Exportar"
          className="p-button-sm p-button-outlined !rounded-xl !text-[11px] !font-bold !bg-white/60 !border-stone-200 !text-stone-600 hover:!bg-stone-50 hover:!text-stone-900 !shadow-sm"
        />
        
        <label className={`cursor-pointer inline-flex items-center px-4 py-2 rounded-xl text-[11px] font-bold bg-stone-900 border border-stone-900 text-white hover:bg-stone-800 transition-all shadow-md shadow-stone-900/20 gap-1.5 ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
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
        <div className={`mb-6 px-4 py-3 rounded-xl text-sm font-bold shadow-sm ${importResult.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {importResult}
        </div>
      )}

      {/* KPI strip Dashboard style */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total DB',       value: total.toLocaleString(),              color: 'text-stone-900' },
          { label: 'De pago',        value: subscribers.filter(s=>s.type==='paid').length.toLocaleString(), color: 'text-emerald-600' },
          { label: 'Gratuitos',      value: subscribers.filter(s=>s.type==='free').length.toLocaleString(), color: 'text-stone-600' },
          { label: '⭐ Avg Estrellas', value: avgStars,                                color: 'text-stone-900' },
          { label: '🔥 Top leads (4-5★)', value: String(hotLeads),                    color: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white/80 backdrop-blur-xl border border-stone-200/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] rounded-2xl p-4 text-center hover:-translate-y-0.5 hover:shadow-md hover:border-stone-300 transition-all duration-300">
            <div className={`text-2xl font-black tracking-tight ${k.color}`}>{k.value}</div>
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1.5">{k.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm mb-4">
          <strong>Error:</strong> {error}
          <Button onClick={() => loadAll()} label="Reintentar" text className="p-button-sm text-red-800 ml-3 bg-red-100 hover:bg-red-200" />
        </div>
      )}

      {/* Loading Bar */}
      {loading && subscribers.length > 0 && (
        <div className="mb-4 bg-teal-50 border border-teal-100 rounded-xl p-3 flex items-center">
           <i className="pi pi-spin pi-spinner text-teal-600 text-xl mr-3"></i>
           <div className="text-sm text-teal-800 font-medium">{progressText}</div>
           <div className="ml-auto text-xs text-teal-600/60">{subscribers.length} / {total || '?'}</div>
        </div>
      )}

      {/* PrimeReact DataTable Wrapper */}
      {loading && subscribers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/50 rounded-2xl border border-stone-200/60">
          <i className="pi pi-spin pi-spinner text-stone-800 text-4xl mb-4"></i>
          <span className="text-sm font-medium text-stone-600">{progressText || 'Cargando suscriptores...'}</span>
        </div>
      ) : (
        <div className="bg-white border border-stone-200/80 rounded-2xl shadow-sm overflow-hidden p-0 mb-6">
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
            className="p-datatable-sm !text-sm"
            style={{ minHeight: '400px' }}
            stripedRows
            removableSort
            paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
            currentPageReportTemplate="{first} a {last} de {totalRecords}"
            tableStyle={{ minWidth: '60rem' }}
          >
            <Column field="email" header="Usuario" body={userTemplate} sortable style={{ width: '25%' }}></Column>
            <Column field="type" header="Tipo" body={typeTemplate} sortable style={{ width: '10%' }}></Column>
            <Column field="stars" header="Estrellas" body={(s: Subscriber) => <Stars value={s.stars} />} sortable style={{ width: '15%' }}></Column>
            <Column field="opens30d" header="Apert. 30d" sortable style={{ width: '10%', textAlign: 'center' }}></Column>
            <Column field="opens6m" header="Apert. 6m" sortable style={{ width: '10%', textAlign: 'center' }}></Column>
            <Column field="revenue" header="Revenue" body={revenueTemplate} sortable style={{ width: '15%' }}></Column>
            <Column field="createdAt" header="Fecha" sortable style={{ width: '15%' }}></Column>
          </DataTable>
        </div>
      )}

      {/* CSV format tip */}
      <div className="mt-5 bg-[#f7f7f5] border border-[#e9e9e7] rounded-lg p-4 text-xs text-[#9b9a97]">
        <strong className="text-black">PrimeReact DataTable:</strong> Los datos se cargan completamente en el cliente. Puedes ordenar, buscar y paginar de forma nativa con los componentes altamente optimizados de PrimeReact.
      </div>
    </div>
  )
}
