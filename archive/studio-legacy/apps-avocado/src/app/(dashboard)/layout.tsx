import DashboardLayout from '@/components/layout/DashboardLayout'
import { AppProvider } from '@/components/layout/AppProvider'

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  // El estado del estudio de contenido (temas, calendario...) solo se carga aquí, no en el panel ni en el login.
  return <AppProvider><DashboardLayout>{children}</DashboardLayout></AppProvider>
}
