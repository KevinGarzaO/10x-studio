/**
 * Reglas con las que se asigna la categoría de rol de una vacante.
 *
 * La clasificación real ocurre en la base de datos (función SQL
 * `classify_role_category`, que usa el trigger del scraper). Este módulo es la
 * fuente de verdad de las reglas: de aquí se genera ese SQL
 * (backend/sql/role-categories-migration.sql), se prueban, y se simulan contra
 * vacantes reales sin tocar la base. Una prueba comprueba que el SQL y estas
 * reglas no se separen.
 *
 * Qué corrige respecto al clasificador anterior:
 *  - Antes se buscaba cada palabra como pedazo de cualquier texto: "ios" aparecía
 *    dentro de "positions", así que un "Senior Accountant" salía como `mobile`.
 *    Ahora son palabras completas.
 *  - Antes se miraba todo el texto de la vacante. Ahora SOLO el título, que es lo que
 *    dice qué puesto es. Se probó mirar también el cuerpo como respaldo y salía mal:
 *    de 27 roles asignados solo por el cuerpo, casi todos estaban equivocados ("Account
 *    Executive" como fullstack, todos los "Sales Engineer" como devops). Como el rol
 *    decide si una vacante entra al feed, un rol equivocado es peor que ninguno.
 *
 * Sintaxis: `\m` y `\M` son los límites de palabra de PostgreSQL. Aquí se
 * traducen a su equivalente en JavaScript para poder probarlos.
 */

export interface RoleRule {
  role: string
  /** Se aplica al título (primera línea). */
  title: string
}

// El orden importa: gana la primera regla que coincide, de lo más específico a lo
// más general.
export const ROLE_RULES: RoleRule[] = [
  {
    role: 'fullstack',
    title: String.raw`\m(full[ -]?stack)\M`,
  },
  {
    role: 'devops',
    title: String.raw`\m(devops|sre|site reliability|platform engineer\w*|infrastructure engineer\w*|cloud engineer\w*)\M`,
  },
  {
    role: 'data_scientist',
    title: String.raw`\m(data scientist\w*|machine learning|ml engineer\w*|research scientist\w*|applied scientist\w*|data analyst\w*|ai engineer\w*|artificial intelligence|científic[oa] de datos|analista de datos)\M`,
  },
  {
    role: 'data_engineer',
    title: String.raw`\m(data engineer\w*|analytics engineer\w*|ingenier[oa] de datos|ingenier[oa] de integración de datos|arquitecto de datos|desarrollador(a)? bi|etl developer\w*|big data)\M`,
  },
  {
    role: 'qa',
    title: String.raw`\m(qa|quality assurance|sdet|test engineer\w*|test automation|tester|ingenier[oa] de calidad|analista de calidad|analista qa)\M`,
  },
  {
    role: 'mobile',
    title: String.raw`\m(ios|android|react native|flutter|mobile (engineer|developer|app\w*)|desarrollador(a)? móvil)\M`,
  },
  {
    role: 'frontend',
    title: String.raw`\m(front[ -]?end|ui engineer\w*|web developer\w*|desarrollador(a)? web)\M`,
  },
  {
    role: 'backend',
    title: String.raw`\m(back[ -]?end|api engineer\w*|server[ -]side)\M`,
  },
  {
    role: 'ux_ui',
    title: String.raw`\m(ux|ui|ui/ux|ux/ui|product design\w*|designer\w*|design lead|diseñador(a)?(es)?|graphic design\w*|brand design\w*|motion design\w*|illustrator|art director)\M`,
  },
  {
    role: 'product',
    title: String.raw`\m(product manager\w*|product owner\w*|product lead|head of product|director of product|vp of product|product operations|product management|gerente de producto|technical product)\M`,
  },
  {
    // Antes de administración: "Sales Operations Manager" es de ventas, no de operaciones.
    role: 'ventas',
    title: String.raw`\m(sales|account (executive|manager|director)s?|business development|sdr|bdr|solutions? (engineer\w*|architect\w*|consultant\w*)|pre[ -]?sales|partnerships? (manager|lead|director|executive)|channel (manager|partner\w*)|revenue operations|ventas|vendedor(a)?(es)?|ejecutiv[oa] (de cuenta|comercial|de ventas)|desarrollo de negocio|comercial)\M`,
  },
  {
    role: 'recursos_humanos',
    title: String.raw`\m(recruiter\w*|recruiting|talent acquisition|talent partner\w*|sourcer\w*|human resources|recursos humanos|rrhh|hrbp|hr (business partner|manager|generalist|coordinator|specialist)|people (partner\w*|operations|ops|business partner\w*|programs?|team|experience)|compensation|payroll|nómina|nomina|reclutador(a)?(es)?|reclutamiento|employee (experience|relations)|learning (and|&) development)\M`,
  },
  {
    role: 'finanzas',
    title: String.raw`\m(accountant\w*|accounting|contador(a)?(es)?|contabilidad|contable|financial (analyst\w*|planning|controller\w*|reporting|accountant\w*)|finance (manager|analyst\w*|lead|director|business partner)|controller|treasury (analyst\w*|manager\w*|specialist\w*|director|lead|associate|operations)|tesorer\w*|auditor\w*|audit|tax|impuestos|accounts (payable|receivable)|revenue accounting|financial operations|financiero|finanzas)\M`,
  },
  {
    role: 'administracion',
    title: String.raw`\m(administrative|administrativ[oa]s?|administraci[oó]n|office manager|executive assistant|executive business partner|asistente|business operations|operations (manager|coordinator|specialist|analyst|associate)|procurement|compras|legal operations|contracts? (manager|specialist|administrator|analyst|coordinator|lead)|coordinador(a)?(es)?|coordinator|supply chain|logística|logistics|chief of staff)\M`,
  },
  {
    // Después de administración: "Legal Operations Specialist" sigue siendo administración.
    role: 'legal',
    title: String.raw`\m(counsel|attorney\w*|lawyer\w*|paralegal\w*|legal (director|manager|associate|analyst|specialist|assistant|advisor|officer|lead|affairs)|compliance|regulatory|abogad[oa]s?|jurídic[oa]s?|litigation|privacy (officer|manager|analyst|lead)|data protection|cumplimiento normativo)\M`,
  },
  {
    role: 'marketing',
    title: String.raw`\m(marketing|growth|seo|sem|ppc|content (writer|strategist|creator|marketing|designer)|copywriter\w*|social media|community manager|brand|demand generation|lifecycle|public relations|comunicaci\w+|mercadotecnia|publicidad|campaign\w*)\M`,
  },
  {
    role: 'customer_support',
    title: String.raw`\m(customer (support|success|service|experience|care)|atención al cliente|servicio al cliente|soporte|support (engineer\w*|specialist\w*|agent\w*|associate\w*)|help desk|service desk|technical support)\M`,
  },
  // Lo más general va al final: un "Software Engineer" sin más datos se ofrece como
  // Full Stack, y cualquier categoría más específica de arriba gana sobre esto.
  {
    role: 'fullstack',
    title: String.raw`\m(software (engineer\w*|developer\w*|development engineer\w*)|desarrollador(a)?|programador(a)?|arquitecto de software|ingenier[oa] de software|swe|sde)\M`,
  },
]

/** Traduce los límites de palabra de PostgreSQL a JavaScript. */
function toJs(source: string): RegExp {
  const before = String.raw`(?<![\p{L}\p{N}_])`
  const after = String.raw`(?![\p{L}\p{N}_])`
  return new RegExp(source.replace(/\\m/g, before).replace(/\\M/g, after), 'iu')
}

const COMPILED = ROLE_RULES.map((rule) => ({ role: rule.role, title: toJs(rule.title) }))

/** El título de una vacante: su primera línea, sin los `#` de markdown. */
export function titleOf(text: string): string {
  return (text.split('\n')[0] || '').replace(/^#+\s*/, '').trim().toLowerCase()
}

/** Réplica en JavaScript de `classify_role_category()` de la base de datos. */
export function classifyRole(text: string): string | null {
  const title = titleOf(text)
  for (const rule of COMPILED) if (rule.title.test(title)) return rule.role
  return null
}
