import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppProvider } from '@/components/layout/AppProvider'
import { InstallPWA } from '@/components/layout/InstallPWA'

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export const metadata: Metadata = {
  title: 'Avocado Estudio',
  description: 'Plataforma de creación y publicación de contenido con IA',
  manifest: '/manifest.json',
  icons: { 
    icon: '/icon-192.png',
    apple: '/icon-192.png'
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Avocado Estudio',
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body suppressHydrationWarning>
        <InstallPWA />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
