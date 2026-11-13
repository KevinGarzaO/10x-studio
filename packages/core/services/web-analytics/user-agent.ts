/**
 * Dispositivo, sistema y navegador a partir del User-Agent. A mano y sin dependencias: `ua-parser-js` 2.x es AGPL
 * (no se puede meter en un producto cerrado) y la 1.x ya no recibe mantenimiento. Cubre lo que el panel necesita y
 * es fácil de probar.
 *
 * Brave no se puede saber por el User-Agent (se parece a Chrome): lo avisa el propio navegador (`navigator.brave`).
 */
export interface ParsedUserAgent {
  deviceCategory: 'desktop' | 'mobile' | 'tablet'
  operatingSystem: string | null
  osVersion: string | null
  browser: string | null
  browserVersion: string | null
}

const WINDOWS_VERSIONS: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' }

const major = (version: string | undefined): string | null => (version ? version.split('.')[0] : null)

export function parseUserAgent(userAgent: string | null | undefined, options: { brave?: boolean } = {}): ParsedUserAgent {
  const ua = userAgent ?? ''

  // --- dispositivo ---
  let deviceCategory: ParsedUserAgent['deviceCategory'] = 'desktop'
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) deviceCategory = 'tablet'
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) deviceCategory = 'mobile'

  // --- sistema operativo (el orden importa: el UA de iOS también dice "like Mac OS X") ---
  let operatingSystem: string | null = null
  let osVersion: string | null = null
  let match: RegExpMatchArray | null
  if ((match = ua.match(/(?:iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/i))) {
    operatingSystem = 'iOS'
    osVersion = `${match[1]}.${match[2]}`
  } else if ((match = ua.match(/Android (\d+(?:\.\d+)?)/i))) {
    operatingSystem = 'Android'
    osVersion = major(match[1])
  } else if (/Android/i.test(ua)) {
    operatingSystem = 'Android'
  } else if ((match = ua.match(/Windows NT (\d+\.\d+)/i))) {
    operatingSystem = 'Windows'
    osVersion = WINDOWS_VERSIONS[match[1]] ?? match[1]
  } else if (/CrOS/i.test(ua)) {
    operatingSystem = 'ChromeOS'
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    // Chrome y Safari congelan la versión en 10_15_7: no dice nada, no se guarda.
    operatingSystem = 'macOS'
  } else if (/Linux|X11/i.test(ua)) {
    operatingSystem = 'Linux'
  }

  // --- navegador (de lo más específico a lo más general: casi todos dicen "Chrome" y "Safari") ---
  let browser: string | null = null
  let browserVersion: string | null = null
  if ((match = ua.match(/Edg(?:e|A|iOS)?\/(\d+)/i))) { browser = 'Edge'; browserVersion = match[1] }
  else if ((match = ua.match(/OPR\/(\d+)|Opera\/(\d+)/i))) { browser = 'Opera'; browserVersion = match[1] ?? match[2] }
  else if ((match = ua.match(/SamsungBrowser\/(\d+)/i))) { browser = 'Samsung Internet'; browserVersion = match[1] }
  else if ((match = ua.match(/(?:Firefox|FxiOS)\/(\d+)/i))) { browser = 'Firefox'; browserVersion = match[1] }
  else if ((match = ua.match(/(?:Chrome|CriOS)\/(\d+)/i))) { browser = 'Chrome'; browserVersion = match[1] }
  else if ((match = ua.match(/Version\/(\d+)[\d.]*.*Safari/i))) { browser = 'Safari'; browserVersion = match[1] }
  else if (/Safari/i.test(ua)) { browser = 'Safari' }

  if (options.brave && browser === 'Chrome') browser = 'Brave'

  return { deviceCategory, operatingSystem, osVersion, browser, browserVersion }
}
