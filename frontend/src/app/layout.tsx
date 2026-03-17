import type { Metadata } from 'next'
import './globals.css'
import { AppProvider } from '@/components/layout/AppProvider'
import { PWARegister } from '@/components/layout/PWARegister'

export const viewport = {
  themeColor: '#000000',
}

export const metadata: Metadata = {
  title: '10X Studio',
  description: 'Plataforma de creación y publicación de contenido con IA',
  manifest: '/manifest.json',
  icons: { 
    icon: '/favicon.svg',
    apple: '/icon-192.png'
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
    title: '10X Studio',
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <PWARegister />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
