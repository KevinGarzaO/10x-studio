'use client';

import { useState } from 'react';

type AppId = 'avocado' | 'specforge';

interface AvocadoAppSwitcherProps {
  activeApp?: AppId;
}

const APPS = [
  { id: 'avocado', name: 'Avocado Estudio', desc: 'Contenido con IA', icon: '🥑', bg: '#10b981', available: true, url: 'https://avocado.studio' },
  { id: 'specforge', name: 'SpecForge-TX', desc: 'SDD para developers', icon: '⚙️', bg: '#059669', available: true, url: 'https://github.com/transformateck/specforge-tx' },
  { id: 'invoice', name: 'Invoice-TX', desc: 'Próximamente', icon: '📋', bg: '#475569', available: false },
  { id: 'leads', name: 'Leads-TX', desc: 'Próximamente', icon: '👥', bg: '#475569', available: false },
  { id: 'academ', name: 'Academ-TX', desc: 'Próximamente', icon: '🎓', bg: '#475569', available: false },
  { id: 'analytics', name: 'Analytics-TX', desc: 'Próximamente', icon: '📊', bg: '#475569', available: false },
];

export default function AvocadoAppSwitcher({ activeApp = 'avocado' }: AvocadoAppSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAppClick = (appId: string) => {
    const app = APPS.find(a => a.id === appId);
    if (!app || !app.available || appId === activeApp) return;
    window.open(app.url, '_blank');
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          color: isOpen ? '#10b981' : '#64748b',
          background: isOpen ? 'rgba(16,185,129,0.08)' : '#f8f9fb',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          fontSize: 14,
          transition: 'all 0.2s',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="4" height="4" rx="1" />
          <rect x="6" y="1" width="4" height="4" rx="1" />
          <rect x="11" y="1" width="4" height="4" rx="1" />
          <rect x="1" y="6" width="4" height="4" rx="1" />
          <rect x="6" y="6" width="4" height="4" rx="1" />
          <rect x="11" y="6" width="4" height="4" rx="1" />
          <rect x="1" y="11" width="4" height="4" rx="1" />
          <rect x="6" y="11" width="4" height="4" rx="1" />
          <rect x="11" y="11" width="4" height="4" rx="1" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          />

          <div
            style={{
              position: 'fixed',
              top: 52,
              right: 16,
              width: 320,
              maxHeight: 'calc(100vh - 70px)',
              overflowY: 'auto',
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
              padding: 16,
              zIndex: 9999,
            }}
          >
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 12,
            }}>
              Transformateck Workspace
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              width: '100%',
            }}>
              {APPS.map((app) => {
                const isActive = app.id === activeApp;
                const isDisabled = !app.available || isActive;
                
                return (
                  <div
                    key={app.id}
                    onClick={() => handleAppClick(app.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '12px 8px',
                      borderRadius: 8,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      position: 'relative',
                      border: isActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid #f1f5f9',
                      opacity: isDisabled ? 0.5 : 1,
                      minHeight: 90,
                      background: isActive ? 'rgba(16,185,129,0.05)' : '#fafbfc',
                    }}
                    onMouseEnter={(e) => {
                      if (!isDisabled) {
                        e.currentTarget.style.borderColor = 'rgba(16,185,129,0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isActive ? 'rgba(16,185,129,0.3)' : '#f1f5f9';
                    }}
                  >
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 20,
                      background: app.bg,
                      boxShadow: isActive ? '0 0 16px rgba(16,185,129,0.5)' : 'none',
                      border: isActive ? '1px solid rgba(16,185,129,0.3)' : 'none',
                    }}>
                      {app.icon}
                    </div>

                    <div style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#0d1117',
                      textAlign: 'center',
                    }}>
                      {app.name}
                    </div>

                    <div style={{
                      fontSize: 10,
                      color: '#94a3b8',
                      textAlign: 'center',
                    }}>
                      {app.desc}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #f1f5f9',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#64748b',
              }}>
                <span>Creditos:</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>1,000 disponibles</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
