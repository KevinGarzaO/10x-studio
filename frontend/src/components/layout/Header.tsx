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

interface Props { 
  activeSection: NavSection;
  onMenuClick?: () => void;
}

export function Header({ activeSection, onMenuClick }: Props) {
  return (
    <header className="h-[56px] bg-brand-surface border-b border-brand-border flex items-center px-4 md:px-8 gap-3 flex-shrink-0 transition-all duration-300">
      {/* Mobile Menu Button */}
      <button 
        onClick={onMenuClick}
        className="md:hidden p-2 text-brand-secondary hover:text-brand-primary transition-colors"
      >
        <i className="pi pi-bars text-lg"></i>
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm max-w-[50%] overflow-hidden overflow-ellipsis whitespace-nowrap">
        <span className="text-brand-secondary font-semibold">Avocado Estudio</span>
        <span className="text-brand-border">/</span>
        <span className="text-brand-primary font-medium">{SECTION_LABELS[activeSection] || 'Sección'}</span>
      </div>


      <div className="flex-1" />
      
      {/* Empty space where API Key used to be, ready for future tools/icons */}
    </header>
  )
}
