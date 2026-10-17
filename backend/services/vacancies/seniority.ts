import type { Seniority } from '@avocado/schemas'

/**
 * El nivel de una vacante, o `null` si no se puede saber.
 *
 * Antes lo que no decía nada se marcaba "semi senior" (la mitad de todas las
 * vacantes tenía ese nivel por defecto), y eso contaminaba el match: un candidato
 * senior jamás veía una vacante sin nivel, y uno semi senior veía cientos que no
 * tenían nada que ver. Ahora "no se sabe" es `null`, y el match lo trata como
 * compatible con cualquiera pero con menos puntos.
 *
 * Se mira primero el título, que es lo que dice el puesto; si no hay pista, los
 * años de experiencia que pide el texto.
 */

const SENIOR_TITLE = /(?<![\p{L}\p{N}_])(senior|sr\.?|staff|principal|lead|head of|director|vp|vice president|architect|arquitect[oa]|l[ií]der)(?![\p{L}\p{N}_])/iu
const JUNIOR_TITLE = /(?<![\p{L}\p{N}_])(junior|jr\.?|intern|internship|trainee|entry[- ]level|new grad|graduate|becari[oa]s?|practicante|aprendiz)(?![\p{L}\p{N}_])/iu
const MID_TITLE = /(?<![\p{L}\p{N}_])(mid|mid[- ]level|semi[- ]?senior|ssr|intermediate|intermedio)(?![\p{L}\p{N}_])/iu

// "Software Engineer II" / "Analyst 3": el número del puesto marca el nivel.
const LEVELLED = /(?<![\p{L}\p{N}_])(engineer|developer|analyst|specialist|designer|scientist|accountant|manager|consultant|recruiter|writer)\s+(i{1,3}|iv|[1-4])(?![\p{L}\p{N}_])/iu

// "5+ years of experience", "3-5 años de experiencia".
const YEARS = /(\d{1,2})\s*\+?\s*(?:(?:-|to|a)\s*(\d{1,2})\s*)?(?:years?|a[ñn]os)[^.\n]{0,40}?(?:experience|experiencia)/giu

function levelFromNumber(token: string): Seniority {
  const n = /^\d$/.test(token) ? Number(token) : token.length === 2 && token.toLowerCase() === 'iv' ? 4 : token.length
  if (n <= 1) return 'junior'
  if (n === 2) return 'semi_senior'
  return 'senior'
}

function levelFromYears(years: number): Seniority {
  if (years >= 5) return 'senior'
  if (years >= 3) return 'semi_senior'
  return 'junior'
}

export function inferSeniority(title: string, body: string): Seniority | null {
  const levelled = LEVELLED.exec(title)
  // El título manda, y entre sus pistas la más fuerte primero.
  if (SENIOR_TITLE.test(title)) return 'senior'
  if (JUNIOR_TITLE.test(title)) return 'junior'
  if (MID_TITLE.test(title)) return 'semi_senior'
  if (levelled) return levelFromNumber(levelled[2])

  // Sin pista en el título: los años que pide el texto. Se toma el mayor mínimo que aparezca.
  let years: number | null = null
  for (const match of body.matchAll(YEARS)) {
    const value = Number(match[1])
    if (value <= 20) years = years === null ? value : Math.max(years, value)
  }
  return years === null ? null : levelFromYears(years)
}
