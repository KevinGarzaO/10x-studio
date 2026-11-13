/**
 * A qué público le habla AvoTalent hoy, expresado en roles.
 *
 * Sale de lo que mostró el rendimiento real: quienes se registran son, en su gran mayoría,
 * desarrolladores y diseñadores senior que buscan trabajo remoto. Las vacantes de marketing,
 * finanzas, administración, recursos humanos, ventas, legal y atención al cliente trajeron 1 o 2
 * visitantes y ningún registro.
 *
 * Se usa para decidir qué se muestra como "popular" o "en tendencia" y qué se publica en LinkedIn:
 * sin esto, 68 vacantes de ventas traídas por el scraper hacen que "Ventas" parezca el segundo tema
 * más popular de una comunidad de desarrolladores. Las páginas completas (el directorio de empleos,
 * el feed) siguen mostrando TODAS las vacantes: esto solo elige qué se destaca.
 *
 * El número es el peso del rol (3 convierte más). Un rol que no está aquí no se destaca. Cuando
 * AvoTalent tenga audiencia para otra área, se agrega aquí: es el único lugar que lo decide.
 */
export const ROLE_FOCUS: Record<string, number> = {
  fullstack: 3,
  frontend: 3,
  backend: 3,
  devops: 3,
  ux_ui: 3,
  mobile: 2,
  qa: 2,
  data_engineer: 2,
  product: 2,
  data_scientist: 1,
}

/** Los roles del foco, para filtrar consultas. */
export const FOCUS_ROLES = Object.keys(ROLE_FOCUS)
