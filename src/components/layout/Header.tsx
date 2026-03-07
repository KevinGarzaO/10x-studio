'use client'
import { useState, useEffect } from 'react'
import { useApp } from './AppProvider'
import type { NavSection } from '@/app/page'
import { Password } from 'primereact/password'

const SECTION_LABELS: Partial<Record<NavSection, string>> = {
  dashboard:    'Dashboard',
  topics:       'Banco de Temas',
  redactor:     'Redactor',
  history:      'Historial',
  calendar:     'Calendario',
  stats:        'Estadísticas',
  templates:    'Plantillas',
  substack:     'Substack',
  integrations: 'Integraciones',
}

interface Props { activeSection: NavSection }

export function Header({ activeSection }: Props) {
  return (
    <header className="h-[46px] bg-[#191919] border-b border-[#2a2a2a] flex items-center px-8 gap-4 flex-shrink-0 transition-all duration-300">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm max-w-[50%] overflow-hidden overflow-ellipsis whitespace-nowrap">
        <span className="text-[#555] font-semibold">10X Studio</span>
        <span className="text-[#333]">/</span>
        <span className="text-[#cccccc] font-medium">{SECTION_LABELS[activeSection] || 'Sección'}</span>
      </div>

      <div className="flex-1" />
      
      {/* Empty space where API Key used to be, ready for future tools/icons */}
    </header>
  )
}
