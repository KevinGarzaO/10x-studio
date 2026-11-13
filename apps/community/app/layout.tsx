import type { Metadata, Viewport } from 'next'
import { AttributionCapture } from '@/components/attribution-capture'
import { ClarityIntegration } from '@/components/clarity-integration'
import { ErrorCapture } from '@/components/error-capture'
import { SessionKeeper } from '@/components/session-keeper'
import { ApiKeyGate } from '@/components/api-key-gate'
import { FlagsLoader } from '@/components/flags-loader'
import { GlobalErrorBoundary } from '@/components/global-error-boundary'
import { SessionCapture } from '@/components/session-capture'
import { WebAnalytics } from '@/components/web-analytics'
import { Inter } from 'next/font/google'
import { THEME_SCRIPT } from '@/lib/theme'
import { organizationSchema } from '@/lib/social'
import './globals.css'

// Inter se carga de verdad. Antes solo se nombraba y, sin estar instalada, el navegador usaba Arial y los títulos en
// peso 800 salían como "Arial Black".
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-inter', display: 'swap' })

// NEXT_PUBLIC_TRACKING=off lo apaga en los entornos que no son producción (si no, usarían el Google Analytics de AvoTalent por omisión).
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_TRACKING === 'off' ? '' : process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-B5F7C83ERC'

export const metadata: Metadata = {
  title: 'AvoTalent — Comunidad Global de Talento',
  description: 'La comunidad en español donde las conversaciones técnicas encuentran nuevas oportunidades laborales.',
  generator: 'v0.app',
  verification: {
    google: '0KPyMJnNqQnPBXL5edh_9YiU6IFy4iLkjt52TnAGol4',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#18161a' },
  ],
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-theme="light" className={`bg-background ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* AvoTalent como organización (con su página de LinkedIn) para los buscadores */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }} />
        {GA_MEASUREMENT_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${GA_MEASUREMENT_ID}', { page_path: window.location.pathname });`
              }}
            />
          </>
        )}
      </head>
      <body className="antialiased">
        <ApiKeyGate />
        <SessionCapture />
        <AttributionCapture />
        <WebAnalytics />
        <ClarityIntegration />
        <SessionKeeper />
        <ErrorCapture />
        <FlagsLoader />
        <GlobalErrorBoundary area="layout">{children}</GlobalErrorBoundary>
      </body>
    </html>
  )
}
