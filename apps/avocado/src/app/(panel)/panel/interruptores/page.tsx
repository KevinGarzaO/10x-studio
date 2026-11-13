'use client'

import { useState } from 'react'
import { Card, Empty, ErrorBox, fmtNum, Loading, PageHeader, usePanelData } from '@/components/panel/ui'
import { api } from '@/lib/api'

interface Exposure { total: number; team: number; beta: number; others: number; realAccounts: number }
interface Flag { key: string; description: string; stage: string; stageLabel: string; retire_by: string; daysToRetire: number; overdue: boolean; exposure: Exposure | null; history: { changed_at: string; from_stage: string | null; to_stage: string; note: string | null }[] }
interface FlagsData { ready: boolean; stages?: { key: string; label: string }[]; betaMembers?: number; flags?: Flag[]; error?: string }
interface Members { members: { userId: string; username: string | null; addedAt: string }[] }

const dateOf = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const message = (error: unknown) => (error instanceof Error ? error.message : 'No se pudo')

function FlagCard({ flag, stages, onChanged }: { flag: Flag; stages: { key: string; label: string }[]; onChanged: () => void }) {
  const [target, setTarget] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const exposure = flag.exposure
  const targetLabel = stages.find((stage) => stage.key === target)?.label

  async function apply() {
    if (!target) return
    setBusy(true)
    setProblem(null)
    try {
      await api(`/api/admin/analytics/flags/${flag.key}`, { method: 'PATCH', body: JSON.stringify({ stage: target, note: note || null }) })
      setTarget(null)
      setNote('')
      onChanged()
    } catch (error) {
      setProblem(message(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={flag.key} hint={flag.description}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {stages.map((stage) => (
          <button key={stage.key} type="button" disabled={busy || stage.key === flag.stage} className={`panel-btn${stage.key === flag.stage ? ' primary' : ''}`} onClick={() => setTarget(stage.key)} aria-pressed={stage.key === flag.stage}>
            {stage.label}
          </button>
        ))}
      </div>

      {target && (
        <div role="alertdialog" aria-label="Confirmar cambio" style={{ border: '1px solid var(--p-line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>{flag.stageLabel} → {targetLabel}</strong>.{' '}
            {target === 'off' ? 'La función se apaga para todo el mundo, incluso para el equipo.' : 'Quedará registrado en el historial y en la bitácora de cambios.'}
          </p>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="Nota (opcional): por qué o qué vas a vigilar" style={{ width: '100%', padding: 8, marginBottom: 8 }} />
          <button type="button" className="panel-btn primary" disabled={busy} onClick={apply}>Confirmar</button>{' '}
          <button type="button" className="panel-btn" disabled={busy} onClick={() => setTarget(null)}>Cancelar</button>
        </div>
      )}
      {problem && <p role="alert" style={{ color: '#b42318' }}>{problem}</p>}

      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Les aparece a <strong>{exposure ? fmtNum(exposure.total) : '—'}</strong> cuentas{exposure ? ` (equipo ${fmtNum(exposure.team)}, beta ${fmtNum(exposure.beta)}, otras ${fmtNum(exposure.others)}) de ${fmtNum(exposure.realAccounts)} reales` : ''}.</li>
        <li style={flag.overdue ? { color: '#b42318', fontWeight: 600 } : undefined}>Retirar antes del {flag.retire_by}{flag.overdue ? ` — vencido hace ${fmtNum(-flag.daysToRetire)} días: quítalo del código o prorroga` : ` (en ${fmtNum(flag.daysToRetire)} días)`}.</li>
      </ul>

      {flag.history.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>Historial</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {flag.history.map((entry, index) => (
              <li key={index}>{dateOf(entry.changed_at)} · {entry.from_stage ?? 'creado'} → {entry.to_stage}{entry.note ? ` · ${entry.note}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

function BetaMembers({ onChanged }: { onChanged: () => void }) {
  const { data, reload } = usePanelData<Members>('/api/admin/analytics/flags/groups/beta', { keepPrevious: true, refreshMs: false })
  const [who, setWho] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function add() {
    setProblem(null)
    try {
      await api('/api/admin/analytics/flags/groups/beta', { method: 'PUT', body: JSON.stringify({ who }) })
      setWho('')
      reload()
      onChanged()
    } catch (error) {
      setProblem(message(error))
    }
  }
  async function remove(userId: string) {
    try {
      await api(`/api/admin/analytics/flags/groups/beta/${userId}`, { method: 'DELETE' })
      reload()
      onChanged()
    } catch (error) {
      setProblem(message(error))
    }
  }

  return (
    <Card title="Personas beta" hint="Las invitadas que ven una función desde el paso «Beta». El equipo (superadmin y cuentas de prueba) entra solo.">
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={who} onChange={(event) => setWho(event.target.value)} placeholder="Correo o usuario de la cuenta" style={{ flex: 1, padding: 8 }} />
        <button type="button" className="panel-btn primary" disabled={!who.trim()} onClick={add}>Agregar</button>
      </div>
      {problem && <p role="alert" style={{ color: '#b42318' }}>{problem}</p>}
      {data?.members?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
          {data.members.map((member) => (
            <li key={member.userId}>{member.username ?? member.userId} <span style={{ opacity: 0.6 }}>· desde {dateOf(member.addedAt)}</span>{' '}
              <button type="button" className="panel-btn" onClick={() => remove(member.userId)}>Quitar</button></li>
          ))}
        </ul>
      ) : <Empty>Aún no hay personas beta.</Empty>}
    </Card>
  )
}

function NewFlag({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [retireBy, setRetireBy] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function create() {
    setProblem(null)
    try {
      await api('/api/admin/analytics/flags', { method: 'POST', body: JSON.stringify({ key, description, retire_by: retireBy }) })
      setKey('')
      setDescription('')
      setRetireBy('')
      onCreated()
    } catch (error) {
      setProblem(message(error))
    }
  }

  return (
    <Card title="Nuevo interruptor" hint="Nace apagado. Después el código lo lee con useFlag en la pantalla y requireFlag en la ruta del backend.">
      <div style={{ display: 'grid', gap: 8 }}>
        <input value={key} onChange={(event) => setKey(event.target.value)} placeholder="nombre_en_minusculas" style={{ padding: 8 }} />
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Para qué es (5 a 300 letras)" style={{ padding: 8 }} />
        <label>Retirar antes de <input type="date" value={retireBy} onChange={(event) => setRetireBy(event.target.value)} style={{ padding: 6 }} /> <span style={{ opacity: 0.6 }}>(máximo un año)</span></label>
        {problem && <p role="alert" style={{ color: '#b42318', margin: 0 }}>{problem}</p>}
        <div><button type="button" className="panel-btn primary" disabled={!key || !description || !retireBy} onClick={create}>Crear apagado</button></div>
      </div>
    </Card>
  )
}

export default function InterruptoresPage() {
  const { data, loading, error, reload } = usePanelData<FlagsData>('/api/admin/analytics/flags', { keepPrevious: true })

  return (
    <>
      <PageHeader title="Interruptores" subtitle="Enciende una función nueva por pasos: Equipo → Beta → 1 % → 10 % → 25 % → 50 % → Todos. «Apagado» es el botón de emergencia y llega a todos los servidores en máximo 15 segundos." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !data.ready && <ErrorBox message="Falta correr backend/sql/feature-flags-migration.sql en la base." />}
      {data?.ready && data.stages && (
        <>
          {(data.flags ?? []).length === 0 && <Empty>Todavía no hay interruptores. Crea el primero abajo.</Empty>}
          {(data.flags ?? []).map((flag) => <FlagCard key={flag.key} flag={flag} stages={data.stages ?? []} onChanged={reload} />)}
          <BetaMembers onChanged={reload} />
          <NewFlag onCreated={reload} />
        </>
      )}
    </>
  )
}
