import { describe, it, expect } from 'vitest'
import { dailyQuota, daysUntilNextBatch, nextBatchFrom, MIN_PER_DAY, MAX_PER_DAY } from '../../services/scraper/quota'

const at = (iso: string) => new Date(iso)

describe('días hasta el próximo lote', () => {
  it('cuenta hoy y los siguientes, sin el día en que llega el lote', () => {
    // Lote cada 15 días: el día que empieza el ciclo quedan 15 días.
    const start = at('2026-10-30T15:00:00Z')
    expect(daysUntilNextBatch(start, nextBatchFrom(start))).toBe(15)
    expect(daysUntilNextBatch(at('2026-11-05T15:00:00Z'), nextBatchFrom(start))).toBe(9)
    expect(daysUntilNextBatch(at('2026-11-13T15:00:00Z'), nextBatchFrom(start))).toBe(1)
  })

  it('supone un ciclo completo si no se sabe cuándo llega el lote, o ya venció', () => {
    expect(daysUntilNextBatch(at('2026-10-30T15:00:00Z'), null)).toBe(15)
    expect(daysUntilNextBatch(at('2026-11-20T15:00:00Z'), at('2026-11-10T00:00:00Z'))).toBe(15)
  })

  it('usa el día de Monterrey (UTC-6), no el de UTC', () => {
    // 01:00 UTC del 31 todavía es 30 en Monterrey.
    expect(daysUntilNextBatch(at('2026-10-31T01:00:00Z'), at('2026-11-02T18:00:00Z'))).toBe(3)
  })
})

describe('cupo diario', () => {
  it('reparte la cola entre los días del ciclo: 668 en 15 días son 45 al día, no 20', () => {
    const start = at('2026-10-30T15:00:00Z')
    expect(dailyQuota({ pending: 668, now: start, nextBatchAt: nextBatchFrom(start) })).toBe(45)
  })

  it('se corrige solo: si queda lo mismo con menos días, sube', () => {
    const start = at('2026-10-30T15:00:00Z')
    const next = nextBatchFrom(start)
    expect(dailyQuota({ pending: 300, now: at('2026-11-07T15:00:00Z'), nextBatchAt: next })).toBe(43)
  })

  it('con poca cola no baja de un mínimo, y con un error no vacía todo de golpe', () => {
    const start = at('2026-10-30T15:00:00Z')
    const next = nextBatchFrom(start)
    expect(dailyQuota({ pending: 3, now: start, nextBatchAt: next })).toBe(MIN_PER_DAY)
    expect(dailyQuota({ pending: 50000, now: at('2026-11-13T15:00:00Z'), nextBatchAt: next })).toBe(MAX_PER_DAY)
  })

  it('sin nada por publicar da el mínimo, no cero ni negativo', () => {
    expect(dailyQuota({ pending: 0, now: new Date(), nextBatchAt: null })).toBe(MIN_PER_DAY)
    expect(dailyQuota({ pending: -4, now: new Date(), nextBatchAt: null })).toBe(MIN_PER_DAY)
  })
})
