/**
 * Datos INVENTADOS para el entorno de DESARROLLO (y local). Nada sale de producción: empresas, personas y vacantes son ficticias (dominio
 * reservado `.test`, enlaces `.invalid`). El catálogo (habilidades, preguntas de examen) ya viene cargado aparte.
 *
 *   npx tsx scripts/seed-dev.ts             # ensayo: dice qué crearía
 *   npx tsx scripts/seed-dev.ts --apply     # crea (idempotente: lo que ya existe no se duplica)
 *
 * Seguridad: SOLO corre con APP_ENV=development (o el entorno de Railway llamado development) y se niega si la base ya tiene más de 300 cuentas
 * (o sea, si parece una base con datos reales). La contraseña de todas las cuentas de prueba sale de SEED_PASSWORD (variable de entorno).
 *
 * Crea: 10 empresas, 28 personas candidatas (4 son cuentas de prueba del equipo), 1 cuenta `dev-admin`, 90 vacantes de los últimos 20 días,
 * 6 discusiones y unos comentarios. La cuenta superadmin (`dev-admin`) se marca aparte con SQL: el permiso no se cambia desde la aplicación.
 */
import 'dotenv/config'
import { randomUUID } from 'crypto'
import { ROLE_CATEGORY } from '@avocado/schemas'
import { supabase } from '@avotalent/core/services/supabase.service'

const apply = process.argv.includes('--apply')
const reset = process.argv.includes('--reset')
const COUNTS = { companies: 10, people: 28, vacancies: 90, discussions: 6 }
// Dominio reservado `.invalid`: nunca existe. (Los dominios example.* y *.test hacen que la base marque la cuenta como de prueba: ver mark_test_account().)
const DOMAIN = 'dev.avotalent.invalid'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20261113)
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]
const pickN = <T,>(items: readonly T[], n: number): T[] => [...items].sort(() => rand() - 0.5).slice(0, n)
const slugify = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const COMPANY_NAMES = ['Nube Azul', 'Código Norte', 'Datos del Sur', 'Pixel Mesa', 'Ruta Digital', 'Tienda Faro', 'Laboratorio Cobre', 'Red Ágora', 'Finanzas Brújula', 'Salud Brote']
const CITIES = ['Ciudad de México', 'Monterrey', 'Guadalajara', 'Bogotá', 'Buenos Aires', 'Santiago', 'Lima', 'Remoto']
const MODALITIES = ['Remoto', 'Híbrido', 'Presencial'] as const
const SENIORITIES = ['junior', 'semi_senior', 'senior'] as const
const TITLE_BASE: Record<string, string> = { fullstack: 'Desarrollador Full Stack', backend: 'Desarrollador Backend', frontend: 'Desarrollador Frontend', data_scientist: 'Analista de Datos', devops: 'Ingeniero DevOps', mobile: 'Desarrollador Móvil' }

async function main() {
  const env = (process.env.APP_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || '').trim().toLowerCase()
  if (env !== 'development') throw new Error(`Este script solo corre en desarrollo (APP_ENV=development). Entorno detectado: «${env || 'sin definir'}».`)
  const password = process.env.SEED_PASSWORD
  if (apply && (!password || password.length < 12)) throw new Error('Falta SEED_PASSWORD (12 caracteres o más) en el entorno.')

  const accounts = await supabase.from('users').select('id', { count: 'exact', head: true })
  if (accounts.error) throw new Error(`No se pudo leer la base: ${accounts.error.message}`)
  const existingBefore = accounts.count ?? 0
  if (existingBefore > 300) throw new Error(`La base ya tiene ${existingBefore} cuentas: parece una base con datos reales. No se siembra.`)

  const skillsResult = await supabase.from('skills').select('name, role_categories')
  if (skillsResult.error || !skillsResult.data?.length) throw new Error('El catálogo de habilidades está vacío: carga primero el catálogo.')
  const skills = skillsResult.data as { name: string; role_categories: string[] }[]
  const roles = (ROLE_CATEGORY as readonly string[]).filter((role) => role !== 'otro' && skills.some((skill) => skill.role_categories?.includes(role)))
  const skillsFor = (role: string, n: number) => pickN(skills.filter((skill) => skill.role_categories?.includes(role)).map((skill) => skill.name), n)

  if (reset) {
    // Borra SOLO lo sembrado por este script (marcas seed-dev) y sus cuentas de acceso.
    const seeded = await supabase.from('users').select('id').or('signup_source.eq.seed-dev,scraper_source.eq.seed-dev')
    const ids = ((seeded.data ?? []) as { id: string }[]).map((row) => row.id)
    if (ids.length) await supabase.from('community_comments').delete().in('author_id', ids)
    await supabase.from('community_posts').delete().or('source_name.like.seed-%,platform.eq.seed-dev,platform.eq.seed-dev-discusion')
    if (ids.length) await supabase.from('community_posts').delete().in('author_id', ids)
    for (const id of ids) {
      await supabase.from('users').delete().eq('id', id)
      await supabase.auth.admin.deleteUser(id).catch(() => undefined)
    }
    console.log(`Reinicio: se quitaron ${ids.length} cuentas sembradas y sus publicaciones.`)
  }

  console.log(`Entorno: ${env}. Cuentas existentes: ${existingBefore}. Roles con habilidades: ${roles.length}. Habilidades: ${skills.length}.`)
  console.log(`Crearía: ${COUNTS.companies} empresas, ${COUNTS.people} personas + dev-admin, ${COUNTS.vacancies} vacantes, ${COUNTS.discussions} discusiones.`)
  if (!apply) return console.log('Ensayo: no se creó nada (usa --apply).')

  // 1. Empresas (perfiles sin cuenta de acceso, como las que crea el scraper)
  const companies = []
  for (let i = 0; i < COUNTS.companies; i++) {
    const name = COMPANY_NAMES[i]
    const slug = slugify(name)
    const found = await supabase.from('users').select('id').eq('company_slug', slug).maybeSingle()
    if (found.data) { companies.push({ id: (found.data as { id: string }).id, name, slug }); continue }
    const id = randomUUID()
    const { error } = await supabase.from('users').insert({ id, username: `empresa-${slug}`, display_name: name, name, company_slug: slug, account_type: 'company', is_scraper_profile: true, scraper_source: 'seed-dev', photo_url: `https://logos.invalid/${slug}.png`, location: pick(CITIES) })
    if (error) throw new Error(`empresa ${name}: ${error.message}`)
    companies.push({ id, name, slug })
  }

  // 2. Personas con cuenta de acceso (GoTrue) y perfil
  const people: { id: string; username: string; role: string }[] = []
  const totalPeople = COUNTS.people + 1
  for (let i = 1; i <= totalPeople; i++) {
    const admin = i === totalPeople
    const username = admin ? 'dev-admin' : `demo-${String(i).padStart(2, '0')}`
    const email = `${username}@${DOMAIN}`
    const role = pick(roles)
    const profile = {
      username, display_name: admin ? 'Admin de desarrollo' : `Persona Demo ${String(i).padStart(2, '0')}`, email,
      role_category: role, title: TITLE_BASE[role] ?? 'Profesional de tecnología', seniority: pick(SENIORITIES), location: pick(CITIES),
      work_modality: pick(MODALITIES), skills: skillsFor(role, 3 + Math.floor(rand() * 4)), years_experience: 1 + Math.floor(rand() * 10),
      photo_url: `https://avatars.invalid/${username}.png`, bio: 'Cuenta ficticia de desarrollo.', account_type: 'candidate',
      is_test_account: admin || i > COUNTS.people - 3, signup_source: 'seed-dev',
    }
    const existing = await supabase.from('users').select('id').eq('username', username).maybeSingle()
    let id = (existing.data as { id: string } | null)?.id
    if (!id) {
      const created = await supabase.auth.admin.createUser({ email, password: password!, email_confirm: true, user_metadata: { username, displayName: profile.display_name } })
      if (created.error || !created.data.user) throw new Error(`cuenta ${username}: ${created.error?.message}`)
      id = created.data.user.id
      const { error } = await supabase.from('users').insert({ id, ...profile })
      if (error) throw new Error(`perfil ${username}: ${error.message}`)
    }
    people.push({ id, username, role })
  }

  // 3. Vacantes inventadas (cumplen la regla de publicación: puesto, habilidades, enlace de postulación)
  const existingJobs = await supabase.from('community_posts').select('id', { count: 'exact', head: true }).like('source_name', 'seed-%')
  const alreadyJobs = existingJobs.count ?? 0
  const rows = []
  for (let i = alreadyJobs; i < COUNTS.vacancies; i++) {
    const company = pick(companies)
    const role = pick(roles)
    const seniority = pick(SENIORITIES)
    const modality = pick(MODALITIES)
    const location = modality === 'Remoto' ? 'Remoto' : pick(CITIES.filter((city) => city !== 'Remoto'))
    const title = `${TITLE_BASE[role] ?? 'Profesional de tecnología'} ${seniority === 'semi_senior' ? 'Semi Senior' : seniority === 'senior' ? 'Senior' : 'Junior'}`
    const id = randomUUID()
    const when = new Date(Date.now() - Math.floor(rand() * 20 * 86400_000))
    rows.push({
      id, title, type: 'job', author_id: company.id, company: company.name, company_logo: `https://logos.invalid/${company.slug}.png`,
      slug: `${slugify(title)}-${id.slice(0, 8)}`, role_category: role, seniority_level: seniority, modalidad: modality, location, skills: skillsFor(role, 3),
      content: `## ${title}\n**Empresa:** ${company.name}\n**Rol:** ${title}\n**Ubicación:** ${location}\n**Modalidad:** ${modality}\n\nVacante ficticia de desarrollo.`,
      source_url: `https://jobs.invalid/${company.slug}/${i + 1}`, contacts: { applyUrl: `https://jobs.invalid/${company.slug}/${i + 1}` }, platform: 'greenhouse', source_name: `seed-${company.slug}`,
      is_scraper_post: true, scraped_at: when.toISOString(), created_at: when.toISOString(), updated_at: when.toISOString(),
    })
  }
  for (let i = 0; i < rows.length; i += 30) {
    const { error } = await supabase.from('community_posts').insert(rows.slice(i, i + 30))
    if (error) throw new Error(`vacantes: ${error.message}`)
  }

  // 4. Discusiones y comentarios de las personas
  const discussions = await supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('platform', 'seed-dev-discusion')
  if ((discussions.count ?? 0) === 0) {
    const topics = ['¿Cómo preparan una entrevista técnica?', 'Recomendaciones para aprender SQL', 'Trabajo remoto: ¿cómo organizan su semana?', 'Mi primer año como desarrollador', 'Herramientas para dar seguimiento a postulaciones', 'Dudas sobre negociar un salario']
    const posts = topics.slice(0, COUNTS.discussions).map((title) => ({ id: randomUUID(), title, type: 'discussion', author_id: pick(people).id, content: `${title}\n\nTexto ficticio de desarrollo para probar la lista de discusiones y los comentarios.`, platform: 'seed-dev-discusion', slug: `${slugify(title)}-${randomUUID().slice(0, 8)}`, skills: [] }))
    const inserted = await supabase.from('community_posts').insert(posts)
    if (inserted.error) throw new Error(`discusiones: ${inserted.error.message}`)
    const comments = posts.flatMap((post) => [0, 1].map(() => ({ post_id: post.id, author_id: pick(people).id, content: 'Comentario ficticio de desarrollo.' })))
    const commented = await supabase.from('community_comments').insert(comments)
    if (commented.error) throw new Error(`comentarios: ${commented.error.message}`)
  }

  console.log(`Listo. Empresas ${companies.length}, personas ${people.length}, vacantes nuevas ${rows.length} (ya había ${alreadyJobs}).`)
  console.log('Falta marcar a dev-admin como superadmin con SQL (el permiso no se cambia desde la aplicación):')
  console.log("  SET session_replication_role = replica; UPDATE public.users SET is_superadmin = true WHERE username = 'dev-admin';")
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
