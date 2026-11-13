/**
 * Pedir una página que ya no existe (por ejemplo la 2 de algo que solo tiene 1 fila) no es un error: es una página vacía.
 * PostgREST (lo que hay debajo de Supabase) contesta "Requested range not satisfiable" (PGRST103, HTTP 416) cuando el
 * desplazamiento pasa del final, y si ese error se deja subir el servidor responde 500. El feed pide la página siguiente
 * para saber si hay más, así que ese 500 se repetía en cada página hasta el infinito.
 */
export function isRangeNotSatisfiable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: string; message?: string }
  return code === 'PGRST103' || /range not satisfiable/i.test(message ?? '')
}
