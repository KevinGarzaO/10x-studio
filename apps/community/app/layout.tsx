import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { AttributionCapture } from '@/components/attribution-capture'
import { SessionCapture } from '@/components/session-capture'
import { THEME_SCRIPT } from '@/lib/theme'
import './globals.css'

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-B5F7C83ERC'

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
    { media: '(prefers-color-scheme: light)', color: '#f5f5f5' },
    { media: '(prefers-color-scheme: dark)', color: '#18161a' },
  ],
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-theme="light" className="bg-background" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
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
        <SessionCapture />
        <AttributionCapture />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
