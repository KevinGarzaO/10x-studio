import { supabase } from '../services/supabase.service'

const BIOS: Record<string, string> = {
  platzi: 'Plataforma educativa en línea líder en Latinoamérica, enfocada en tecnología, programación, datos, negocios y marketing digital. Forma a millones de estudiantes hispanohablantes a través de cursos prácticos y una comunidad activa de profesionales.',
  spotify: 'Servicio de streaming de audio sueco que da acceso a millones de canciones, podcasts y videos de artistas de todo el mundo. Una de las plataformas de música digital más grandes y usadas del planeta.',
  twilio: 'Plataforma de comunicaciones en la nube que permite a los desarrolladores integrar mensajería, voz, video y autenticación en sus aplicaciones mediante APIs. Infraestructura clave detrás de miles de productos digitales.',
  dlocal: 'Fintech latinoamericana que conecta a comercios globales con consumidores de mercados emergentes, procesando pagos locales en Latinoamérica, África y Asia a través de una sola plataforma.',
  logrocket: 'Plataforma de monitoreo de producto y experiencia de usuario que combina grabación de sesiones, analítica de producto y reporte de errores para ayudar a los equipos de ingeniería a entender y mejorar sus aplicaciones.',
  jumpcloud: 'Plataforma de gestión de identidad y accesos (IAM) basada en la nube que centraliza el control de usuarios, dispositivos y aplicaciones para empresas, simplificando el trabajo de los equipos de TI.',
  palantir: 'Compañía de software especializada en análisis de big data, que construye plataformas usadas por gobiernos y grandes empresas para integrar y analizar información compleja a gran escala.',
  gitlab: 'Plataforma DevSecOps todo-en-uno que cubre todo el ciclo de vida del software: planificación, control de versiones, CI/CD, seguridad y monitoreo, usada por equipos de desarrollo alrededor del mundo.',
  kavak: 'Plataforma latinoamericana de compraventa de autos seminuevos que digitaliza todo el proceso —inspección, financiamiento y garantía— para hacerlo más simple, seguro y transparente.',
}

async function main() {
  let updated = 0
  for (const [username, bio] of Object.entries(BIOS)) {
    const { data, error } = await supabase
      .from('users')
      .update({ bio })
      .eq('username', username)
      .eq('scraper_source', 'company')
      .select('id')
      .maybeSingle()

    if (error) {
      console.error(`  Error updating ${username}:`, error.message)
      continue
    }
    if (data) {
      updated++
      console.log(`  ${username}: bio set`)
    } else {
      console.log(`  ${username}: no matching company account found`)
    }
  }
  console.log(`\nDone. ${updated} company bios updated.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
