import { describe, it, expect } from 'vitest'
import { companyClaimSchema, RFC_PATTERN, REQUIRED_CLAIM_DOCUMENTS } from '@avocado/schemas'

const doc = (kind: string) => ({ kind, fileName: 'acta.pdf', dataUrl: 'data:application/pdf;base64,AAA' })

const valid = {
  companyName: 'Acme SA de CV',
  rfc: 'ACM010203XY1',
  documents: [doc('existence'), doc('identity')],
}

describe('companyClaimSchema', () => {
  it('acepta un reclamo con los dos documentos obligatorios', () => {
    expect(companyClaimSchema.safeParse(valid).success).toBe(true)
  })

  it('recorta el texto libre y normaliza el RFC a mayúsculas', () => {
    const parsed = companyClaimSchema.parse({
      ...valid,
      companyName: '  Acme SA de CV  ',
      rfc: ' acm010203xy1 ',
      industry: '  Fintech ',
      location: ' Monterrey, MX ',
    })
    expect(parsed.companyName).toBe('Acme SA de CV')
    expect(parsed.rfc).toBe('ACM010203XY1')
    expect(parsed.industry).toBe('Fintech')
    expect(parsed.location).toBe('Monterrey, MX')
  })

  it('rechaza un RFC con formato inválido', () => {
    const result = companyClaimSchema.safeParse({ ...valid, rfc: 'NOESUNRFC' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('RFC')
    }
  })

  it('acepta RFC de persona moral (12) y de persona física (13)', () => {
    expect(RFC_PATTERN.test('ACM010203XY1')).toBe(true)
    expect(RFC_PATTERN.test('GAKE900101HN5')).toBe(true)
    expect(RFC_PATTERN.test('AC010203XY1')).toBe(false)
  })

  it('exige el documento de existencia y la identificación', () => {
    for (const missing of REQUIRED_CLAIM_DOCUMENTS) {
      const documents = valid.documents.filter(d => d.kind !== missing)
      const result = companyClaimSchema.safeParse({ ...valid, documents })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['documents'])
      }
    }
  })

  it('acepta el poder notarial como tercer documento opcional', () => {
    const result = companyClaimSchema.safeParse({
      ...valid,
      documents: [...valid.documents, doc('representation')],
    })
    expect(result.success).toBe(true)
  })

  it('rechaza un tipo de documento que no existe', () => {
    const result = companyClaimSchema.safeParse({ ...valid, documents: [doc('contrato'), doc('identity')] })
    expect(result.success).toBe(false)
  })

  it('rechaza un reclamo sin nombre de empresa', () => {
    const result = companyClaimSchema.safeParse({ ...valid, companyName: 'A' })
    expect(result.success).toBe(false)
  })

  it('rechaza un companyUserId que no es uuid', () => {
    const result = companyClaimSchema.safeParse({ ...valid, companyUserId: 'acme' })
    expect(result.success).toBe(false)
  })

  it('acepta companyUserId nulo: la empresa todavía no existe', () => {
    expect(companyClaimSchema.safeParse({ ...valid, companyUserId: null }).success).toBe(true)
  })

  it('rechaza un tamaño de empresa fuera del catálogo', () => {
    expect(companyClaimSchema.safeParse({ ...valid, companySize: '7-9' }).success).toBe(false)
    expect(companyClaimSchema.safeParse({ ...valid, companySize: '11-50' }).success).toBe(true)
  })
})
