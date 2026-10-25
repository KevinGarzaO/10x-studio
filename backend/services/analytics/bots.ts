/**
 * Robots que ejecutan JavaScript y aparecían como "visitantes": buscadores, vistas previas de enlaces, monitores
 * de disponibilidad, navegadores sin pantalla. Se reconocen por su User-Agent; un navegador real nunca se
 * identifica así. Una visita sin User-Agent tampoco es de una persona.
 *
 * No es perfecto (un robot puede disfrazarse), pero quita el grueso del ruido sin guardar nada de quien visita.
 */
const BOT_PATTERN = /bot|crawl|spider|slurp|mediapartners|feedly|rss|yandex|sogou|exabot|ia_archiver|facebookexternalhit|curl|wget|python|java\/|ruby|go-http|headless|puppeteer|playwright|phantom|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|semrush|ahrefs|mj12|dotbot|zoominfo|seznam|bytespider|gptbot|chatgpt|ccbot|claude|anthropic|applebot|bingpreview|preview|meta-external|nutch|scrapy|httpclient|node-fetch|undici|axios|okhttp|vercel-|slackbot|discordbot|telegrambot|whatsapp\/|linkedinbot|twitterbot|skypeuripreview/i

export function isBotUserAgent(userAgent: string | string[] | undefined | null): boolean {
  const value = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent ?? ''
  return value.trim() === '' || BOT_PATTERN.test(value)
}
