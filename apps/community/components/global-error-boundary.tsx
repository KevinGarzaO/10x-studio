'use client'

import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/error-reporter'

interface Props {
  children: ReactNode
  /** Qué dibujar si algo falla. Por defecto, un aviso con "Reintentar". */
  fallback?: (retry: () => void) => ReactNode
  /** De qué parte de la app viene (aparece en el reporte). */
  area?: string
}

interface State { failed: boolean }

/** El aviso que ve la persona cuando algo falla al dibujar la pantalla. Solo usa los colores del tema. */
export function ErrorFallback({ retry }: { retry: () => void }) {
  return (
    <div role="alert" style={{ margin: '48px auto', maxWidth: 480, padding: 24, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Algo salió mal</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)' }}>Ya avisamos al equipo. Puedes intentar de nuevo o recargar la página.</p>
      <button type="button" onClick={retry} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  )
}

/**
 * Atrapa los errores al DIBUJAR (React no los manda a window.onerror), los reporta con la parte de la pantalla donde pasaron y
 * muestra un aviso en lugar de dejar la página en blanco.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // El stack de componentes (quién dibujaba qué) ayuda a ubicar el fallo; solo se guardan las primeras líneas.
    const where = (info.componentStack ?? '').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 4).join(' > ')
    reportError(error, { boundary: this.props.area ?? 'app', components: where })
  }

  retry = (): void => this.setState({ failed: false })

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return this.props.fallback ? this.props.fallback(this.retry) : <ErrorFallback retry={this.retry} />
  }
}

/** Envuelve cualquier componente con el boundary: `export default withErrorBoundary(Page, 'vacante')`. */
export function withErrorBoundary<P extends object>(Wrapped: ComponentType<P>, area?: string): ComponentType<P> {
  const Guarded = (props: P) => (
    <GlobalErrorBoundary area={area}>
      <Wrapped {...props} />
    </GlobalErrorBoundary>
  )
  Guarded.displayName = `withErrorBoundary(${Wrapped.displayName || Wrapped.name || 'Component'})`
  return Guarded
}
