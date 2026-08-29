'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { CalendarSection } from '@/components/calendar/CalendarSection'

export default function CalendarPage() {
  return (
    <DashboardLayout>
      <CalendarSection />
    </DashboardLayout>
  )
}
