import type { Metadata } from 'next'
import './globals.css'
import { AppProvider } from '@/components/layout/AppProvider'

export const metadata: Metadata = {
  title: '10X Studio',
  description: 'Plataforma de creación y publicación de contenido con IA',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
