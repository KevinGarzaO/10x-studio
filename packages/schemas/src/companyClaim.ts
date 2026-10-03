import { z } from 'zod'

/** Tamaños de empresa que ofrece el formulario. */
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const
export type CompanySize = (typeof COMPANY_SIZES)[number]

/**
 * Los tres documentos que sustentan un reclamo (ver el requerimiento 003):
 * - existence: acta constitutiva o constancia de situación fiscal.
 * - identity: identificación oficial del solicitante.
 * - representation: poder notarial o carta poder, cuando quien reclama no es
 *   el representante legal.
 */
export const CLAIM_DOCUMENT_KINDS = ['existence', 'identity', 'representation'] as const
export type ClaimDocumentKind = (typeof CLAIM_DOCUMENT_KINDS)[number]

/** Los dos que no pueden faltar para poder revisar el reclamo. */
export const REQUIRED_CLAIM_DOCUMENTS: ClaimDocumentKind[] = ['existence', 'identity']

/**
 * RFC mexicano: 12 caracteres para persona moral, 13 para persona física con
 * actividad empresarial. Se valida la forma, no que exista ante el SAT: eso lo
 * comprueba el superadmin contra los documentos.
 */
export const RFC_PATTERN = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/

export const claimDocumentSchema = z.object({
  kind: z.enum(CLAIM_DOCUMENT_KINDS),
  fileName: z.string().trim().min(1).max(200),
  /** data URL del archivo (PDF o imagen). */
  dataUrl: z.string().min(1),
})

export const companyClaimSchema = z
  .object({
    companyName: z.string().trim().min(2, 'El nombre de la empresa es obligatorio').max(100),
    rfc: z
      .string()
      .trim()
      .transform(value => value.toUpperCase())
      .refine(value => RFC_PATTERN.test(value), 'El RFC no tiene un formato válido'),
    /** Empresa existente que se reclama; vacío si hay que crearla. */
    companyUserId: z.string().uuid().nullish(),
    website: z.string().trim().max(200).nullish(),
    description: z.string().trim().max(1000).nullish(),
    companySize: z.enum(COMPANY_SIZES).nullish(),
    industry: z.string().trim().max(80).nullish(),
    location: z.string().trim().max(100).nullish(),
    /** Logo como data URL; opcional al reclamar una empresa que ya tiene. */
    logoBase64: z.string().nullish(),
    documents: z.array(claimDocumentSchema).min(1).max(6),
  })
  .refine(
    data => REQUIRED_CLAIM_DOCUMENTS.every(kind => data.documents.some(doc => doc.kind === kind)),
    {
      message: 'Falta un documento obligatorio: el que prueba la empresa y tu identificación',
      path: ['documents'],
    },
  )

export type CompanyClaimInput = z.infer<typeof companyClaimSchema>
