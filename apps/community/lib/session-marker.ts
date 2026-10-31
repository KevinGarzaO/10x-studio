/**
 * Una marca de "este navegador ya tuvo una sesión iniciada". Sirve para distinguir, cuando se muestra el aviso de registro, a quien
 * NUNCA ha entrado en este navegador de a quien entró y perdió la sesión (la causa que queremos medir). Se pone al guardar una sesión
 * y solo se quita cuando la persona cierra sesión a propósito; si el navegador borra todo el almacenamiento, se pierde junto con la sesión.
 *
 * Está en su propio archivo (y no en session.ts) para que las pantallas puedan leerla sin depender de toda la lógica de la sesión.
 */
const KEY = 'avo_had_session'

export function markSessionKnown(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // sin almacenamiento no se puede recordar
  }
}

export function forgetSessionMarker(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nada
  }
}

export function hadSessionBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
